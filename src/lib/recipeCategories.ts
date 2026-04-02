export const RECIPE_CATEGORIES = [
  "主菜（肉）",
  "主菜（魚）",
  "主菜（卵・豆腐）",
  "副菜",
  "汁物・スープ",
  "ご飯・丼",
  "麺・パスタ",
  "パン・粉もの",
  "サラダ",
  "お菓子・デザート",
  "その他",
] as const;

export type RecipeCategory = typeof RECIPE_CATEGORIES[number];
