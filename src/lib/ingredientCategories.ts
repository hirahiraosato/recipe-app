export const INGREDIENT_CATEGORIES = [
  "野菜・果物",
  "肉類",
  "魚介類",
  "乳製品・卵",
  "豆腐・大豆製品",
  "缶詰・瓶詰",
  "乾物・米・麺",
  "調味料・油",
  "冷凍食品",
  "パン・粉類",
  "飲料",
  "お菓子",
  "その他",
] as const;

export type IngredientCategory = typeof INGREDIENT_CATEGORIES[number];
