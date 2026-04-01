"use client";

import { useState } from "react";
import Link from "next/link";

type Recipe = {
  id: string;
  title: string;
  image_url: string | null;
  servings_base: number;
  category: string | null;
  cooking_time_minutes: number | null;
  created_at: string;
};

export default function RecipesClient({
  initialRecipes,
}: {
  initialRecipes: Recipe[];
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = initialRecipes.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3">
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
        </div>
      </header>

      {/* レシピリスト */}
      <div className="px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🍳</div>
            <p className="text-gray-500 text-base font-medium mb-1">
              {searchQuery ? "レシピが見つかりません" : "レシピがまだありません"}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {searchQuery ? "検索ワードを変えてみてください" : "URLからレシピを追加してみましょう"}
            </p>
            {!searchQuery && (
              <Link
                href="/recipes/new"
                className="bg-orange-500 text-white px-6 py-3 rounded-xl font-medium text-sm shadow-md"
              >
                レシピを追加する
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((recipe) => (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm active:scale-95 transition-transform">
                  <div className="aspect-square bg-orange-50 flex items-center justify-center">
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
                  </div>
                  <div className="p-3">
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
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
