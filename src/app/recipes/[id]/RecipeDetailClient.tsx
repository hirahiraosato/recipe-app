"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RECIPE_TAGS } from "@/lib/recipeTags";
import { formatAmount } from "@/lib/fractionUtils";
import AddToMealPlanModal from "@/components/AddToMealPlanModal";

type Recipe = {
  id: string;
  title: string;
  source_url: string | null;
  image_url: string | null;
  servings_base: number;
  category: string | null;
  cooking_time_minutes: number | null;
  notes: string | null;
  tags: string[];
};

type Ingredient = {
  id: string;
  group_label: string | null;
  name: string;
  amount: number | null;
  unit: string;
  category: string;
  order_index: number;
};

type FamilyMember = {
  id: string;
  name: string;
  birth_date: string | null;
};

type Step = {
  id: string;
  step_number: number;
  step_text: string;
};

// 年齢から係数を計算
function getCoefficient(birthDate: string | null): number {
  if (!birthDate) return 1.0;
  const today = new Date();
  const birth = new Date(birthDate);
  const age = today.getFullYear() - birth.getFullYear() -
    (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) ? 1 : 0);
  if (age < 1) return 0.2;
  if (age <= 2) return 0.3;
  if (age <= 5) return 0.5;
  if (age <= 12) return 0.7;
  return 1.0;
}

// カテゴリの表示順
const CATEGORY_ORDER = ["肉類", "魚介類", "野菜", "調味料", "その他"];

export default function RecipeDetailClient({
  recipe,
  ingredients,
  steps,
  familyMembers,
}: {
  recipe: Recipe;
  ingredients: Ingredient[];
  steps: Step[];
  familyMembers: FamilyMember[];
}) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMealPlanModal, setShowMealPlanModal] = useState(false);

  // 家族全員の合計係数
  const totalCoefficient =
    familyMembers.length > 0
      ? familyMembers.reduce((sum, m) => sum + getCoefficient(m.birth_date), 0)
      : recipe.servings_base;

  // 倍率（家族人数 / レシピ基本人数）
  const multiplier = totalCoefficient / recipe.servings_base;

  // 材料をカテゴリでグループ化
  const grouped = CATEGORY_ORDER.reduce<Record<string, Ingredient[]>>((acc, cat) => {
    const items = ingredients.filter((i) => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});
  // カテゴリに入らなかった材料
  const uncategorized = ingredients.filter(
    (i) => !CATEGORY_ORDER.includes(i.category)
  );
  if (uncategorized.length > 0) {
    grouped["その他"] = [...(grouped["その他"] || []), ...uncategorized];
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    const supabase = createClient();
    await supabase.from("ingredients").delete().eq("recipe_id", recipe.id);
    await supabase.from("recipes").delete().eq("id", recipe.id);
    router.push("/recipes");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 p-1 -ml-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-base font-bold text-gray-800 flex-1 line-clamp-1">
            {recipe.title}
          </h1>
          {/* 献立に追加ボタン */}
          <button
            onClick={() => setShowMealPlanModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-500 text-xs font-semibold active:bg-orange-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            献立
          </button>
          <button
            onClick={() => router.push(`/recipes/${recipe.id}/edit`)}
            className="text-gray-400 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-gray-400 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* ─── デスクトップ: 2カラム / モバイル: 1カラム ─── */}
      <div className="md:max-w-5xl md:mx-auto">
        {/* 画像（デスクトップでは上部フル幅） */}
        {recipe.image_url && (
          <div className="md:rounded-none md:aspect-[3/1] aspect-video overflow-hidden bg-orange-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="px-4 py-4 md:grid md:grid-cols-2 md:gap-6 md:items-start space-y-4 md:space-y-0">
          {/* ─── 左カラム ─── */}
          <div className="space-y-4">
            {/* レシピ情報 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-3">{recipe.title}</h2>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {recipe.cooking_time_minutes && (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {recipe.cooking_time_minutes}分
                  </span>
                )}
                {recipe.category && (
                  <span className="bg-orange-50 text-orange-500 px-2.5 py-0.5 rounded-full text-xs font-medium">
                    {recipe.category}
                  </span>
                )}
                {recipe.source_url && (
                  <a
                    href={recipe.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-xs flex items-center gap-1 ml-auto"
                  >
                    元レシピ
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>

            {/* タグ */}
            {recipe.tags?.length > 0 && (
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 mb-2">特徴・備考</p>
                <div className="flex flex-wrap gap-2">
                  {RECIPE_TAGS.filter((t) => recipe.tags.includes(t.id)).map((tag) => (
                    <span
                      key={tag.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-full text-sm font-medium border border-orange-200"
                    >
                      {tag.emoji} {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 材料（家族人数で計算） */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-800">材料</h2>
                {familyMembers.length > 0 ? (
                  <span className="text-xs text-gray-400 bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">
                    家族{familyMembers.length}人分
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">
                    {recipe.servings_base}人前
                  </span>
                )}
              </div>

              {Object.keys(grouped).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">材料情報がありません</p>
              ) : (
                <div className="space-y-4">
                  {/* カラムヘッダー（家族メンバーがいる場合のみ） */}
                  {familyMembers.length > 0 && (
                    <div className="flex items-center justify-end gap-3 pb-1 border-b border-gray-100">
                      <span className="text-xs text-gray-400 w-20 text-right">元レシピ</span>
                      <span className="text-xs font-semibold text-orange-500 w-20 text-right">家族換算</span>
                    </div>
                  )}

                  {Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        {cat}
                      </p>
                      <div className="space-y-2">
                        {items.map((ing) => {
                          const originalAmount = ing.amount;
                          const scaledAmount =
                            ing.amount !== null ? ing.amount * multiplier : null;
                          const showBoth = familyMembers.length > 0;

                          return (
                            <div
                              key={ing.id}
                              className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0"
                            >
                              <span className="text-sm text-gray-700 flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                                {ing.group_label && (
                                  <span className="flex-shrink-0 text-xs font-bold text-orange-400 bg-orange-50 px-1.5 py-0.5 rounded">
                                    {ing.group_label}
                                  </span>
                                )}
                                <span className="truncate">{ing.name}</span>
                              </span>

                              {showBoth ? (
                                /* 元レシピ量 + 家族換算量を横並び */
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className="text-xs text-gray-400 w-20 text-right">
                                    {originalAmount !== null
                                      ? `${formatAmount(originalAmount)}${ing.unit}`
                                      : ing.unit || "適量"}
                                  </span>
                                  <span className="text-sm font-semibold text-orange-600 w-20 text-right">
                                    {scaledAmount !== null
                                      ? `${formatAmount(scaledAmount)}${ing.unit}`
                                      : ing.unit || "適量"}
                                  </span>
                                </div>
                              ) : (
                                /* 家族メンバー未設定：元レシピ量のみ */
                                <span className="text-sm font-medium text-gray-800 flex-shrink-0">
                                  {originalAmount !== null
                                    ? `${formatAmount(originalAmount)}${ing.unit}`
                                    : ing.unit || "適量"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 家族メンバー未設定時の案内 */}
            {familyMembers.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-sm text-amber-700">
                  💡 設定から家族メンバーを追加すると、人数に合わせた分量を自動計算します
                </p>
              </div>
            )}
          </div>

          {/* ─── 右カラム ─── */}
          <div className="space-y-4">
            {/* 作り方 */}
            {steps.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h2 className="text-base font-bold text-gray-800 mb-3">作り方</h2>
                <div className="space-y-4">
                  {steps.map((step) => (
                    <div key={step.id} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-orange-500 text-white rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
                        {step.step_number}
                      </span>
                      <p className="text-sm text-gray-700 leading-relaxed flex-1">
                        {step.step_text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* メモ */}
            {recipe.notes && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h2 className="text-base font-bold text-gray-800 mb-2">メモ</h2>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {recipe.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 献立追加モーダル */}
      {showMealPlanModal && (
        <AddToMealPlanModal
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          onClose={() => setShowMealPlanModal(false)}
        />
      )}

      {/* 削除確認ダイアログ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800 text-center">
              このレシピを削除しますか？
            </h3>
            <p className="text-sm text-gray-500 text-center">
              「{recipe.title}」を削除します。この操作は元に戻せません。
            </p>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full bg-red-500 text-white py-3.5 rounded-xl font-bold text-base disabled:opacity-50"
            >
              {isDeleting ? "削除中..." : "削除する"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-bold text-base"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
