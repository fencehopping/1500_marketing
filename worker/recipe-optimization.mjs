const DEFAULT_SCORING_VERSION = 1;

const fieldAliases = {
  calories: ["calories_per_serving", "caloriesPerServing"],
  protein: ["protein_per_serving", "proteinPerServing"],
  carbs: ["carbs_per_serving", "carbsPerServing"],
  fiber: ["fiber_per_serving", "fiberPerServing"],
  sugar: ["sugar_per_serving", "sugarPerServing"],
  added_sugar: ["added_sugar_per_serving", "addedSugarPerServing"],
  fat: ["fat_per_serving", "fatPerServing"],
  saturated_fat: ["saturated_fat_per_serving", "saturatedFatPerServing"],
  sodium: ["sodium_mg_per_serving", "sodiumMgPerServing"],
  cholesterol: ["cholesterol_mg_per_serving", "cholesterolMgPerServing"],
  potassium: ["potassium_mg_per_serving", "potassiumMgPerServing"],
  calcium: ["calcium_mg_per_serving", "calciumMgPerServing"],
  iron: ["iron_mg_per_serving", "ironMgPerServing"],
  magnesium: ["magnesium_mg_per_serving", "magnesiumMgPerServing"],
  zinc: ["zinc_mg_per_serving", "zincMgPerServing"],
  selenium: ["selenium_mcg_per_serving", "seleniumMcgPerServing"],
  vitamin_a: ["vitamin_a_mcg_per_serving", "vitaminAMcgPerServing"],
  vitamin_c: ["vitamin_c_mg_per_serving", "vitaminCMgPerServing"],
  vitamin_d: ["vitamin_d_mcg_per_serving", "vitaminDMcgPerServing"],
  vitamin_e: ["vitamin_e_mg_per_serving", "vitaminEMgPerServing"],
  vitamin_k: ["vitamin_k_mcg_per_serving", "vitaminKMcgPerServing"],
  folate: ["folate_mcg_per_serving", "folateMcgPerServing"],
  omega_3: ["omega_3_g_per_serving", "omega3GPerServing"],
  serving_weight: ["serving_weight_grams", "servingWeightGrams"],
};

export function scoreRecipeAgainstFilter(recipe, filter) {
  const definition = objectValue(filter.scoring_definition ?? filter.scoringDefinition);
  const mode = String(filter.scoring_mode ?? filter.scoringMode ?? "heuristic");
  const context = recipeContext(recipe);
  const result = scoreDefinition(mode, definition, context);
  const required = arrayValue(filter.minimum_nutrition_data_required ?? filter.minimumNutritionDataRequired);
  const known = required.filter((field) => context.values[field] != null).length;
  const nutritionCompleteness = required.length ? known / required.length : result.evidenceCoverage;
  const confidence = clamp01((result.confidence * 0.65) + (nutritionCompleteness * 0.35));
  return {
    score: round(clamp(result.score, 0, 100), 2),
    confidence: round(confidence, 3),
    reasons: [...new Set(result.reasons.filter(Boolean))].slice(0, 5),
    inputs: result.inputs,
    scoringVersion: Number(filter.scoring_version ?? filter.scoringVersion) || DEFAULT_SCORING_VERSION,
  };
}

export function scoreRecipeAgainstFilters(recipe, filters) {
  return filters.map((filter) => ({
    filterID: filter.id,
    slug: filter.slug,
    ...scoreRecipeAgainstFilter(recipe, filter),
  }));
}

export function combineFilterScores(scores, weights = {}, weaknessPenalty = 0.25) {
  const valid = scores.filter((item) => Number.isFinite(Number(item.score)));
  if (!valid.length) return { score: 0, confidence: 0, weakestScore: 0 };
  const totalWeight = valid.reduce((sum, item) => sum + positiveWeight(weights[item.slug]), 0);
  const average = valid.reduce((sum, item) => sum + (Number(item.score) * positiveWeight(weights[item.slug])), 0) / totalWeight;
  const confidence = valid.reduce((sum, item) => sum + (Number(item.confidence) * positiveWeight(weights[item.slug])), 0) / totalWeight;
  const weakestScore = Math.min(...valid.map((item) => Number(item.score)));
  const score = average - ((average - weakestScore) * clamp(Number(weaknessPenalty), 0, 0.75));
  return { score: round(clamp(score, 0, 100), 2), confidence: round(clamp01(confidence), 3), weakestScore: round(weakestScore, 2) };
}

function scoreDefinition(mode, definition, context) {
  if (mode === "threshold" || mode === "inverse_threshold" || mode === "range") {
    return scoreNumeric({ ...definition, mode }, context);
  }
  if (mode === "composite") {
    const components = arrayValue(definition.components);
    const available = components
      .map((component) => ({ component, result: scoreComponent(component, context) }))
      .filter((item) => item.result.available);
    if (!available.length) return emptyResult();
    const totalWeight = available.reduce((sum, item) => sum + positiveWeight(item.component.weight), 0);
    const score = available.reduce((sum, item) => sum + (item.result.score * positiveWeight(item.component.weight)), 0) / totalWeight;
    return {
      score,
      confidence: available.reduce((sum, item) => sum + (item.result.confidence * positiveWeight(item.component.weight)), 0) / totalWeight,
      evidenceCoverage: available.length / Math.max(components.length, 1),
      reasons: available.filter((item) => item.result.score >= Number(item.component.reasonThreshold ?? 60)).sort((a, b) => b.result.score - a.result.score).map((item) => item.result.reason),
      inputs: Object.assign({}, ...available.map((item) => item.result.inputs)),
    };
  }
  if (mode === "boolean") return scoreBoolean(definition, context);
  return scoreHeuristic(definition, context);
}

function scoreComponent(component, context) {
  const mode = String(component.mode ?? "threshold");
  if (mode === "heuristic" || mode === "boolean") {
    const result = scoreDefinition(mode, component, context);
    return { ...result, available: result.confidence > 0, reason: component.reason ?? result.reasons[0] ?? "Recipe characteristics match" };
  }
  const result = scoreNumeric(component, context);
  return { ...result, available: result.confidence > 0, reason: component.reason ?? numericReason(component, context) };
}

function scoreNumeric(definition, context) {
  const field = String(definition.field ?? "");
  const value = context.values[field];
  if (value == null) return emptyResult();
  const mode = String(definition.mode ?? "threshold");
  let score = 0;
  if (mode === "inverse_threshold") {
    const target = Number(definition.target ?? 0);
    const ceiling = Number(definition.ceiling ?? Math.max(target * 2, target + 1));
    score = value <= target ? 100 : 100 * (ceiling - value) / Math.max(ceiling - target, 1);
  } else if (mode === "range") {
    const minimum = Number(definition.minimum ?? definition.min ?? 0);
    const maximum = Number(definition.maximum ?? definition.max ?? minimum);
    const outerMinimum = Number(definition.outerMinimum ?? Math.max(0, minimum * 0.5));
    const outerMaximum = Number(definition.outerMaximum ?? Math.max(maximum * 1.5, maximum + 1));
    score = value >= minimum && value <= maximum
      ? 100
      : value < minimum
        ? 100 * (value - outerMinimum) / Math.max(minimum - outerMinimum, 1)
        : 100 * (outerMaximum - value) / Math.max(outerMaximum - maximum, 1);
  } else {
    const target = Number(definition.target ?? 1);
    const floor = Number(definition.floor ?? 0);
    score = value >= target ? 100 : 100 * (value - floor) / Math.max(target - floor, 1);
  }
  return {
    score: clamp(score, 0, 100),
    confidence: 1,
    evidenceCoverage: 1,
    reasons: [definition.reason ?? numericReason(definition, context)],
    inputs: { [field]: round(value, 3) },
  };
}

function scoreBoolean(definition, context) {
  const keywords = arrayValue(definition.keywords).map(lower);
  const excluded = arrayValue(definition.excludeKeywords).map(lower);
  const haystack = context.haystack;
  const matches = keywords.filter((keyword) => haystack.includes(keyword));
  const exclusions = excluded.filter((keyword) => haystack.includes(keyword));
  const truth = (keywords.length === 0 || (definition.match === "all" ? matches.length === keywords.length : matches.length > 0)) && exclusions.length === 0;
  return {
    score: truth ? Number(definition.trueScore ?? 100) : Number(definition.falseScore ?? 0),
    confidence: keywords.length ? Math.min(1, 0.55 + (matches.length / keywords.length) * 0.45) : 0.5,
    evidenceCoverage: keywords.length ? matches.length / keywords.length : 0.5,
    reasons: truth ? [definition.reason ?? `Includes ${matches.slice(0, 3).join(", ")}`] : [],
    inputs: { keywordMatches: matches, keywordExclusions: exclusions },
  };
}

function scoreHeuristic(definition, context) {
  const keywords = arrayValue(definition.keywords).map(lower);
  const matches = keywords.filter((keyword) => context.haystack.includes(keyword));
  const excluded = arrayValue(definition.excludeKeywords).map(lower);
  const exclusions = excluded.filter((keyword) => context.haystack.includes(keyword));
  const criteria = [];
  if (keywords.length) criteria.push(Math.min(100, (matches.length / Math.max(Number(definition.keywordTarget ?? 2), 1)) * 100));
  if (definition.maxMinutes != null) criteria.push(context.values.total_minutes <= Number(definition.maxMinutes) ? 100 : 0);
  if (definition.maxIngredients != null) criteria.push(context.values.ingredient_count <= Number(definition.maxIngredients) ? 100 : 0);
  if (definition.mealTypes) {
    const requested = arrayValue(definition.mealTypes).map(lower);
    criteria.push(requested.some((type) => context.mealTypes.includes(type)) ? 100 : 0);
  }
  const base = criteria.length ? criteria.reduce((sum, value) => sum + value, 0) / criteria.length : 0;
  const score = exclusions.length ? Math.min(base, 25) : base;
  return {
    score,
    confidence: criteria.length ? Math.min(0.9, 0.5 + criteria.length * 0.1) : 0.25,
    evidenceCoverage: criteria.length ? Math.min(1, criteria.length / 2) : 0.25,
    reasons: matches.length ? [definition.reason ?? `Includes ${matches.slice(0, 3).join(", ")}`] : (score >= 80 ? [definition.reason ?? "Recipe metadata matches"] : []),
    inputs: { keywordMatches: matches, keywordExclusions: exclusions, total_minutes: context.values.total_minutes, ingredient_count: context.values.ingredient_count },
  };
}

function recipeContext(recipe) {
  const values = {};
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    values[field] = firstNumber(recipe, aliases);
  }
  const calories = values.calories;
  values.net_carbs = values.carbs == null ? null : Math.max(0, values.carbs - (values.fiber ?? 0));
  values.protein_per_100_calories = calories > 0 && values.protein != null ? values.protein * 100 / calories : null;
  values.fiber_per_100_calories = calories > 0 && values.fiber != null ? values.fiber * 100 / calories : null;
  values.carbohydrate_calorie_percent = calories > 0 && values.carbs != null ? values.carbs * 4 * 100 / calories : null;
  values.protein_calorie_percent = calories > 0 && values.protein != null ? values.protein * 4 * 100 / calories : null;
  values.volume_per_100_calories = calories > 0 && values.serving_weight != null ? values.serving_weight * 100 / calories : null;
  values.total_minutes = Math.max(0, Number(recipe.prep_minutes ?? recipe.prepMinutes ?? 0)) + Math.max(0, Number(recipe.cook_minutes ?? recipe.cookMinutes ?? 0));
  const ingredients = arrayValue(recipe.ingredients);
  values.ingredient_count = ingredients.length;
  const ingredientText = ingredients.map((item) => typeof item === "string" ? item : `${item?.quantity ?? ""} ${item?.text ?? item?.name ?? ""}`).join(" ");
  const mealTypes = arrayValue(recipe.meal_types ?? recipe.mealTypes).map(lower);
  const haystack = lower(`${recipe.title ?? ""} ${recipe.summary ?? ""} ${ingredientText} ${recipe.notes ?? ""}`);
  return { values, mealTypes, haystack };
}

function numericReason(definition, context) {
  const field = String(definition.field ?? "nutrient");
  const value = context.values[field];
  return `${field.replaceAll("_", " ")}: ${round(value, 1)}`;
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function emptyResult() { return { score: 0, confidence: 0, evidenceCoverage: 0, reasons: [], inputs: {} }; }
function objectValue(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function arrayValue(value) { return Array.isArray(value) ? value : []; }
function lower(value) { return String(value).toLowerCase(); }
function positiveWeight(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 1; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum)); }
function clamp01(value) { return clamp(value, 0, 1); }
function round(value, precision) { const factor = 10 ** precision; return Math.round((Number(value) + Number.EPSILON) * factor) / factor; }
