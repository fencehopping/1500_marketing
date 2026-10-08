import assert from "node:assert/strict";
import { formatIngredientsText, parseIngredientsText } from "../src/admin/recipeIngredientText.ts";

const pastedList = "1 cup flour\r\n2 eggs\r\nSalt and pepper to taste\r\n";
assert.deepEqual(parseIngredientsText(pastedList), [
  { quantity: "", text: "1 cup flour", calories: 0 },
  { quantity: "", text: "2 eggs", calories: 0 },
  { quantity: "", text: "Salt and pepper to taste", calories: 0 },
]);
assert.equal(formatIngredientsText(parseIngredientsText(pastedList)), "1 cup flour\n2 eggs\nSalt and pepper to taste");

assert.deepEqual(parseIngredientsText("1 lb | chicken breast | 750\n2 tbsp | olive oil"), [
  { quantity: "1 lb", text: "chicken breast", calories: 750 },
  { quantity: "2 tbsp", text: "olive oil", calories: 0 },
]);
assert.equal(
  formatIngredientsText(parseIngredientsText("1 lb | chicken breast | 750\n2 tbsp | olive oil")),
  "1 lb | chicken breast | 750\n2 tbsp | olive oil | 0",
);

console.log("recipe ingredient text tests passed");
