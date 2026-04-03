"use client";

import { useState } from "react";
import {
  suggestMealPlan,
  addMealPlan,
  type SuggestScope,
  type MealSuggestion,
} from "./actions";

const MEAL_TYPES = [
  { key: "breakfast" as const, label: "朝食", emoji: "🌅" },
  { key: "lunch" as const, label: "昼食", emoji: "☀️" },
  { key: "dinner" as const, label: "夕食", emoji: "🌙" },
];

const MEAL_LABEL: Record<string, string> = {
  breakfast: "朝", lunch: "昼", dinner: "夜",
};

function formatDisplayDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
}

type Props = {
  todayStr: string;
  onClose: () => void;
  onApplied: () => void; // 適用後にページをリフレッシュ
};

export default function AISuggestModal({ todayStr, onClose, onApplied }: Props) {
  const [scope, setScope] = useState<SuggestScope>("day");
  const [targetDate, setTargetDate] = useState(todayStr);
  const [targetMealType, setTargetMealType] = useState<"breakfast" | "lunch" | "dinner">("dinner");

  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  // チェックボックスで適用する提案を選択
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 14日分の日付選択肢
  const dateOptions = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setSuggestions(null);
    setSelected(new Set());

    const result = await suggestMealPlan(
      scope,
      targetDate,
      scope === "meal" ? targetMealType : undefined
    );

    setGenerating(false);
    if (result.error) {
      setError(result.error);
    } else if (!result.data || result.data.length === 0) {
      setError("提案が生成できませんでした。もう一度お試しください。");
    } else {
      setSuggestions(result.data);
      // 全選択状態で開始
      setSelected(new Set(result.data.map((s) => `${s.date}|${s.meal_type}`)));
    }
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApply = async () => {
    if (!suggestions) return;
    setApplying(true);
    const toApply = suggestions.filter((s) =>
      selected.has(`${s.date}|${s.meal_type}`)
    );
    for (const s of toApply) {
      await addMealPlan(s.date, s.meal_type, s.recipe_id);
    }
    setApplying(false);
    onApplied();
    onClose();
  };

  // 提案を日付順・食事種別順でグループ化
  const grouped: Record<string, MealSuggestion[]> = {};
  if (suggestions) {
    for (const s of suggestions) {
      if (!grouped[s.date]) grouped[s.date] = [];
      grouped[s.date].push(s);
    }
    for (const d of Object.keys(grouped)) {
      grouped[d].sort((a, b) =>
        ["breakfast", "lunch", "dinner"].indexOf(a.meal_type) -
        ["breakfast", "lunch", "dinner"].indexOf(b.meal_type)
      );
    }
  }
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex items-end">
      <div className="bg-white rounded-t-3xl w-full flex flex-col" style={{ maxHeight: "92vh" }}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h3 className="text-lg font-bold text-gray-800">AI献立提案</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          {/* ── 提案範囲 ── */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">提案する範囲</p>
            <div className="grid grid-cols-3 gap-2">
              {(["week", "day", "meal"] as SuggestScope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    scope === s
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-600 border-gray-200 active:bg-orange-50"
                  }`}
                >
                  {s === "week" ? "1週間" : s === "day" ? "1日分" : "1食分"}
                </button>
              ))}
            </div>
          </section>

          {/* ── 対象日 ── */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {scope === "week" ? "開始日" : "対象日"}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {dateOptions.slice(0, scope === "week" ? 8 : 14).map((d) => (
                <button
                  key={d}
                  onClick={() => setTargetDate(d)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    targetDate === d
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {formatDisplayDate(d)}
                  {d === todayStr && <span className="block text-[10px] opacity-75">今日</span>}
                </button>
              ))}
            </div>
          </section>

          {/* ── 食事の種類（1食分のみ） ── */}
          {scope === "meal" && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">食事</p>
              <div className="grid grid-cols-3 gap-2">
                {MEAL_TYPES.map(({ key, label, emoji }) => (
                  <button
                    key={key}
                    onClick={() => setTargetMealType(key)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      targetMealType === key
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    {emoji} {label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── 生成ボタン ── */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-bold text-sm active:bg-orange-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>AIが考え中…</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>AI献立を提案してもらう</span>
              </>
            )}
          </button>

          {/* ── エラー ── */}
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-50 rounded-xl text-sm text-red-600">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── 提案結果 ── */}
          {suggestions && suggestions.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">提案結果</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelected(new Set(suggestions.map((s) => `${s.date}|${s.meal_type}`)))}
                    className="text-xs text-orange-500 font-medium"
                  >
                    全選択
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-gray-400 font-medium"
                  >
                    全解除
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {sortedDates.map((date) => (
                  <div key={date} className="bg-gray-50 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2 bg-gray-100">
                      <span className="text-xs font-bold text-gray-600">{formatDisplayDate(date)}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {grouped[date].map((s) => {
                        const key = `${s.date}|${s.meal_type}`;
                        const isSelected = selected.has(key);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleSelect(key)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                              isSelected ? "bg-orange-50" : "bg-white opacity-50"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected ? "bg-orange-500 border-orange-500" : "border-gray-300"
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span className="text-xs font-bold text-gray-500 w-4">{MEAL_LABEL[s.meal_type]}</span>
                            <span className="text-sm text-gray-800 font-medium flex-1 line-clamp-2">{s.recipe_title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 適用ボタン */}
              <button
                onClick={handleApply}
                disabled={applying || selected.size === 0}
                className="w-full mt-4 py-3.5 rounded-2xl bg-green-500 text-white font-bold text-sm active:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {applying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>献立に追加中…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>選択した献立を追加する（{selected.size}件）</span>
                  </>
                )}
              </button>
            </section>
          )}

          {/* 余白 */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
