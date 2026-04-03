"use client";

import { useState } from "react";
import { parseFraction, formatAmount } from "@/lib/fractionUtils";
import {
  addShoppingItem,
  deleteShoppingItem,
  toggleShoppingItem,
  deleteShoppingItems,
} from "./actions";

type ShoppingItem = {
  id: string;
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  is_checked: boolean;
  trip_half: number | null;
};

// 同名・同単位の食材を集約したビュー型
type AggregatedItem = {
  key: string;                 // ingredient_name + "|" + unit（グループキー）
  ingredient_name: string;
  totalQuantity: string | null; // 合算後の数量
  unit: string | null;
  category: string | null;
  allChecked: boolean;          // 全ソースアイテムがチェック済みか
  sourceIds: string[];          // 元アイテムのID一覧
  sourceCount: number;          // 何品分まとめたか
};

const TRIP_LABELS: Record<number, string> = {
  1: "前半",
  2: "後半",
};

const CATEGORIES = ["野菜", "肉類", "魚介類", "調味料", "その他"];

/** 同名・同単位でまとめて数量合算 */
function aggregateItems(itemList: ShoppingItem[]): AggregatedItem[] {
  const map = new Map<string, ShoppingItem[]>();

  for (const item of itemList) {
    const key = `${item.ingredient_name}|${item.unit ?? ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const result: AggregatedItem[] = [];
  for (const [key, group] of map.entries()) {
    const ref = group[0];

    // 数量を合算（DB から数値で返る場合も考慮して文字列に正規化）
    let totalNum: number | null = null;
    let hasQuantity = false;
    for (const it of group) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = it.quantity as any;
      if (raw == null || raw === "") continue;
      const n = typeof raw === "number" ? raw : parseFraction(String(raw));
      if (n !== null) {
        totalNum = (totalNum ?? 0) + n;
        hasQuantity = true;
      }
    }

    result.push({
      key,
      ingredient_name: ref.ingredient_name,
      totalQuantity: hasQuantity && totalNum !== null ? formatAmount(totalNum) : null,
      unit: ref.unit,
      category: ref.category,
      allChecked: group.every((i) => i.is_checked),
      sourceIds: group.map((i) => i.id),
      sourceCount: group.length,
    });
  }

  return result;
}

export default function ShoppingClient({
  initialItems,
}: {
  initialItems: ShoppingItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [activeTrip, setActiveTrip] = useState<1 | 2>(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCategory, setNewCategory] = useState("その他");
  const [addLoading, setAddLoading] = useState(false);

  const tripItems = items.filter(
    (item) => item.trip_half === activeTrip || item.trip_half === null
  );

  // 集約ビュー
  const aggregated = aggregateItems(tripItems);
  const uncheckedAgg = aggregated.filter((a) => !a.allChecked);
  const checkedAgg = aggregated.filter((a) => a.allChecked);

  // 元アイテム単位の残り数（チェックされていないソースアイテム数）
  const uncheckedSourceCount = tripItems.filter((i) => !i.is_checked).length;
  const checkedSourceCount = tripItems.filter((i) => i.is_checked).length;

  // チェック（取り消し線）トグル — グループ内の全アイテムをまとめてトグル
  const handleToggle = async (agg: AggregatedItem) => {
    const newChecked = !agg.allChecked;
    setItems((prev) =>
      prev.map((i) =>
        agg.sourceIds.includes(i.id) ? { ...i, is_checked: newChecked } : i
      )
    );
    await Promise.all(
      agg.sourceIds.map((id) => toggleShoppingItem(id, newChecked))
    );
  };

  // 個別削除 — グループ内の全アイテムを削除
  const handleDelete = async (agg: AggregatedItem) => {
    setItems((prev) => prev.filter((i) => !agg.sourceIds.includes(i.id)));
    await deleteShoppingItems(agg.sourceIds);
  };

  // 完了済みのみ削除
  const handleDeleteChecked = async () => {
    const ids = tripItems.filter((i) => i.is_checked).map((i) => i.id);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    await deleteShoppingItems(ids);
    setShowResetConfirm(false);
  };

  // 全削除
  const handleResetAll = async () => {
    const ids = tripItems.map((i) => i.id);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    await deleteShoppingItems(ids);
    setShowResetConfirm(false);
  };

  // 手入力で追加
  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAddLoading(true);
    try {
      const item = await addShoppingItem({
        ingredient_name: newName.trim(),
        quantity: newQty.trim() || null,
        unit: newUnit.trim() || null,
        category: newCategory,
        trip_half: activeTrip,
      });
      setItems((prev) => [...prev, item]);
      setNewName("");
      setNewQty("");
      setNewUnit("");
      setNewCategory("その他");
      setShowAddModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setAddLoading(false);
    }
  };

  const groupAggByCategory = (aggList: AggregatedItem[]) => {
    const groups: Record<string, AggregatedItem[]> = {};
    for (const agg of aggList) {
      const cat = agg.category ?? "その他";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(agg);
    }
    return groups;
  };

  const uncheckedGroups = groupAggByCategory(uncheckedAgg);

  /** アイテム行の共通UI */
  const ItemRow = ({
    agg,
    dimmed,
    borderBottom,
  }: {
    agg: AggregatedItem;
    dimmed?: boolean;
    borderBottom?: boolean;
  }) => (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${
        borderBottom ? "border-b border-gray-50" : ""
      }`}
    >
      {/* チェックボタン */}
      <button
        onClick={() => handleToggle(agg)}
        className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center active:scale-90 transition-transform ${
          agg.allChecked
            ? "bg-orange-400"
            : "border-2 border-orange-300"
        }`}
      >
        {agg.allChecked && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* 食材名 */}
      <span className={`flex-1 text-sm text-left ${dimmed ? "line-through text-gray-400" : "text-gray-800"}`}>
        {agg.ingredient_name}
        {/* 複数レシピからまとめた場合に件数表示 */}
        {agg.sourceCount > 1 && (
          <span className="ml-1.5 text-xs text-gray-400 not-italic">
            （{agg.sourceCount}品分）
          </span>
        )}
      </span>

      {/* 合計数量 */}
      {agg.totalQuantity !== null ? (
        <span className={`text-sm font-semibold flex-shrink-0 ${dimmed ? "text-gray-300" : "text-orange-500"}`}>
          {agg.totalQuantity}{agg.unit}
        </span>
      ) : agg.unit ? (
        <span className={`text-sm flex-shrink-0 ${dimmed ? "text-gray-300" : "text-gray-400"}`}>
          {agg.unit}
        </span>
      ) : null}

      {/* 削除ボタン */}
      <button
        onClick={() => handleDelete(agg)}
        className={`w-7 h-7 flex items-center justify-center active:scale-90 transition-all flex-shrink-0 ${
          dimmed ? "text-gray-200 hover:text-red-300" : "text-gray-300 hover:text-red-400"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold text-gray-800 mb-3">買い物リスト</h1>
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {([1, 2] as const).map((trip) => (
              <button
                key={trip}
                onClick={() => setActiveTrip(trip)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTrip === trip
                    ? "bg-white text-orange-500 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {TRIP_LABELS[trip]}の買い物
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-4 py-4">
        {/* 残り件数 + 一括リセット */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            残り <span className="font-semibold text-orange-500">{uncheckedAgg.length}</span> 品目
            {checkedSourceCount > 0 && (
              <span className="text-gray-400 ml-1">（完了 {checkedAgg.length} 品目）</span>
            )}
          </p>
          {aggregated.length > 0 && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-red-300 hover:text-red-400 transition-colors"
            >
              一括リセット
            </button>
          )}
        </div>

        {/* 未チェック（カテゴリ別） */}
        {Object.entries(uncheckedGroups).map(([category, catAggs]) => (
          <div key={category} className="mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {category}
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {catAggs.map((agg, idx) => (
                <ItemRow
                  key={agg.key}
                  agg={agg}
                  borderBottom={idx < catAggs.length - 1}
                />
              ))}
            </div>
          </div>
        ))}

        {/* チェック済み */}
        {checkedAgg.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              完了 ({checkedAgg.length} 品目)
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm opacity-60">
              {checkedAgg.map((agg, idx) => (
                <ItemRow
                  key={agg.key}
                  agg={agg}
                  dimmed
                  borderBottom={idx < checkedAgg.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {aggregated.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-gray-500 text-base font-medium">買い物リストが空です</p>
            <p className="text-gray-400 text-sm mt-1">
              献立を設定すると自動で生成されます
            </p>
          </div>
        )}
      </div>

      {/* 手入力追加ボタン */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 px-4 pb-4 pt-2 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent z-30 pointer-events-none">
        <button
          onClick={() => setShowAddModal(true)}
          className="pointer-events-auto w-full bg-orange-500 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          食材を手入力で追加
        </button>
      </div>

      {/* 手入力モーダル */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-800">食材を追加</h3>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">食材名 *</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleAdd(); }}
                placeholder="例：にんじん"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1">数量</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  placeholder="2"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1">単位</label>
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="本"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">カテゴリ</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      newCategory === cat
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={!newName.trim() || addLoading}
              className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-bold text-base disabled:opacity-40 active:scale-95 transition-transform"
            >
              {addLoading ? "追加中..." : "追加する"}
            </button>
            <button
              onClick={() => setShowAddModal(false)}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold text-sm"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 一括リセット確認 */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) setShowResetConfirm(false); }}
        >
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-3">
            <h3 className="text-base font-bold text-gray-800 text-center">リセット方法を選択</h3>
            <p className="text-xs text-gray-400 text-center">
              現在表示中の「{TRIP_LABELS[activeTrip]}の買い物」が対象です
            </p>

            {checkedSourceCount > 0 && (
              <button
                onClick={handleDeleteChecked}
                className="w-full bg-orange-50 text-orange-600 border border-orange-200 py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                完了済み（{checkedAgg.length}品目）を削除
              </button>
            )}

            <button
              onClick={handleResetAll}
              className="w-full bg-red-50 text-red-500 border border-red-200 py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
            >
              リストを全て削除（{aggregated.length}品目）
            </button>

            <button
              onClick={() => setShowResetConfirm(false)}
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
