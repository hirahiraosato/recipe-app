"use client";

import { useState } from "react";
import { addMealPlan } from "@/app/meal-plans/actions";

type MealType = "breakfast" | "lunch" | "dinner";

const MEAL_TYPES: { key: MealType; label: string; emoji: string }[] = [
  { key: "breakfast", label: "朝", emoji: "🌅" },
  { key: "lunch",    label: "昼", emoji: "☀️" },
  { key: "dinner",   label: "夜", emoji: "🌙" },
];

function formatDateLabel(dateStr: string, todayStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const day = weekdays[date.getDay()];
  const tomorrow = new Date(todayStr + "T00:00:00");
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  if (dateStr === todayStr) return `今日（${day}）`;
  if (dateStr === tomorrowStr) return `明日（${day}）`;
  return `${date.getMonth() + 1}/${date.getDate()}（${day}）`;
}

export default function AddToMealPlanModal({
  recipeId,
  recipeTitle,
  onClose,
}: {
  recipeId: string;
  recipeTitle: string;
  onClose: () => void;
}) {
  const todayStr = new Date().toISOString().split("T")[0];

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedMeal, setSelectedMeal] = useState<MealType>("dinner");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    await addMealPlan(selectedDate, selectedMeal, recipeId);
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 800);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full rounded-t-3xl p-6 space-y-5">
        <div>
          <h3 className="text-base font-bold text-gray-800">献立に追加</h3>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{recipeTitle}</p>
        </div>

        {/* 日付セレクター（横スクロール） */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">日付</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {dates.map((d) => {
              const isSelected = d === selectedDate;
              const isToday = d === todayStr;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    isSelected
                      ? "bg-orange-500 text-white border-orange-500"
                      : isToday
                      ? "bg-orange-50 text-orange-500 border-orange-200"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {formatDateLabel(d, todayStr)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 食事タイプセレクター */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">食事</p>
          <div className="flex gap-2">
            {MEAL_TYPES.map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => setSelectedMeal(key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                  selectedMeal === key
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 確定ボタン */}
        <button
          onClick={handleAdd}
          disabled={saving || done}
          className={`w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 ${
            done
              ? "bg-green-500 text-white"
              : "bg-orange-500 text-white disabled:opacity-50"
          }`}
        >
          {done ? "✓ 追加しました" : saving ? "追加中..." : "献立に追加する"}
        </button>

        <button
          onClick={onClose}
          className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold text-sm"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
