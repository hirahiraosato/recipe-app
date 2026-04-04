export const RECIPE_CUISINES = [
  "和食",
  "洋食",
  "中華",
  "エスニック",
  "その他",
] as const;

export type RecipeCuisine = typeof RECIPE_CUISINES[number];
