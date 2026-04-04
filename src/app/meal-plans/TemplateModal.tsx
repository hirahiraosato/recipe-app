"use client";

import { useState, useEffect } from "react";
import {
  saveMealPlanTemplate,
  getMealPlanTemplates,
  applyMealPlanTemplate,
  deleteMealPlanTemplate,
} from "./actions";

type MealPlan = {
  id: string;
  planned_date: string;
  meal_type: string;
  role: string | null;
  recipes: { id: string; title: string; image_url: string | null } | null;
};

type TemplateItem = {
  id: string;
  day_offset: number;
  meal_type: string;
  role: string;
  recipes: { id: string; title: string; image_url: string | null } | null;
};

type Template = {
  id: string;
  name: string;
  created_at: string;
  meal_plan_template_items: TemplateItem[];
};

const MEAL_LABEL: Record<string, string> = {
  breakfast: "朝 🌅",
  lunch: "昼 ☀️",
  dinner: "夜 🌙",
};

const DAY_LABELS = ["1日目(月)", "2日目(火)", "3日目(水)", "4日目(木)", "5日目(金)", "6日目(土)", "7日目(日)"];

export default function TemplateModal({
  mealPlans,
  todayStr,
  onClose,
  onApplied,
}: {
  mealPlans: MealPlan[];
  todayStr: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [mode, setMode] = useState<"menu" | "save" | "load">("menu");
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [applyStartDate, setApplyStartDate] = useState(todayStr);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 今日〜6日後の7日分
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  // 今週の献立（保存対象）
  const weekMeals = mealPlans.filter((mp) => weekDays.includes(mp.planned_date));
  const weekItems = weekMeals
    .filter((mp) => mp.recipes)
    .map((mp) => ({
      day_offset: weekDays.indexOf(mp.planned_date),
      meal_type: mp.meal_type,
      recipe_id: mp.recipes!.id,
      role: mp.role ?? "主菜",
    }));

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    const result = await getMealPlanTemplates();
    if (result.data) setTemplates(result.data as Template[]);
    setLoadingTemplates(false);
  };

  useEffect(() => {
    if (mode === "load") loadTemplates();
  }, [mode]);

  const handleSave = async () => {
    if (!templateName.trim() || saving) return;
    setSaving(true);
    const result = await saveMealPlanTemplate(templateName.trim(), weekItems);
    setSaving(false);
    if (result.error) {
      alert(result.error);
    } else {
      onClose();
    }
  };

  const handleApply = async () => {
    if (!selectedTemplateId || applying) return;
    setApplying(true);
    const result = await applyMealPlanTemplate(selectedTemplateId, applyStartDate);
    setApplying(false);
    if (result.error) {
      alert(result.error);
    } else {
      onApplied();
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMealPlanTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selectedTemplateId === id) setSelectedTemplateId(null);
    setDeleteConfirmId(null);
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full rounded-t-3xl flex flex-col" style={{ maxHeight: "88vh" }}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {mode !== "menu" && (
              <button onClick={() => { setMode("menu"); setSelectedTemplateId(null); }} className="text-gray-400 p-1 -ml-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h3 className="text-base font-bold text-gray-800">
              {mode === "menu" ? "📋 献立テンプレート" : mode === "save" ? "テンプレートに保存" : "テンプレートから読み込む"}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* ─── メニュー ─── */}
          {mode === "menu" && (
            <div className="space-y-3">
              <button
                onClick={() => setMode("save")}
                className="w-full flex items-center gap-4 p-4 bg-orange-50 border border-orange-200 rounded-2xl active:bg-orange-100 transition-colors text-left"
              >
                <span className="text-2xl">💾</span>
                <div>
                  <p className="text-sm font-bold text-orange-700">今週の献立を保存</p>
                  <p className="text-xs text-orange-400 mt-0.5">今日〜7日間の献立をテンプレートとして保存します</p>
                </div>
              </button>
              <button
                onClick={() => setMode("load")}
                className="w-full flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-2xl active:bg-gray-100 transition-colors text-left"
              >
                <span className="text-2xl">📂</span>
                <div>
                  <p className="text-sm font-bold text-gray-700">保存済みテンプレートを読み込む</p>
                  <p className="text-xs text-gray-400 mt-0.5">保存したテンプレートを任意の週に適用します</p>
                </div>
              </button>
            </div>
          )}

          {/* ─── 保存モード ─── */}
          {mode === "save" && (
            <div className="space-y-4">
              {weekItems.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-4xl mb-3">🍽️</p>
                  <p className="text-sm">今日〜7日間に献立が登録されていません</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">テンプレート名</label>
                    <input
                      autoFocus
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="例：定番週メニュー"
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">保存される献立（{weekItems.length}品）</p>
                    <div className="space-y-1.5">
                      {weekDays.map((date, idx) => {
                        const dayMeals = weekMeals.filter((mp) => mp.planned_date === date && mp.recipes);
                        if (dayMeals.length === 0) return null;
                        return (
                          <div key={date} className="bg-gray-50 rounded-xl px-3 py-2">
                            <p className="text-xs font-semibold text-gray-500 mb-1">{DAY_LABELS[idx]}</p>
                            {dayMeals.map((mp) => (
                              <p key={mp.id} className="text-xs text-gray-700">
                                {MEAL_LABEL[mp.meal_type]} {mp.recipes?.title}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── 読み込みモード ─── */}
          {mode === "load" && (
            <div className="space-y-4">
              {loadingTemplates ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm">保存済みテンプレートがありません</p>
                </div>
              ) : (
                <>
                  {/* テンプレート選択リスト */}
                  <div className="space-y-2">
                    {templates.map((tmpl) => (
                      <div key={tmpl.id}>
                        <button
                          onClick={() => setSelectedTemplateId(selectedTemplateId === tmpl.id ? null : tmpl.id)}
                          className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors text-left ${
                            selectedTemplateId === tmpl.id
                              ? "bg-orange-50 border-orange-300"
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-bold text-gray-800">{tmpl.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {tmpl.meal_plan_template_items.length}品 · {new Date(tmpl.created_at).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}保存
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(tmpl.id); }}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 active:bg-red-50"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selectedTemplateId === tmpl.id ? "bg-orange-500 border-orange-500" : "border-gray-300"
                            }`}>
                              {selectedTemplateId === tmpl.id && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </button>

                        {/* 選択中テンプレートの中身プレビュー */}
                        {selectedTemplateId === tmpl.id && tmpl.meal_plan_template_items.length > 0 && (
                          <div className="mt-1.5 bg-orange-50 rounded-xl px-3 py-2 space-y-1">
                            {Array.from({ length: 7 }, (_, i) => {
                              const dayItems = tmpl.meal_plan_template_items.filter((it) => it.day_offset === i);
                              if (dayItems.length === 0) return null;
                              return (
                                <div key={i}>
                                  <p className="text-[10px] font-semibold text-orange-400">{DAY_LABELS[i]}</p>
                                  {dayItems.map((it) => (
                                    <p key={it.id} className="text-xs text-orange-700">
                                      {MEAL_LABEL[it.meal_type]} {it.recipes?.title}
                                    </p>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 適用開始日 */}
                  {selectedTemplateId && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">適用開始日</label>
                      <input
                        type="date"
                        value={applyStartDate}
                        onChange={(e) => setApplyStartDate(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        この日を1日目として7日分の献立が登録されます
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* フッターボタン */}
        <div className="px-5 pb-6 pt-3 border-t border-gray-100 flex-shrink-0">
          {mode === "save" && weekItems.length > 0 && (
            <button
              onClick={handleSave}
              disabled={!templateName.trim() || saving}
              className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-bold text-sm disabled:opacity-40 active:scale-95 transition-transform"
            >
              {saving ? "保存中..." : "テンプレートとして保存する"}
            </button>
          )}
          {mode === "load" && selectedTemplateId && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-bold text-sm disabled:opacity-40 active:scale-95 transition-transform"
            >
              {applying ? "適用中..." : "この献立を読み込む"}
            </button>
          )}
        </div>
      </div>

      {/* 削除確認 */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-end"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 text-center">
              「{templates.find((t) => t.id === deleteConfirmId)?.name}」を削除しますか？
            </p>
            <button
              onClick={() => handleDelete(deleteConfirmId)}
              className="w-full bg-red-500 text-white py-3.5 rounded-xl font-bold text-sm"
            >
              削除する
            </button>
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold text-sm"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
