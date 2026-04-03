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

// 指定日のレシピIDから食材を買い物リストへ一括追加
export async function addIngredientsToShopping(
  recipeIds: string[],
  sourceDayLabel: string
) {
  if (recipeIds.length === 0) return { error: "レシピがありません" };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  // 対象レシピの食材を取得
  const { data: ingredients, error: fetchError } = await supabase
    .from("ingredients")
    .select("name, quantity, unit, category, recipe_id, recipes(title)")
    .in("recipe_id", recipeIds);

  if (fetchError) return { error: fetchError.message };
  if (!ingredients || ingredients.length === 0) return { error: "食材が登録されていません" };

  // shopping_itemsに挿入
  const rows = ingredients.map((ing) => ({
    user_id: user.id,
    ingredient_name: ing.name,
    quantity: ing.quantity != null ? String(ing.quantity) : null,
    unit: ing.unit ?? null,
    category: ing.category ?? null,
    is_checked: false,
    source_recipe: (ing.recipes as { title: string } | null)?.title ?? null,
    week_start_date: sourceDayLabel,
  }));

  const { error: insertError } = await supabase.from("shopping_items").insert(rows);
  if (insertError) return { error: insertError.message };

  revalidatePath("/shopping");
  return { data: ingredients.length };
}
