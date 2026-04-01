"use client";

import { useState } from "react";

type Recipe = {
  id: string;
  title: string;
  image_url: string | null;
  cooking_time_minutes: number | null;
};

type MealPlan = {
  id: string;
  planned_date: string;
  meal_type: "breakfast" | "lunch" | "dinner";
  recipes: Recipe | null;
};

const MEAL_TYPES = [
  { key: "breakfast", label: "朝食" },
  { key: "lunch", label: "昼食" },
  { key: "dinner", label: "夕食" },
] as const;

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

export default function MealPlansClient({
  initialMealPlans,
  weekStart,
}: {
  initialMealPlans: MealPlan[];
  weekStart: string;
}) {
  const [mealPlans] = useState(initialMealPlans);

  const weekStartDate = new Date(weekStart);

  const getDayDates = () => {
    return WEEKDAYS.map((_, i) => {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + i);
      return d;
    });
  };

  const dayDates = getDayDates();
  const today = new Date().toISOString().split("T")[0];

  const getMeal = (date: Date, mealType: string) => {
    const dateStr = date.toISOString().split("T")[0];
    return mealPlans.find(
      (mp) => mp.planned_date === dateStr && mp.meal_type === mealType
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">今週の献立</h1>
          <button className="bg-orange-500 text-white rounded-full w-9 h-9 flex items-center justify-center shadow-md active:scale-95 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-t border-gray-100">
          {WEEKDAYS.map((day, i) => {
            const dateStr = dayDates[i].toISOString().split("T")[0];
            const isToday = dateStr === today;
            return (
              <div key={day} className="flex flex-col items-center py-2">
                <span className="text-xs text-gray-400">{day}</span>
                <span
                  className={`text-sm font-semibold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday ? "bg-orange-500 text-white" : "text-gray-700"
                  }`}
                >
                  {dayDates[i].getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </header>

      {/* 献立グリッド */}
      <div className="px-3 py-3">
        {MEAL_TYPES.map(({ key, label }) => (
          <div key={key} className="mb-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
              {label}
            </h2>
            <div className="grid grid-cols-7 gap-1">
              {dayDates.map((date, i) => {
                const meal = getMeal(date, key);
                return (
                  <button
                    key={i}
                    className="aspect-square rounded-xl flex flex-col items-center justify-center bg-white shadow-sm active:scale-95 transition-transform overflow-hidden"
                  >
                    {meal?.recipes ? (
                      <div className="w-full h-full relative">
                        {meal.recipes.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={meal.recipes.image_url}
                            alt={meal.recipes.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-orange-50 flex items-center justify-center">
                            <span className="text-lg">🍽️</span>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-30 px-1 py-0.5">
                          <p className="text-white text-xs leading-tight line-clamp-1">
                            {meal.recipes.title}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xl">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 買い物リスト生成ボタン */}
      <div className="px-4 py-4">
        <button className="w-full bg-orange-500 text-white py-4 rounded-2xl font-semibold text-base shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          買い物リストを生成
        </button>
      </div>
    </div>
  );
}
