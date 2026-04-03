"use client";

import { useState, useRef, useEffect } from "react";
import { addMealPlan, deleteMealPlan } from "./actions";

type Recipe = {
  id: string;
  title: string;
  image_url: string | null;
  cooking_time_minutes: number | null;
  category?: string | null;
};

type MealPlan = {
  id: string;
  planned_date: string;
  meal_type: "breakfast" | "lunch" | "dinner";
  note: string | null;
  recipes: Recipe | null;
};

const MEAL_TYPES = [
  { key: "breakfast" as const, label: "朝", emoji: "🌅" },
  { key: "lunch" as const, label: "昼", emoji: "☀️" },
  { key: "dinner" as const, label: "夜", emoji: "🌙" },
];

function formatDateLabel(dateStr: string, todayStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dayName = weekdays[date.getDay()];
  const tomorrow = new Date(todayStr + "T00:00:00");
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const isToday = dateStr === todayStr;
  const isTomorrow = dateStr === tomorrowStr;
  const isSat = date.getDay() === 6;
  const isSun = date.getDay() === 0;
  const md = `${date.getMonth() + 1}/${date.getDate()}（${dayName}）`;
  const main = isToday ? "今日" : isTomorrow ? "明日" : md;
  const sub = isToday || isTomorrow ? md : "";
  return { main, sub, isToday, isTomorrow, isSat, isSun };
}

export default function MealPlansClient({
  initialMealPlans,
  recipes,
  todayStr,
}: {
  initialMealPlans: MealPlan[];
  recipes: Recipe[];
  todayStr: string;
}) {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>(initialMealPlans);
  const [pickerTarget, setPickerTarget] = useState<{ date: string; mealType: "breakfast" | "lunch" | "dinner" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  // 日付×食事タイプで複数レシピを取得
  const getMeals = (dateStr: string, mealType: string) =>
    mealPlans.filter((mp) => mp.planned_date === dateStr && mp.meal_type === mealType);

  const handleSelectRecipe = async (recipeId: string) => {
    if (!pickerTarget || saving) return;
    setSaving(true);
    const result = await addMealPlan(pickerTarget.date, pickerTarget.mealType, recipeId);
    if (result.data) {
      setMealPlans((prev) => [...prev, result.data]);
    }
    setSaving(false);
    setPickerTarget(null);
    setSearchQuery("");
  };

  const handleClearMeal = async (meal: MealPlan) => {
    const result = await deleteMealPlan(meal.id);
    if (result.data) {
      setMealPlans((prev) => prev.filter((mp) => mp.id !== meal.id));
    }
  };

  // 選択済みレシピIDを除外してピッカーに表示
  const selectedIds = pickerTarget
    ? getMeals(pickerTarget.date, pickerTarget.mealType).map((m) => m.recipes?.id)
    : [];

  const filteredRecipes = recipes.filter(
    (r) =>
      !selectedIds.includes(r.id) &&
      r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-28">
        <header className="bg-white sticky top-0 z-40 border-b border-gray-100 px-4 py-3">
          <h1 className="text-xl font-bold text-gray-800">献立</h1>
        </header>

        <div className="px-4 py-3 space-y-3">
          {dates.map((dateStr) => {
            const { main, sub, isToday, isTomorrow, isSat, isSun } = formatDateLabel(dateStr, todayStr);
            return (
              <div
                key={dateStr}
                ref={isToday ? todayRef : undefined}
                className={`bg-white rounded-2xl shadow-sm overflow-hidden ${isToday ? "ring-2 ring-orange-400" : ""}`}
              >
                {/* 日付ヘッダー */}
                <div className={`px-4 py-2.5 flex items-center gap-2 ${isToday ? "bg-orange-50" : "bg-gray-50"}`}>
                  <span className={`font-bold text-sm ${
                    isToday ? "text-orange-500" :
                    isSat ? "text-blue-500" :
                    isSun ? "text-red-400" : "text-gray-600"
                  }`}>{main}</span>
                  {sub && <span className="text-xs text-gray-400">{sub}</span>}
                  {isToday && (
                    <span className="ml-auto text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-medium">今日</span>
                  )}
                </div>

                {/* 朝・昼・夜 */}
                <div className="divide-y divide-gray-50">
                  {MEAL_TYPES.map(({ key, label, emoji }) => {
                    const meals = getMeals(dateStr, key);
                    return (
                      <div key={key} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          {/* 食事タイプラベル */}
                          <div className="w-8 flex flex-col items-center flex-shrink-0 pt-1">
                            <span className="text-base">{emoji}</span>
                            <span className="text-xs text-gray-400 font-medium">{label}</span>
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            {/* 登録済みレシピ */}
                            {meals.map((meal) => (
                              <div key={meal.id} className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50">
                                  {meal.recipes?.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={meal.recipes.image_url} alt={meal.recipes?.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-lg">🍽️</div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 line-clamp-1">{meal.recipes?.title}</p>
                                  {meal.recipes?.cooking_time_minutes && (
                                    <p className="text-xs text-gray-400">⏱ {meal.recipes.cooking_time_minutes}分</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleClearMeal(meal)}
                                  className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:bg-red-100 transition-colors"
                                >
                                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}

                            {/* 追加ボタン */}
                            <button
                              onClick={() => setPickerTarget({ date: dateStr, mealType: key })}
                              className={`flex items-center gap-2 active:opacity-60 transition-opacity ${meals.length === 0 ? "w-full" : ""}`}
                            >
                              {meals.length === 0 ? (
                                <>
                                  <div className="w-10 h-10 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                  </div>
                                  <span className="text-sm text-gray-300">レシピを選ぶ</span>
                                </>
                              ) : (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-orange-200 bg-orange-50">
                                  <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                  </svg>
                                  <span className="text-xs text-orange-400 font-medium">もう1品追加</span>
                                </div>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== レシピピッカー ===== */}
      {pickerTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-end">
          <div className="bg-white rounded-t-3xl w-full flex flex-col" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0 border-b border-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-800">レシピを選ぶ</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDateLabel(pickerTarget.date, todayStr).main} ·{" "}
                  {MEAL_TYPES.find((m) => m.key === pickerTarget.mealType)?.emoji}
                  {MEAL_TYPES.find((m) => m.key === pickerTarget.mealType)?.label}
                  {getMeals(pickerTarget.date, pickerTarget.mealType).length > 0 && (
                    <span className="ml-1 text-orange-400">
                      （{getMeals(pickerTarget.date, pickerTarget.mealType).length}品登録済み）
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => { setPickerTarget(null); setSearchQuery(""); }}
                className="text-gray-400 p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-3 flex-shrink-0">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="レシピを検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  autoFocus
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-8">
              {filteredRecipes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <span className="text-5xl mb-3">🍽️</span>
                  <p className="text-sm">
                    {recipes.length === 0 ? "レシピがまだ登録されていません" :
                     selectedIds.length >= recipes.length ? "すべてのレシピが登録済みです" :
                     "該当するレシピがありません"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      onClick={() => handleSelectRecipe(recipe.id)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 active:bg-orange-50 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50">
                        {recipe.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 line-clamp-2">{recipe.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {recipe.cooking_time_minutes && (
                            <span className="text-xs text-gray-400">⏱ {recipe.cooking_time_minutes}分</span>
                          )}
                          {recipe.category && (
                            <span className="text-xs text-orange-400 bg-orange-50 px-2 py-0.5 rounded-full">{recipe.category}</span>
                          )}
                        </div>
                      </div>
                      {saving ? (
                        <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : (
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
