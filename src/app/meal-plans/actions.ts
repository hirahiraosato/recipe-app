"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertMealPlan(
  plannedDate: string,
  mealType: "breakfast" | "lunch" | "dinner",
  recipeId: string
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  const { data, error } = await supabase
    .from("meal_plans")
    .upsert(
      { user_id: user.id, planned_date: plannedDate, meal_type: mealType, recipe_id: recipeId },
      { onConflict: "user_id,planned_date,meal_type" }
    )
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
