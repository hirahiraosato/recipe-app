import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MealPlansClient from "./MealPlansClient";

export default async function MealPlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 今日から14日分の献立を取得
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 13);
  const endStr = endDate.toISOString().split("T")[0];

  const { data: mealPlans } = await supabase
    .from("meal_plans")
    .select(`
      id,
      planned_date,
      meal_type,
      note,
      recipes (id, title, image_url, cooking_time_minutes)
    `)
    .gte("planned_date", todayStr)
    .lte("planned_date", endStr)
    .order("planned_date", { ascending: true });

  // ユーザーのレシピ一覧を取得（ピッカー用）
  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, image_url, cooking_time_minutes, category")
    .order("created_at", { ascending: false });

  return (
    <MealPlansClient
      initialMealPlans={mealPlans ?? []}
      recipes={recipes ?? []}
      todayStr={todayStr}
    />
  );
}
