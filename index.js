import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import * as path from "path";
import { dirname } from "path";
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
const __dirname = dirname(fileURLToPath(import.meta.url));
app.set("views", path.join(__dirname, "views"));
app.get("/", (req, res) => res.render("index.ejs"));
app.post("/get-pokemon", handlePokemonRequest);

// Start server
app.listen(port, () => console.log(`Server running on port: ${port}`));

/**
 * Handle Pokemon search request
 */
async function handlePokemonRequest(req, res) {
  try {
    const pokemonName = req.body.pokemon.toLowerCase().trim();

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
 * Fetch all Pokemon data from the API
 */
async function fetchPokemonData(pokemonName) {
  // Get basic Pokemon data
  const { data: pokemon } = await axios.get(API.POKEMON + pokemonName);

  // Extract types
  const types = pokemon.types.map((type) => type.type.name);

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
