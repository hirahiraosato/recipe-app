"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addMealPlan, deleteMealPlan, addIngredientsToShopping } from "./actions";
import AISuggestModal from "./AISuggestModal";
import { RECIPE_CATEGORIES } from "@/lib/recipeCategories";

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
  role: string | null;
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
  const router = useRouter();
  const [mealPlans, setMealPlans] = useState<MealPlan[]>(initialMealPlans);
  const [pickerTarget, setPickerTarget] = useState<{ date: string; mealType: "breakfast" | "lunch" | "dinner" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // 買い物リスト追加中のキー（日・食事・レシピ単位で識別）
  const [addingShoppingKey, setAddingShoppingKey] = useState<string | null>(null);
  // 完了トースト
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  // AI提案モーダル
  const [showAISuggest, setShowAISuggest] = useState(false);

  const handleCopyMealPlan = async () => {
    const lines: string[] = ["【献立】"];
    for (const dateStr of dates) {
      const dayMeals = getDayMeals(dateStr);
      if (dayMeals.length === 0) continue;
      const { main } = formatDateLabel(dateStr, todayStr);
      lines.push(`\n${main}`);
      for (const { key, label, emoji } of [
        { key: "breakfast", label: "朝", emoji: "🌅" },
        { key: "lunch",    label: "昼", emoji: "☀️" },
        { key: "dinner",   label: "夜", emoji: "🌙" },
      ] as const) {
        const meals = getMeals(dateStr, key);
        if (meals.length === 0) continue;
        const titles = meals.map((m) => m.recipes?.title ?? "").filter(Boolean).join("・");
        lines.push(` ${emoji}${label}：${titles}`);
      }
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("献立をコピーしました");
  };
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const getMeals = (dateStr: string, mealType: string) =>
    mealPlans.filter((mp) => mp.planned_date === dateStr && mp.meal_type === mealType);

  const getDayMeals = (dateStr: string) =>
    mealPlans.filter((mp) => mp.planned_date === dateStr);

  const handleTogglePickerRecipe = (recipeId: string) => {
    setPickerSelected((prev) =>
      prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
    );
  };

  const handleConfirmAdd = async () => {
    if (!pickerTarget || saving || pickerSelected.length === 0) return;
    setSaving(true);
    for (const recipeId of pickerSelected) {
      const result = await addMealPlan(pickerTarget.date, pickerTarget.mealType, recipeId);
      if (result.data) {
        setMealPlans((prev) => [...prev, result.data]);
      }
    }
    setSaving(false);
    setPickerTarget(null);
    setSearchQuery("");
    setPickerSelected([]);
    setPickerCategory(null);
  };

  const handleClearMeal = async (meal: MealPlan) => {
    const result = await deleteMealPlan(meal.id);
    if (result.data) {
      setMealPlans((prev) => prev.filter((mp) => mp.id !== meal.id));
    }
  };

  // 買い物リストへ追加（日・食事・レシピ単位で共通）
  const handleAddToShopping = async (recipeIds: string[], loadingKey: string) => {
    if (recipeIds.length === 0) {
      showToast("レシピが登録されていません", "error");
      return;
    }
    setAddingShoppingKey(loadingKey);
    const result = await addIngredientsToShopping(recipeIds, loadingKey);
    setAddingShoppingKey(null);
    if (result.error) {
      showToast(result.error, "error");
    } else {
      showToast(`${result.data}品の食材を買い物リストに追加しました`);
    }
  };

  const selectedIds = pickerTarget
    ? getMeals(pickerTarget.date, pickerTarget.mealType).map((m) => m.recipes?.id)
    : [];

  const filteredRecipes = recipes.filter(
    (r) =>
      !selectedIds.includes(r.id) &&
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (pickerCategory === null || r.category === pickerCategory)
  );

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-28">
        <header className="bg-white sticky top-0 z-40 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">献立</h1>
          <div className="flex items-center gap-2">
            {/* AI提案ボタン */}
            <button
              onClick={() => setShowAISuggest(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-xs text-orange-500 font-medium active:bg-orange-100 transition-colors"
            >
              <span>✨</span>
              AI提案
            </button>
            {/* LINEで送る */}
            <button
              onClick={handleCopyMealPlan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 font-medium active:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              LINEで送る
            </button>
          </div>
        </header>

        <div className="px-4 py-3 space-y-3">
          {dates.map((dateStr) => {
            const { main, sub, isToday, isTomorrow, isSat, isSun } = formatDateLabel(dateStr, todayStr);
            const dayMealCount = getDayMeals(dateStr).length;
            const dayRecipeIds = getDayMeals(dateStr)
              .map((m) => m.recipes?.id)
              .filter(Boolean) as string[];
            const isDayLoading = addingShoppingKey === `day-${dateStr}`;

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
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-medium">今日</span>
                  )}

                  {/* 日単位：まとめて買い物リストへ */}
                  {dayMealCount > 0 && (
                    <button
                      onClick={() => handleAddToShopping(dayRecipeIds, `day-${dateStr}`)}
                      disabled={!!addingShoppingKey}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs text-gray-500 active:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {isDayLoading ? (
                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      )}
                      <span>この日まとめて</span>
                    </button>
                  )}
                </div>

                {/* 朝・昼・夜 */}
                <div className="divide-y divide-gray-50">
                  {MEAL_TYPES.map(({ key, label, emoji }) => {
                    const meals = getMeals(dateStr, key);
                    const mealRecipeIds = meals.map((m) => m.recipes?.id).filter(Boolean) as string[];
                    const mealLoadingKey = `meal-${dateStr}-${key}`;
                    const isMealLoading = addingShoppingKey === mealLoadingKey;

                    return (
                      <div key={key} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          {/* 食事アイコン＋食事単位の買い物ボタン */}
                          <div className="w-8 flex flex-col items-center flex-shrink-0 pt-1">
                            <span className="text-base">{emoji}</span>
                            <span className="text-xs text-gray-400 font-medium">{label}</span>
                            {meals.length > 0 && (
                              <button
                                onClick={() => handleAddToShopping(mealRecipeIds, mealLoadingKey)}
                                disabled={!!addingShoppingKey}
                                className="mt-1 w-7 h-7 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center disabled:opacity-40 active:bg-orange-100 transition-colors"
                                title={`${label}ごはんを買い物リストへ`}
                              >
                                {isMealLoading ? (
                                  <div className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            {/* 登録済みレシピ */}
                            {meals.map((meal) => {
                              const recipeLoadingKey = `recipe-${meal.id}`;
                              const isRecipeLoading = addingShoppingKey === recipeLoadingKey;
                              return (
                              <div key={meal.id} className="flex items-center gap-2">
                                {/* サムネ → 詳細ページへ */}
                                <button
                                  onClick={() => router.push(`/recipes/${meal.recipes?.id}`)}
                                  className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50 active:opacity-70 transition-opacity"
                                >
                                  {meal.recipes?.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={meal.recipes.image_url} alt={meal.recipes?.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-lg">🍽️</div>
                                  )}
                                </button>

                                <div className="flex-1 min-w-0">
                                  <button
                                    onClick={() => router.push(`/recipes/${meal.recipes?.id}`)}
                                    className="text-left w-full active:opacity-70 transition-opacity"
                                  >
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {meal.role && meal.role !== "主菜" && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 flex-shrink-0">
                                          {meal.role}
                                        </span>
                                      )}
                                      <p className="text-sm font-medium text-gray-800 line-clamp-1">{meal.recipes?.title}</p>
                                    </div>
                                    {meal.recipes?.cooking_time_minutes && (
                                      <p className="text-xs text-gray-400">⏱ {meal.recipes.cooking_time_minutes}分</p>
                                    )}
                                  </button>
                                </div>

                                {/* レシピ単位：買い物リストへ */}
                                <button
                                  onClick={() => meal.recipes?.id && handleAddToShopping([meal.recipes.id], recipeLoadingKey)}
                                  disabled={!!addingShoppingKey}
                                  className="w-7 h-7 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:bg-orange-100 transition-colors"
                                  title="この1品だけ買い物リストへ"
                                >
                                  {isRecipeLoading ? (
                                    <div className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                  )}
                                </button>

                                {/* 詳細リンク */}
                                <button
                                  onClick={() => router.push(`/recipes/${meal.recipes?.id}`)}
                                  className="w-7 h-7 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 active:bg-orange-50 transition-colors"
                                  title="レシピ詳細を見る"
                                >
                                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </button>

                                {/* 削除 */}
                                <button
                                  onClick={() => handleClearMeal(meal)}
                                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:bg-red-100 transition-colors"
                                >
                                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            )})}


                            {/* 追加ボタン */}
                            <button
                              onClick={() => { setPickerTarget({ date: dateStr, mealType: key }); setSearchQuery(""); setPickerCategory(null); setPickerSelected([]); }}
                              className="flex items-center gap-2 active:opacity-60 transition-opacity"
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

      {/* AI提案モーダル */}
      {showAISuggest && (
        <AISuggestModal
          todayStr={todayStr}
          onClose={() => setShowAISuggest(false)}
          onApplied={() => router.refresh()}
        />
      )}

      {/* トースト通知 */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium text-white whitespace-nowrap transition-all ${
          toast.type === "success" ? "bg-gray-800" : "bg-red-500"
        }`}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}

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
                onClick={() => { setPickerTarget(null); setSearchQuery(""); setPickerCategory(null); setPickerSelected([]); }}
                className="text-gray-400 p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-3 flex-shrink-0 space-y-2">
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
              {/* カテゴリフィルター */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setPickerCategory(null)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs border transition-colors ${
                    pickerCategory === null
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  すべて
                </button>
                {RECIPE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setPickerCategory(pickerCategory === cat ? null : cat)}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs border transition-colors ${
                      pickerCategory === cat
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-500 border-gray-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-4">
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
                  {filteredRecipes.map((recipe) => {
                    const isChecked = pickerSelected.includes(recipe.id);
                    return (
                      <button
                        key={recipe.id}
                        onClick={() => handleTogglePickerRecipe(recipe.id)}
                        disabled={saving}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-colors text-left disabled:opacity-50 ${
                          isChecked ? "bg-orange-50 border border-orange-200" : "bg-gray-50"
                        }`}
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
                        <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                          isChecked ? "bg-orange-500 border-orange-500" : "border-gray-300"
                        }`}>
                          {isChecked && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 追加ボタン */}
            <div className="px-4 pb-6 pt-2 flex-shrink-0 border-t border-gray-100">
              <button
                onClick={handleConfirmAdd}
                disabled={pickerSelected.length === 0 || saving}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-colors bg-orange-500 text-white disabled:bg-gray-200 disabled:text-gray-400"
              >
                {saving ? "追加中..." : pickerSelected.length === 0 ? "レシピを選んでください" : `${pickerSelected.length}品を追加する`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
