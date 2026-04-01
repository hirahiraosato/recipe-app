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

  // 今週の献立を取得
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const { data: mealPlans } = await supabase
    .from("meal_plans")
    .select(`
      *,
      recipes (id, title, image_url, cooking_time_minutes)
    `)
    .gte("planned_date", monday.toISOString().split("T")[0])
    .lte("planned_date", sunday.toISOString().split("T")[0])
    .order("planned_date", { ascending: true });

  return <MealPlansClient initialMealPlans={mealPlans ?? []} weekStart={monday.toISOString()} />;
}
