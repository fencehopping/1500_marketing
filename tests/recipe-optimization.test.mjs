import assert from "node:assert/strict";
import { combineFilterScores, scoreRecipeAgainstFilter } from "../worker/recipe-optimization.mjs";

const filters = {
  highProtein: filter("high-protein", "threshold", { field: "protein_per_100_calories", target: 8, floor: 3 }, ["calories", "protein"]),
  lowCarb: filter("low-carb", "inverse_threshold", { field: "net_carbs", target: 20, ceiling: 50 }, ["carbs", "fiber"]),
  highFiber: filter("high-fiber", "threshold", { field: "fiber", target: 8, floor: 2 }, ["fiber"]),
  lowSodium: filter("low-sodium", "inverse_threshold", { field: "sodium", target: 450, ceiling: 1000 }, ["sodium"]),
  immune: filter("immune-support", "composite", { components: [
    { field: "vitamin_c", target: 45, weight: 0.25 }, { field: "vitamin_a", target: 450, weight: 0.15 },
    { field: "vitamin_d", target: 10, weight: 0.1 }, { field: "zinc", target: 5, weight: 0.15 },
    { field: "selenium", target: 28, weight: 0.1 }, { field: "protein", target: 25, weight: 0.15 },
    { mode: "heuristic", keywords: ["berries", "pepper", "spinach"], keywordTarget: 2, weight: 0.1 },
  ] }, ["vitamin_c", "vitamin_a", "vitamin_d", "zinc", "selenium", "protein"]),
  healthyHair: filter("healthy-hair", "composite", { components: [
    { field: "protein", target: 25, weight: 0.3 }, { field: "iron", target: 7, weight: 0.2 },
    { field: "zinc", target: 5, weight: 0.2 }, { field: "selenium", target: 28, weight: 0.1 },
    { field: "omega_3", target: 0.8, weight: 0.1 }, { field: "vitamin_c", target: 45, weight: 0.1 },
  ] }, ["protein", "iron", "zinc", "selenium", "omega_3", "vitamin_c"]),
  steadyEnergy: filter("steady-energy", "composite", { components: [
    { field: "protein", target: 25, weight: 0.3 }, { field: "fiber", target: 8, weight: 0.3 },
    { field: "sugar", mode: "inverse_threshold", target: 8, ceiling: 25, weight: 0.25 },
    { field: "fat", mode: "range", minimum: 8, maximum: 24, outerMaximum: 45, weight: 0.15 },
  ] }, ["protein", "fiber", "sugar", "fat"]),
  heartHealthy: filter("heart-healthy", "composite", { components: [
    { field: "saturated_fat", mode: "inverse_threshold", target: 4, ceiling: 12, weight: 0.3 },
    { field: "sodium", mode: "inverse_threshold", target: 500, ceiling: 1200, weight: 0.25 },
    { field: "fiber", target: 8, weight: 0.2 }, { field: "omega_3", target: 0.8, weight: 0.15 },
    { field: "potassium", target: 700, weight: 0.1 },
  ] }, ["saturated_fat", "sodium", "fiber", "omega_3", "potassium"]),
  fatLoss: filter("fat-loss-friendly", "composite", { components: [
    { field: "calories", mode: "inverse_threshold", target: 400, ceiling: 750, weight: 0.35 },
    { field: "protein_per_100_calories", target: 7, weight: 0.3 },
    { field: "fiber_per_100_calories", target: 2.5, weight: 0.25 },
    { field: "volume_per_100_calories", target: 85, weight: 0.1 },
  ] }, ["calories", "protein", "fiber", "serving_weight"]),
  nutrientDense: filter("nutrient-dense", "composite", { components: [
    { field: "protein_per_100_calories", target: 7, weight: 0.2 }, { field: "fiber_per_100_calories", target: 2.5, weight: 0.2 },
    { field: "potassium", target: 700, weight: 0.15 }, { field: "iron", target: 5, weight: 0.15 },
    { field: "vitamin_c", target: 45, weight: 0.15 }, { field: "calcium", target: 300, weight: 0.15 },
  ] }, ["calories", "protein", "fiber", "potassium", "iron", "vitamin_c", "calcium"]),
};

const salmonBowl = recipe({
  calories: 470, protein: 42, carbs: 39, fiber: 10, sugar: 5, fat: 17,
  sodium: 390, saturatedFat: 3, potassium: 980, calcium: 220, iron: 6,
  zinc: 5.5, selenium: 45, vitaminA: 520, vitaminC: 72, vitaminD: 12,
  omega3: 1.4, servingWeight: 520,
  ingredients: ["salmon", "spinach", "red pepper", "lentils", "berries"],
});
const sugaryPasta = recipe({
  calories: 820, protein: 18, carbs: 118, fiber: 3, sugar: 28, fat: 30,
  sodium: 1480, saturatedFat: 13, potassium: 280, calcium: 90, iron: 2,
  zinc: 1.5, selenium: 8, vitaminA: 70, vitaminC: 4, vitaminD: 0,
  omega3: 0.05, servingWeight: 390,
  ingredients: ["white pasta", "sweet sauce", "cheese"],
});
const chickenGreens = recipe({
  calories: 360, protein: 45, carbs: 18, fiber: 9, sugar: 4, fat: 11,
  sodium: 320, saturatedFat: 2, potassium: 850, calcium: 180, iron: 5,
  zinc: 4.8, selenium: 32, vitaminA: 600, vitaminC: 65, vitaminD: 2,
  omega3: 0.3, servingWeight: 480,
  ingredients: ["chicken breast", "spinach", "broccoli", "red pepper"],
});

for (const [name, definition] of Object.entries(filters)) {
  const strong = scoreRecipeAgainstFilter(name === "healthyHair" ? salmonBowl : chickenGreens, definition);
  const weak = scoreRecipeAgainstFilter(sugaryPasta, definition);
  assert.ok(strong.score > weak.score, `${name} should rank the nutrient-dense recipe above sugary pasta (${strong.score} vs ${weak.score})`);
  assert.ok(strong.score >= 0 && strong.score <= 100);
  assert.ok(strong.confidence >= 0 && strong.confidence <= 1);
  assert.ok(Array.isArray(strong.reasons));
}

const lowCarb = scoreRecipeAgainstFilter(chickenGreens, filters.lowCarb);
const highProtein = scoreRecipeAgainstFilter(chickenGreens, filters.highProtein);
const weakDimension = { slug: "weak", score: 10, confidence: 1 };
const combined = combineFilterScores([
  { slug: "low-carb", ...lowCarb },
  { slug: "high-protein", ...highProtein },
  weakDimension,
]);
const plainAverage = (lowCarb.score + highProtein.score + weakDimension.score) / 3;
assert.ok(combined.score < plainAverage, "combined scoring should penalize a weak selected goal");
assert.equal(combineFilterScores([]).score, 0);

const incomplete = scoreRecipeAgainstFilter(recipe({ calories: 300, protein: 25, carbs: 20, fiber: 7, sugar: 4, fat: 8 }), filters.immune);
assert.ok(incomplete.confidence < scoreRecipeAgainstFilter(chickenGreens, filters.immune).confidence, "missing micronutrients should lower confidence");

console.log("recipe optimization scoring tests passed");

function filter(slug, scoringMode, scoringDefinition, minimumNutritionDataRequired) {
  return { id: slug, slug, scoringMode, scoringDefinition, minimumNutritionDataRequired, scoringVersion: 1 };
}

function recipe(values) {
  return {
    title: "Test recipe",
    caloriesPerServing: values.calories,
    proteinPerServing: values.protein,
    carbsPerServing: values.carbs,
    fiberPerServing: values.fiber,
    sugarPerServing: values.sugar,
    fatPerServing: values.fat,
    sodiumMgPerServing: values.sodium,
    saturatedFatPerServing: values.saturatedFat,
    potassiumMgPerServing: values.potassium,
    calciumMgPerServing: values.calcium,
    ironMgPerServing: values.iron,
    zincMgPerServing: values.zinc,
    seleniumMcgPerServing: values.selenium,
    vitaminAMcgPerServing: values.vitaminA,
    vitaminCMgPerServing: values.vitaminC,
    vitaminDMcgPerServing: values.vitaminD,
    omega3GPerServing: values.omega3,
    servingWeightGrams: values.servingWeight,
    ingredients: (values.ingredients ?? []).map((text) => ({ text })),
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 20,
  };
}
