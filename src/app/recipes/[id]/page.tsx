import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RecipeDetailClient from "./RecipeDetailClient";

export default async function RecipeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // レシピ取得
  const { data: recipe } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!recipe) redirect("/recipes");

  // 材料取得
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .eq("recipe_id", params.id)
    .order("order_index");

  // 家族メンバー取得（人数計算用）
  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  return (
    <RecipeDetailClient
      recipe={recipe}
      ingredients={ingredients || []}
      familyMembers={familyMembers || []}
    />
  );
}
