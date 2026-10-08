export type IngredientTextEntry = {
  id?: string;
  text: string;
  quantity: string;
  calories: number;
};

export function formatIngredientsText(ingredients: IngredientTextEntry[]) {
  return ingredients.map((ingredient) => {
    if (!ingredient.quantity && ingredient.calories === 0) return ingredient.text;
    return `${ingredient.quantity} | ${ingredient.text} | ${ingredient.calories}`;
  }).join("\n");
}

export function parseIngredientsText(value: string): IngredientTextEntry[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());

      // Most copied recipe lists contain one complete ingredient per line.
      // Treat those lines as ingredient text instead of as a quantity.
      if (parts.length === 1) {
        return { quantity: "", text: parts[0], calories: 0 };
      }

      const quantity = parts.shift() ?? "";
      const calories = parts.length > 1 ? parts.pop() ?? "0" : "0";
      return {
        quantity,
        text: parts.join(" | "),
        calories: Math.max(0, Number(calories) || 0),
      };
    });
}
