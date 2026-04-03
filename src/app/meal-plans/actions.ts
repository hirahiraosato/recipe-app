"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addMealPlan(
  plannedDate: string,
  mealType: "breakfast" | "lunch" | "dinner",
  recipeId: string
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUsehr();
  if (authError || !user) return { error: "ログインが必要です" };

  const { data, error } = await supabase
    .from("meal_plans")
    .insert({ user_id: user.id, planned_date: plannedDate, meal_type: meahlType, recipe_id: recipeId })
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

// ───────────────────────────────
// AI献立提案
// ───────────────────────────────
export type SuggestScope = "week" | "day" | "meal";

export type MealSuggestion = {
  date: string;          // YYYY-MM-DD
  meal_type: "breakfast" | "lunch" | "dinner";
  recipe_id: string;
  recipe_title: string;
};

export async function suggestMealPlan(
  scope: SuggestScope,
  targetDate: string,           // 開始日 or 対象日 (YYYY-MM-DD)
  targetMealType?: "breakfast" | "lunch" | "dinner"  // scope=meal のとき
): Promise<{ data?: MealSuggestion[]; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "GEMINI_API_KEY が設定されていません" };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  // 登録済みレシピ一覧を取得
  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select("id, title, category")
    .eq("user_id", user.id)
    .order("title");
  if (recipesError || !recipes || recipes.length === 0) {
    return { error: "レシピが登録されていません" };
  }

  // 直近2週間の献立を取得（重複回避のため）
  const twoWeeksAgo = new Date(targetDate + "T00:00:00");
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().split("T")[0];

  const { data: recentPlans } = await supabase
    .from("meal_plans")
    .select("planned_date, meal_type, recipes(title)")
    .eq("user_id", user.id)
    .gte("planned_date", twoWeeksAgoStr)
    .lte("planned_date", targetDate)
    .order("planned_date");

  // 提案対象の日付・食事タイプを決定
  const mealTypeLabels: Record<string, string> = {
    breakfast: "朝食", lunch: "昼食", dinner: "夕食",
  };
  const allMealTypes = ["breakfast", "lunch", "dinner"] as const;

  let slotsDescription = "";
  if (scope === "week") {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(targetDate + "T00:00:00");
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
    slotsDescription = days
      .map((d) => `${d}（朝食・昼食・夕食）`)
      .join("\n");
  } else if (scope === "day") {
    slotsDescription = `${targetDate}（朝食・昼食・夕食）`;
  } else {
    const mtLabel = mealTypeLabels[targetMealType ?? "dinner"];
    slotsDescription = `${targetDate}（${mtLabel}）`;
  }

  // 直近献立を整形
  const recentStr = (recentPlans || [])
    .map((p) => {
      const r = p.recipes as { title: string } | null;
      return `${p.planned_date} ${mealTypeLabels[p.meal_type] ?? p.meal_type}：${r?.title ?? "不明"}`;
    })
    .join("\n") || "なし";

  // レシピ一覧を整形
  const recipeListStr = recipes
    .map((r) => `- id:${r.id} 「${r.title}」 カテゴリ:${r.category ?? "未分類"}`)
    .join("\n");

  const prompt = `あなたは家族の献立を提案するアシスタントです。
以下の条件に従って、登録済みレシピから献立を提案してください。

## 登録済みレシピ（この中からのみ選んでください）
${recipeListStr}

## 直近の献立（できるだけ重複を避けてください）
${recentStr}

## 提案してほしい枠
${slotsDescription}

## 条件
- 必ず上記「登録済みレシピ」のid/titleを使用してください
- 主食・主菜・副菜など栄養バランスを意識して組み合わせてください
- 直近の献立と同じレシピが続かないようにしてください
- 1つの枠に1つのレシピを割り当ててください

以下のJSON形式のみで返してください（説明文は不要）:
{
  "suggestions": [
    {"date": "YYYY-MM-DD", "meal_type": "breakfast|lunch|dinner", "recipe_id": "...", "recipe_title": "..."}
  ]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    return { error: `Gemini APIエラー: ${res.status} ${errText.slice(0, 200)}` };
  }

  const json = await res.json();
  const rawText: string =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: { suggestions: MealSuggestion[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { error: "AIの返答をパースできませんでした" };
  }

  // recipe_id が実在するか検証
  const validIds = new Set(recipes.map((r) => r.id));
  const validated = (parsed.suggestions || []).filter((s) =>
    validIds.has(s.recipe_id)
  );

  return { data: validated };
}
