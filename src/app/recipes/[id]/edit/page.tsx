import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EditRecipeClient from "./EditRecipeClient";

export default async function EditRecipePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: recipe } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!recipe) redirect("/recipes");

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .eq("recipe_id", params.id)
    .order("order_index");

  const { data: steps } = await supabase
    .from("recipe_steps")
    .select("*")
    .eq("recipe_id", params.id)
    .order("step_number");

  // 食材名のオートコンプリート候補（ユーザーが登録済みの全食材名を重複なしで取得）
  const { data: allIngredientsRaw } = await supabase
    .from("ingredients")
    .select("name")
    .order("name");
  const allIngredientNames = [...new Set((allIngredientsRaw || []).map((i) => i.name).filter(Boolean))];

  return (
    <EditRecipeClient
      recipe={recipe}
      ingredients={ingredients || []}
      steps={steps || []}
      allIngredientNames={allIngredientNames}
    />
  );
}
