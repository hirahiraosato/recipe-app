import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RecipesClient from "./RecipesClient";

export default async function RecipesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: recipes } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  return <RecipesClient initialRecipes={recipes ?? []} />;
}
