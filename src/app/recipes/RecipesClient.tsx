"use client";

import { useState } from "react";
import Link from "next/link";
import { RECIPE_TAGS } from "@/lib/recipeTags";
import AddToMealPlanModal from "@/components/AddToMealPlanModal";
import { createClient } from "@/lib/supabase/client";

type Recipe = {
  id: string;
  title: string;
  image_url: string | null;
  servings_base: number;
  category: string | null;
  cooking_time_minutes: number | null;
  created_at: string;
  tags: string[];
  is_favorite: boolean;
};

export default function RecipesClient({
  initialRecipes,
}: {
  initialRecipes: Recipe[];
}) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [mealPlanTarget, setMealPlanTarget] = useState<Recipe | null>(null);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleToggleFavorite = async (e: React.MouseEvent, recipe: Recipe) => {
    e.preventDefault();
    e.stopPropagation();
    const newVal = !recipe.is_favorite;
    // Optimistic update
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipe.id ? { ...r, is_favorite: newVal } : r))
    );
    const supabase = createClient();
    await supabase.from("recipes").update({ is_favorite: newVal }).eq("id", recipe.id);
  };

  const filtered = recipes.filter((r) => {
    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags =
      selectedTags.length === 0 || selectedTags.every((t) => r.tags?.includes(t));
    const matchesFavorite = !favoriteOnly || r.is_favorite;
    return matchesSearch && matchesTags && matchesFavorite;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3 md:max-w-5xl md:mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-800">レシピ</h1>
            <Link
              href="/recipes/new"
              className="bg-orange-500 text-white rounded-full w-9 h-9 flex items-center justify-center shadow-md active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </Link>
          </div>
          {/* 検索バー */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="レシピを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          {/* タグフィルター */}
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide">
            {/* お気に入りフィルター */}
            <button
              onClick={() => setFavoriteOnly((v) => !v)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                favoriteOnly
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              ❤️ お気に入り
            </button>
            {RECIPE_TAGS.map((tag) => {
              const active = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  {tag.emoji} {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* レシピリスト */}
      <div className="px-4 py-4 md:max-w-5xl md:mx-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🍳</div>
            <p className="text-gray-500 text-base font-medium mb-1">
              {searchQuery || selectedTags.length > 0 ? "レシピが見つかりません" : "レシピがまだありません"}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {searchQuery || selectedTags.length > 0 ? "条件を変えてみてください" : "URLからレシピを追加してみましょう"}
            </p>
            {!searchQuery && selectedTags.length === 0 && (
              <Link
                href="/recipes/new"
                className="bg-orange-500 text-white px-6 py-3 rounded-xl font-medium text-sm shadow-md"
              >
                レシピを追加する
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((recipe) => (
              <div key={recipe.id} className="bg-white rounded-2xl overflow-hidden shadow-sm relative">
                {/* カード本体 → 詳細ページへ */}
                <Link href={`/recipes/${recipe.id}`} className="block active:opacity-80 transition-opacity">
                  <div className="aspect-square bg-orange-50 flex items-center justify-center relative">
                    {recipe.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={recipe.image_url}
                        alt={recipe.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl">🍽️</span>
                    )}
                    {/* ハートボタン */}
                    <button
                      onClick={(e) => handleToggleFavorite(e, recipe)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                    >
                      {recipe.is_favorite ? (
                        <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="p-3 pb-2">
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-tight">
                      {recipe.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {recipe.cooking_time_minutes && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {recipe.cooking_time_minutes}分
                        </span>
                      )}
                      {recipe.category && (
                        <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">
                          {recipe.category}
                        </span>
                      )}
                    </div>
                    {recipe.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {RECIPE_TAGS.filter((t) => recipe.tags.includes(t.id)).slice(0, 2).map((tag) => (
                          <span key={tag.id} className="text-xs text-gray-500">
                            {tag.emoji}{tag.label}
                          </span>
                        ))}
                        {recipe.tags.length > 2 && (
                          <span className="text-xs text-gray-400">+{recipe.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>

                {/* 献立追加ボタン */}
                <div className="px-3 pb-3 pt-1">
                  <button
                    onClick={() => setMealPlanTarget(recipe)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-500 text-xs font-semibold active:bg-orange-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    献立に追加
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 献立追加モーダル */}
      {mealPlanTarget && (
        <AddToMealPlanModal
          recipeId={mealPlanTarget.id}
          recipeTitle={mealPlanTarget.title}
          onClose={() => setMealPlanTarget(null)}
        />
      )}
    </div>
  );
}
