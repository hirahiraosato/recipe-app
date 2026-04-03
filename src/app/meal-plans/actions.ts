"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addMealPlan(
  plannedDate: string,
  mealType: "breakfast" | "lunch" | "dinner",
  recipeId: string
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  const { data, error } = await supabase
    .from("meal_plans")
    .insert({ user_id: user.id, planned_date: plannedDate, meal_type: mealType, recipe_id: recipeId })
    .select(`id, planned_date, meal_type, note, recipes (id, title, image_url, cooking_time_minutes)`)
    .single();

  if (error) return { error: error.message };
  revalidatePath("/meal-plans");
  return { data };
}

export async function deleteMealPlan(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  const { error } = await supabase
    .from("meal_plans")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/meal-plans");
  return { data: true };
}

// 年齢から係数を計算（RecipeDetailClientと共通ロジック）
function getAgeCoefficient(birthDate: string | null): number {
  if (!birthDate) return 1.0;
  const today = new Date();
  const birth = new Date(birthDate);
  const age =
    today.getFullYear() - birth.getFullYear() -
    (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
      ? 1 : 0);
  if (age < 1) return 0.2;
  if (age <= 2) return 0.3;
  if (age <= 5) return 0.5;
  if (age <= 12) return 0.7;
  return 1.0;
}

// 指定日のレシピIDから食材を買い物リストへ一括追加
export async function addIngredientsToShopping(
  recipeIds: string[],
  sourceDayLabel: string
) {
  if (recipeIds.length === 0) return { error: "レシピがありません" };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  // 家族メンバーを取得して合計係数を計算
  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("birth_date, custom_coefficient")
    .eq("user_id", user.id);

  // 合計係数（カスタム設定優先、なければ年齢から計算）
  // 家族メンバー未設定の場合は後でレシピのservings_baseを使うためnullにする
  const totalCoefficient =
    familyMembers && familyMembers.length > 0
      ? familyMembers.reduce((sum, m) => {
          const coef =
            m.custom_coefficient != null
              ? m.custom_coefficient
              : getAgeCoefficient(m.birth_date);
          return sum + coef;
        }, 0)
      : null; // nullの場合は換算なし（元レシピ量をそのまま使う）

  // レシピIDの出現回数を集計（同レシピを複数登録した場合に対応）
  const recipeCountMap: Record<string, number> = {};
  for (const id of recipeIds) {
    recipeCountMap[id] = (recipeCountMap[id] ?? 0) + 1;
  }
  const uniqueRecipeIds = Object.keys(recipeCountMap);

  // 対象レシピの食材を取得（servings_baseも一緒に取得して換算に使う）
  const { data: ingredients, error: fetchError } = await supabase
    .from("ingredients")
    .select("name, amount, unit, category, recipe_id, recipes(title, servings_base)")
    .in("recipe_id", uniqueRecipeIds);

  if (fetchError) return { error: fetchError.message };
  if (!ingredients || ingredients.length === 0) return { error: "食材が登録されていません" };

  const rows = ingredients.map((ing) => {
    const count = recipeCountMap[ing.recipe_id] ?? 1;
    const recipe = ing.recipes as { title: string; servings_base: number } | null;
    const servingsBase = recipe?.servings_base ?? 1;

    // 家族換算倍率：家族係数合計 ÷ レシピ基本人数
    // 家族未設定の場合は倍率1（元レシピ量のまま）
    const multiplier =
      totalCoefficient != null ? totalCoefficient / servingsBase : 1;

    const finalAmount =
      ing.amount != null ? ing.amount * count * multiplier : null;

    return {
      user_id: user.id,
      ingredient_name: ing.name,
      quantity: finalAmount != null ? String(finalAmount) : null,
      unit: ing.unit ?? null,
      category: ing.category ?? null,
      is_checked: false,
      source_recipe: recipe?.title ?? null,
      week_start_date: null,
    };
  });

  const { error: insertError } = await supabase.from("shopping_items").insert(rows);
  if (insertError) return { error: insertError.message };

  revalidatePath("/shopping");
  return { data: ingredients.length };
}
