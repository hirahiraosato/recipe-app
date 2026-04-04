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

  // 今日から14日分の献立を取得（JSTで日付を確定）
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const endDate = new Date(todayStr + "T00:00:00+09:00");
  endDate.setDate(endDate.getDate() + 13);
  const endStr = endDate.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const { data: mealPlans } = await supabase
    .from("meal_plans")
    .select(`
      id,
      planned_date,
      meal_type,
      note,
      role,
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
