import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import * as path from "path";
import { fileURLToPath } from "url";
import session from "express-session";

const app = express();
const port = 3000;

// API endpoints
const API = {
  TYPE: "https://pokeapi.co/api/v2/type/",
  POKEMON: "https://pokeapi.co/api/v2/pokemon/",
  SPECIES: "https://pokeapi.co/api/v2/pokemon-species/",
  ABILITY: "https://pokeapi.co/api/v2/ability/",
};

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({ secret: "pokemonSecret", resave: false, saveUninitialized: true })
);

// Route definitions
app.set("view engine", "ejs");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// HOMEPAGE
app.get("/", async (req, res) => {
  const pokemonType = req.query.type || null;
  const page = parseInt(req.query.page) || 1;
  const limit = 20; // Number of Pokémon per page
  const { result, pokemonShortData, totalPages } = await fetchAllPokemonData(
    page,
    limit,
    pokemonType
  );

  const pagination = getPagination(page, totalPages);

  res.render("home.ejs", {
    selectedType: pokemonType,
    result,
    pokemonShortData,
    currentPage: page,
    totalPages,
    pagination,
  });
});

// Start server
app.listen(port, () => console.log(`Server running on port: ${port}`));

// Fetch all Pokémon data with pagination
async function fetchAllPokemonData(page = 1, limit = 20, pokemonType) {
  try {
    const offset = (page - 1) * limit;

    if (!pokemonType) {
      const { data: result } = await axios.get(
        `${API.POKEMON}?offset=${offset}&limit=${limit}`
      );
      const totalPages = Math.ceil(result.count / limit);

      // Fetch all Pokémon details concurrently
      const pokemonShortData = await Promise.all(
        result.results.map(async (pokemon) => {
          const { data } = await axios.get(pokemon.url);
          return {
            imgPokemon: data.sprites.other["official-artwork"].front_default,
            id: data.id,
            types: data.types.map((type) => type.type.name),
          };
        })
      );

      return { result, pokemonShortData, totalPages };
    } else {
      const { data: results } = await axios.get(`${API.TYPE}` + pokemonType);

      const totalPages = Math.ceil(
        results.pokemon.filter((item) => item).length / limit
      );

      // Fetch all Pokémon details concurrently
      const pokemonShortData = await Promise.all(
        results.pokemon.map(async (pokemon) => {
          const { data } = await axios.get(pokemon.pokemon.url);
          return {
            imgPokemon: data.sprites.other["official-artwork"].front_default,
            id: data.id,
            types: data.types.map((type) => type.type.name),
          };
        })
      );

      return { result: { results }, pokemonShortData, totalPages };
    }
  } catch (error) {
    console.error("Error fetching all Pokémon data:", error.message);
    return { result: null, pokemonShortData: [], totalPages: 0 };
  }
}

// Handle Pokémon search request
app.post("/get-pokemon", handlePokemonRequest);
app.get("/get-pokemon/:pokemon", handlePokemonRequest);

async function handlePokemonRequest(req, res) {
  try {
    const pokemonName =
      req.params.pokemon || req.body.pokemon.toLowerCase().trim();

    const pokemonData = await fetchPokemonData(pokemonName);

    res.render("index.ejs", pokemonData);
  } catch (error) {
    console.error("Error fetching Pokémon data:", error.message);
    res.render("index.ejs", {
      error: error.response?.data?.message || "Pokémon not found",
    });
  }
}

// Fetch specific Pokémon data
async function fetchPokemonData(pokemonName) {
  const pokemon = await fetchPokemon(pokemonName);

  // Use Promise.all to fetch all data in parallel
  const [pokemonDescription, types, abilities, stats, evolutionStages] =
    await Promise.all([
      fetchPokemonDescription(pokemon.id),
      fetchTypes(pokemon),
      fetchAbilities(pokemon),
      fetchStats(pokemon),
      fetchEvolutionChain(pokemon.id),
    ]);

  return {
    pokemon,
    pokemonDescription,
    types,
    abilities,
    evolutionStages,
    stats,
  };
}

// Fetch Pokémon abilities and their descriptions
async function fetchAbilities(pokemon) {
  const abilityUrls = pokemon.abilities.map((item) => item.ability.url);
  const abilityDescriptions = await fetchAbilityDescriptions(abilityUrls);

  const dataAbility = pokemon.abilities.map((item, index) => ({
    ability: item.ability.name,
    description: abilityDescriptions[index],
  }));

  return { dataAbility };
}

// Fetch ability descriptions in English
async function fetchAbilityDescriptions(abilityUrls) {
  return Promise.all(
    abilityUrls.map(async (url) => {
      const { data } = await axios.get(url);
      const englishEffect = data.effect_entries.find(
        (entry) => entry.language.name === "en"
      );
      return englishEffect
        ? englishEffect.short_effect
        : "No description available";
    })
  );
}

// Fetch evolution chain for a Pokémon
async function fetchEvolutionChain(pokemonId) {
  const { data: speciesData } = await axios.get(`${API.SPECIES}${pokemonId}`);
  const { data: evolutionData } = await axios.get(
    speciesData.evolution_chain.url
  );
  return extractEvolutionStages(evolutionData.chain);
}

// Extract ordered evolution stages from chain data
function extractEvolutionStages(chain) {
  const stages = [];
  let current = chain;

  while (current) {
    stages.push(current.species.name);
    current = current.evolves_to[0];
  }

  return stages;
}

// Fetch Pokémon description
async function fetchPokemonDescription(pokemonId) {
  const { data } = await axios.get(`${API.SPECIES}${pokemonId}`);
  const descriptionEntry = data.flavor_text_entries.find(
    (entry) => entry.version.name === "emerald"
  );
  return descriptionEntry
    ? descriptionEntry.flavor_text
    : "No description available";
}

// Fetch Pokémon types
async function fetchTypes(pokemon) {
  return pokemon.types.map((type) => type.type.name);
}

// Fetch Pokémon data by name
async function fetchPokemon(pokemonName) {
  try {
    const { data } = await axios.get(`${API.POKEMON}${pokemonName}`);
    return data;
  } catch (error) {
    console.error("Terjadi kesalahan saat mengambil data Pokémon:", error);
    throw error;
  }
}

// Fetch Pokémon stats
async function fetchStats(pokemon) {
  return pokemon.stats.map((stat) => ({
    name: stat.stat.name,
    value: stat.base_stat,
    // Calculate percentage for visualization (assuming max stat is 255)
    percentage: Math.min(Math.round((stat.base_stat / 255) * 100), 100),
  }));
}

// Pagination logic
function getPagination(currentPage, totalPages) {
  const pagination = [];
  const maxPagesToShow = 2; // Number of pages to show around the current page

  // Always show the first page
  pagination.push(1);

  // Calculate the range of pages to show
  const startPage = Math.max(2, currentPage - maxPagesToShow);
  const endPage = Math.min(totalPages - 1, currentPage + maxPagesToShow);

  for (let i = startPage; i <= endPage; i++) {
    pagination.push(i);
  }

  // Always show the last page
  if (totalPages > 1) {
    pagination.push(totalPages);
  }

  return pagination;
}

//ROUTE to FAVORITE PAGE

app.post("/favorites", (req, res) => {
  req.session.favorites = req.body;
  res.json({ status: "ok" });
});

app.get("/favorites", async (req, res) => {
  try {
    const favorites = req.session.favorites || [];

    res.render("favorites.ejs", { favorites });
  } catch (error) {
    res.render("favorites.ejs", {
      error: error.response?.data?.message || "Pokémon not found",
    });
  }
});

app.get("/compare", (req, res) => {
  res.render("compare.ejs");
});

app.post("/compare", async (req, res) => {
  try {
    const pokemon1 = await axios.get(API.POKEMON + req.body.pokemon1);
    const pokemon2 = await axios.get(API.POKEMON + req.body.pokemon2);
    const pokemon1Stat = await fetchStats(pokemon1.data);
    const pokemon2Stat = await fetchStats(pokemon2.data);

    const abilityDesc1 = pokemon1.data.abilities.map(
      (ability) => ability.ability.url
    );
    const abilityDesc2 = pokemon2.data.abilities.map(
      (ability) => ability.ability.url
    );

    const desc1 = await fetchAbilityDescriptions(abilityDesc1);
    const desc2 = await fetchAbilityDescriptions(abilityDesc2);

    res.render("compare.ejs", {
      pokemon1,
      pokemon1Stat,
      pokemon2,
      pokemon2Stat,
      desc1,
      desc2,
    });
  } catch (error) {
    console.log(error.response?.data?.message || "Pokémon not found");
    res.render("compare.ejs", {
      error: error.response?.data?.message || "Pokémon not found",
    });
  }
});
