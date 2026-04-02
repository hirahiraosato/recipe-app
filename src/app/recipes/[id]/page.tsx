import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RecipeDetailClient from "./RecipeDetailClient";

export default async function RecipeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
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
  const { data: ingredients, error: ingError } = await supabase
    .from("ingredients")
    .select("*")
    .eq("recipe_id", params.id)
    .order("order_index");
  if (ingError) console.error("ingredients fetch error:", ingError.message, ingError.code, ingError.details);

  // 手順取得
  const { data: steps } = await supabase
    .from("recipe_steps")
    .select("*")
    .eq("recipe_id", params.id)
    .order("step_number");

  // 家族メンバー取得（人数計算用）
  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  return (
    <>
      {ingError && (
        <div style={{background:"#fee",padding:"8px",fontSize:"12px",wordBreak:"break-all"}}>
          材料取得エラー: {ingError.message} / code: {ingError.code}
        </div>
      )}
      <RecipeDetailClient
        recipe={recipe}
        ingredients={ingredients || []}
        steps={steps || []}
        familyMembers={familyMembers || []}
      />
    </>
  );
}
