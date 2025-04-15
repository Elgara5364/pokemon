import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import * as path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = 3000;

// API endpoints
const API = {
  POKEMON: "https://pokeapi.co/api/v2/pokemon/",
  SPECIES: "https://pokeapi.co/api/v2/pokemon-species/",
  ABILITY: "https://pokeapi.co/api/v2/ability/",
};

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));

// Route definitions
app.set("view engine", "ejs");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set("views", path.join(__dirname, "views"));
app.get("/", async (req, res) => {
  const { result, pokemonShortData } = await handleAllPokemonData();
  res.render("home.ejs", { result, pokemonShortData }); //kalau tidak ada curly brace maka data tidak akan kekirim
});

// Start server
app.listen(port, () => console.log(`Server running on port: ${port}`));

async function handleAllPokemonData() {
  try {
    const { data: result } = await axios.get(API.POKEMON);
    const pokemonShortData = await Promise.all(
      result.results.map(async (pokemon) => {
        const fetchImgPokemon = await axios.get(pokemon.url);
        // console.log(fetchImgPokemon.data.types[0]);
        const data = {
          imgPokemon:
            fetchImgPokemon.data.sprites.other["official-artwork"]
              .front_default,
          id: fetchImgPokemon.data.id,
          types: fetchImgPokemon.data.types.map((type) => {
            return type.type.name;
          }),
        };
        return data;
      })
    );
    // console.log(pokemonShortData);
    return { result, pokemonShortData };
  } catch (error) {
    return { data: null };
  }
}
app.post("/get-pokemon", handlePokemonRequest);

app.get("/get-pokemon/:pokemon", handlePokemonRequest);
/**
 * Handle Pokemon search request
 */
async function handlePokemonRequest(req, res) {
  try {
    const pokemonName =
      req.params.pokemon || req.body.pokemon.toLowerCase().trim();
    // console.log(pokemonName);

    // Fetch all Pokemon data in parallel
    const pokemonData = await fetchPokemonData(pokemonName);
    // console.log(pokemonData);

    // Render the view with all data
    res.render("index.ejs", pokemonData);
  } catch (error) {
    console.error("Error fetching Pokemon data:", error.message);
    res.render("index.ejs", {
      error: error.response?.data?.message || "Pokemon not found",
    });
  }
}

/**
 * Fetch Spesific Pokemon data from the API
 */
async function fetchPokemonData(pokemonName) {
  // Get basic Pokemon data
  const pokemon = await fetchPokemon(pokemonName);
  const pokemonDescription = await fetchPokemonDesc(pokemon.id);

  // Extract types
  const types = await fetchTypesPokemon(pokemon);

  // Extract and process abilities
  const abilities = pokemon.abilities.map((item) => item.ability.name);
  const abilityUrls = pokemon.abilities.map((item) => item.ability.url);
  const abilityDescriptions = await fetchAbilityDescriptions(abilityUrls);

  // Extract stats
  const stats = pokemon.stats.map((stat) => ({
    name: stat.stat.name,
    value: stat.base_stat,
    // Calculate percentage for visualization (assuming max stat is 255)
    percentage: Math.min(Math.round((stat.base_stat / 255) * 100), 100),
  }));

  // Get evolution chain
  const evolutionStages = await fetchEvolutionChain(pokemon.id);

  return {
    pokemon,
    pokemonDescription,
    types,
    ability: abilities,
    abilityDescriptions,
    evolutionStages,
    stats,
  };
}

/**
 * Fetch ability descriptions in English
 */
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

/**
 * Fetch evolution chain for a Pokemon
 */
async function fetchEvolutionChain(pokemonId) {
  // Get species data which contains evolution chain URL
  const { data: speciesData } = await axios.get(API.SPECIES + pokemonId);

  // Get evolution chain data
  const { data: evolutionData } = await axios.get(
    speciesData.evolution_chain.url
  );

  // Extract evolution stages
  return extractEvolutionStages(evolutionData.chain);
}

/**
 * Extract ordered evolution stages from chain data
 */
function extractEvolutionStages(chain) {
  const stages = [];
  let current = chain;

  // Follow the chain until there are no more evolutions
  while (current) {
    stages.push(current.species.name);
    // Move to the next evolution (if any)
    current = current.evolves_to[0];
  }

  return stages;
}

async function fetchPokemonDesc(pokemonId) {
  const { data } = await axios.get(API.SPECIES + pokemonId);
  const pokemonDescription = data.flavor_text_entries.find((entry) => {
    entry.version.name === "emerald";
    return entry;
  });

  return pokemonDescription ? pokemonDescription.flavor_text : "null";
}

async function fetchTypesPokemon(pokemon) {
  const types = pokemon.types.map((type) => type.type.name);
  return types;
}

async function fetchPokemon(pokemonName) {
  const { data: pokemon } = await axios.get(API.POKEMON + pokemonName);
  return pokemon;
}
