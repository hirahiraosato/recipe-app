"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ParsedIngredient = {
  name: string;
  amount: number | null;
  unit: string;
  category: string;
  order_index: number;
};

type ParsedRecipe = {
  title: string;
  servings_base: number;
  cooking_time_minutes: number | null;
  category: string | null;
  notes: string | null;
  ingredients: ParsedIngredient[];
};

type Step = "input" | "loading" | "preview" | "saving";

export default function NewRecipePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [url, setUrl] = useState("");
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [error, setError] = useState("");

  const handleParse = async () => {
    if (!url.trim()) {
      setError("URLを入力してください");
      return;
    }
    try {
      new URL(url);
    } catch {
      setError("正しいURLを入力してください");
      return;
    }

    setError("");
    setStep("loading");

    try {
      const res = await fetch("/api/parse-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "解析に失敗しました");
      }
      setParsed(data);
      setStep("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setStep("input");
    }
  };

  const handleSave = async () => {
    if (!parsed) return;
    setStep("saving");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // レシピを保存
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        user_id: user.id,
        title: parsed.title,
        source_url: url,
        servings_base: parsed.servings_base || 2,
        cooking_time_minutes: parsed.cooking_time_minutes,
        category: parsed.category,
        notes: parsed.notes,
      })
      .select()
      .single();

    if (recipeError) {
      setError("保存に失敗しました: " + recipeError.message);
      setStep("preview");
      return;
    }

    // 材料を保存
    if (parsed.ingredients && parsed.ingredients.length > 0) {
      const ingredients = parsed.ingredients.map((ing, i) => ({
        recipe_id: recipe.id,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit || "",
        category: ing.category || "その他",
        order_index: i,
      }));
      await supabase.from("ingredients").insert(ingredients);
    }

    router.push(`/recipes/${recipe.id}`);
  };

  // ---- UI ----
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
          <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">AIがレシピを解析中...</p>
        <p className="text-gray-400 text-sm">少々お待ちください</p>
      </div>
    );
  }

  if (step === "saving") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
          <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">レシピを保存中...</p>
      </div>
    );
  }

  if (step === "preview" && parsed) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* ヘッダー */}
        <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setStep("input")}
              className="text-gray-500 p-1 -ml-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-800 flex-1">レシピの確認</h1>
          </div>
        </header>

        <div className="px-4 py-4 space-y-4">
          {/* レシピ情報 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <input
              value={parsed.title}
              onChange={(e) => setParsed({ ...parsed, title: e.target.value })}
              className="w-full text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-3 focus:outline-none focus:border-orange-400"
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">人数</p>
                <input
                  type="number"
                  value={parsed.servings_base || 2}
                  onChange={(e) => setParsed({ ...parsed, servings_base: Number(e.target.value) })}
                  className="w-full text-center text-base font-semibold text-gray-700 border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-orange-400"
                />
                <p className="text-xs text-gray-400 mt-0.5">人前</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">時間</p>
                <input
                  type="number"
                  value={parsed.cooking_time_minutes || ""}
                  onChange={(e) =>
                    setParsed({
                      ...parsed,
                      cooking_time_minutes: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="--"
                  className="w-full text-center text-base font-semibold text-gray-700 border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-orange-400"
                />
                <p className="text-xs text-gray-400 mt-0.5">分</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">カテゴリ</p>
                <input
                  value={parsed.category || ""}
                  onChange={(e) => setParsed({ ...parsed, category: e.target.value })}
                  placeholder="主菜"
                  className="w-full text-center text-base font-semibold text-gray-700 border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-orange-400"
                />
              </div>
            </div>
          </div>

          {/* 材料リスト */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-800 mb-3">
              材料 ({parsed.servings_base}人前)
            </h2>
            <div className="space-y-2">
              {parsed.ingredients.map((ing, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-700">{ing.name}</span>
                  <input
                    type="number"
                    value={ing.amount ?? ""}
                    onChange={(e) => {
                      const newIngs = [...parsed.ingredients];
                      newIngs[i] = {
                        ...newIngs[i],
                        amount: e.target.value ? Number(e.target.value) : null,
                      };
                      setParsed({ ...parsed, ingredients: newIngs });
                    }}
                    className="w-16 text-right text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                  />
                  <input
                    value={ing.unit}
                    onChange={(e) => {
                      const newIngs = [...parsed.ingredients];
                      newIngs[i] = { ...newIngs[i], unit: e.target.value };
                      setParsed({ ...parsed, ingredients: newIngs });
                    }}
                    className="w-12 text-sm text-gray-500 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* 保存ボタン（固定） */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3">
          <button
            onClick={handleSave}
            className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-bold text-base shadow-md active:scale-95 transition-transform"
          >
            このレシピを保存する
          </button>
        </div>
      </div>
    );
  }

  // step === "input"
  return (
    <div className="min-h-screen bg-gray-50">
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
          <h1 className="text-lg font-bold text-gray-800">レシピを追加</h1>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6">
        {/* 説明 */}
        <div className="bg-orange-50 rounded-2xl p-4 flex gap-3">
          <span className="text-2xl flex-shrink-0">✨</span>
          <div>
            <p className="text-sm font-semibold text-orange-700 mb-1">AIで自動取り込み</p>
            <p className="text-xs text-orange-600 leading-relaxed">
              クックパッド・クラシルなどのレシピURLを入力すると、AIが材料や分量を自動で読み取ります
            </p>
          </div>
        </div>

        {/* URL入力 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            レシピのURL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            placeholder="https://cookpad.com/recipe/..."
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            autoFocus
          />
          {error && (
            <p className="text-red-500 text-xs mt-2">{error}</p>
          )}
        </div>

        {/* 対応サイト例 */}
        <div>
          <p className="text-xs text-gray-400 mb-2 px-1">対応サイト（例）</p>
          <div className="flex flex-wrap gap-2">
            {["クックパッド", "クラシル", "デリッシュキッチン", "NHKきょうの料理", "白ごはん.com"].map(
              (site) => (
                <span
                  key={site}
                  className="text-xs bg-white border border-gray-200 text-gray-500 px-3 py-1.5 rounded-full shadow-sm"
                >
                  {site}
                </span>
              )
            )}
          </div>
        </div>

        {/* 取り込みボタン */}
        <button
          onClick={handleParse}
          disabled={!url.trim()}
          className="w-full bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white py-4 rounded-xl font-bold text-base shadow-md active:scale-95 transition-transform"
        >
          AIでレシピを取り込む
        </button>
      </div>
    </div>
  );
}
