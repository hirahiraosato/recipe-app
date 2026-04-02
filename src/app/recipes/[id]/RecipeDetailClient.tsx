"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Recipe = {
  id: string;
  title: string;
  source_url: string | null;
  image_url: string | null;
  servings_base: number;
  category: string | null;
  cooking_time_minutes: number | null;
  notes: string | null;
};

type Ingredient = {
  id: string;
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

// 数値を見やすくフォーマット
function formatAmount(amount: number): string {
  if (amount === Math.floor(amount)) return String(amount);
  // 1/2, 1/3等の分数に近い場合
  const fractions: [number, string][] = [
    [0.25, "1/4"], [0.5, "1/2"], [0.75, "3/4"],
    [0.333, "1/3"], [0.667, "2/3"],
  ];
  for (const [val, str] of fractions) {
    if (Math.abs(amount - val) < 0.05) return str;
    if (amount > 1) {
      const whole = Math.floor(amount);
      const frac = amount - whole;
      if (Math.abs(frac - val) < 0.05) return `${whole}${str}`;
    }
  }
  return amount.toFixed(1);
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

      <div className="px-4 py-4 space-y-4">
        {/* 画像 */}
        {recipe.image_url && (
          <div className="rounded-2xl overflow-hidden shadow-sm aspect-video bg-orange-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
          </div>
        )}

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
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {cat}
                  </p>
                  <div className="space-y-2">
                    {items.map((ing) => {
                      const scaledAmount =
                        ing.amount !== null
                          ? ing.amount * multiplier
                          : null;
                      return (
                        <div
                          key={ing.id}
                          className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0"
                        >
                          <span className="text-sm text-gray-700">{ing.name}</span>
                          <span className="text-sm font-medium text-gray-800">
                            {scaledAmount !== null
                              ? `${formatAmount(scaledAmount)}${ing.unit}`
                              : ing.unit || "適量"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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

        {/* 家族メンバー未設定時の案内 */}
        {familyMembers.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm text-amber-700">
              💡 設定から家族メンバーを追加すると、人数に合わせた分量を自動計算します
            </p>
          </div>
        )}
      </div>

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
