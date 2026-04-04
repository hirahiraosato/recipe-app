"use client";

import { useState, useRef, useEffect } from "react";
import { parseFraction, formatAmount } from "@/lib/fractionUtils";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredientCategories";

const CATEGORY_ORDER_KEY = "shopping_category_order";
import {
  addShoppingItem,
  deleteShoppingItem,
  toggleShoppingItem,
  deleteShoppingItems,
  togglePendingShoppingItem,
} from "./actions";

type ShoppingItem = {
  id: string;
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  is_checked: boolean;
  is_pending: boolean;
};

// 同名・同単位の食材を集約したビュー型
type AggregatedItem = {
  key: string;
  ingredient_name: string;
  totalQuantity: string | null;
  unit: string | null;
  category: string | null;
  allChecked: boolean;
  allPending: boolean;
  sourceIds: string[];
  sourceCount: number;
};

const CATEGORIES = INGREDIENT_CATEGORIES;

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
      allPending: group.every((i) => i.is_pending),
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
  const [categoryOrder, setCategoryOrder] = useState<string[]>([...INGREDIENT_CATEGORIES]);
  const [showSortModal, setShowSortModal] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([...INGREDIENT_CATEGORIES]);
  const [contextMenuAgg, setContextMenuAgg] = useState<AggregatedItem | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  // localStorageからカテゴリ順を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CATEGORY_ORDER_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        // 新カテゴリが追加された場合は末尾に追加
        const merged = [
          ...parsed.filter((c) => (INGREDIENT_CATEGORIES as readonly string[]).includes(c)),
          ...INGREDIENT_CATEGORIES.filter((c) => !parsed.includes(c)),
        ];
        setCategoryOrder(merged);
        setDraftOrder(merged);
      }
    } catch { /* ignore */ }
  }, []);

  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCategory, setNewCategory] = useState("その他");
  const [addLoading, setAddLoading] = useState(false);

  const aggregated = aggregateItems(items);
  const uncheckedAgg = aggregated.filter((a) => !a.allChecked);
  const checkedAgg = aggregated.filter((a) => a.allChecked);
  const checkedSourceCount = items.filter((i) => i.is_checked).length;

  const handleCopyList = async () => {
    const lines: string[] = ["【買い物リスト】"];
    const groupsRaw = groupAggByCategory(uncheckedAgg);
    const orderedKeys = [
      ...categoryOrder.filter((c) => groupsRaw[c]),
      ...Object.keys(groupsRaw).filter((c) => !categoryOrder.includes(c)),
    ];
    for (const cat of orderedKeys) {
      const catAggs = groupsRaw[cat];
      lines.push(`\n▼ ${cat}`);
      for (const agg of catAggs) {
        const qty = agg.totalQuantity ? `${agg.totalQuantity}${agg.unit ?? ""}` : (agg.unit ?? "");
        lines.push(`□ ${agg.ingredient_name}${qty ? `　${qty}` : ""}`);
      }
    }
    if (checkedAgg.length > 0) {
      lines.push("\n▼ 完了済み");
      for (const agg of checkedAgg) {
        const qty = agg.totalQuantity ? `${agg.totalQuantity}${agg.unit ?? ""}` : (agg.unit ?? "");
        lines.push(`✓ ${agg.ingredient_name}${qty ? `　${qty}` : ""}`);
      }
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  // チェックトグル
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

  // 長押し開始・終了
  const handleLongPressStart = (agg: AggregatedItem) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenuAgg(agg);
    }, 500);
  };
  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // 保留トグル
  const handleTogglePending = async (agg: AggregatedItem) => {
    const newPending = !agg.allPending;
    setItems((prev) =>
      prev.map((i) =>
        agg.sourceIds.includes(i.id) ? { ...i, is_pending: newPending } : i
      )
    );
    await Promise.all(
      agg.sourceIds.map((id) => togglePendingShoppingItem(id, newPending))
    );
    setContextMenuAgg(null);
  };

  // 個別削除
  const handleDelete = async (agg: AggregatedItem) => {
    setItems((prev) => prev.filter((i) => !agg.sourceIds.includes(i.id)));
    await deleteShoppingItems(agg.sourceIds);
  };

  // 完了済みのみ削除
  const handleDeleteChecked = async () => {
    const ids = items.filter((i) => i.is_checked).map((i) => i.id);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    await deleteShoppingItems(ids);
    setShowResetConfirm(false);
  };

  // 全削除
  const handleResetAll = async () => {
    const ids = items.map((i) => i.id);
    setItems([]);
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

  // カテゴリ並び替えモーダルの操作
  const moveDraftCategory = (index: number, direction: -1 | 1) => {
    const next = [...draftOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraftOrder(next);
  };

  const saveCategoryOrder = () => {
    setCategoryOrder(draftOrder);
    localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(draftOrder));
    setShowSortModal(false);
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

  const uncheckedGroupsRaw = groupAggByCategory(uncheckedAgg);
  // categoryOrder に従って並び替え、未定義カテゴリは末尾
  const orderedCategoryKeys = [
    ...categoryOrder.filter((c) => uncheckedGroupsRaw[c]),
    ...Object.keys(uncheckedGroupsRaw).filter((c) => !categoryOrder.includes(c)),
  ];
  const uncheckedGroups: [string, AggregatedItem[]][] = orderedCategoryKeys.map(
    (c) => [c, uncheckedGroupsRaw[c]]
  );

  /** アイテム行 */
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
      className={`flex items-center gap-3 px-4 py-3.5 select-none group ${
        borderBottom ? "border-b border-gray-50" : ""
      } ${agg.allPending ? "bg-gray-50/60" : ""}`}
      onTouchStart={() => handleLongPressStart(agg)}
      onTouchEnd={handleLongPressEnd}
      onTouchMove={handleLongPressEnd}
      onMouseEnter={() => setHoveredKey(agg.key)}
      onMouseLeave={() => setHoveredKey(null)}
    >
      <button
        onClick={() => handleToggle(agg)}
        className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center active:scale-90 transition-transform ${
          agg.allChecked
            ? "bg-orange-400"
            : agg.allPending
            ? "border-2 border-gray-300"
            : "border-2 border-orange-300"
        }`}
      >
        {agg.allChecked && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <span className={`flex-1 text-sm text-left ${dimmed ? "line-through text-gray-400" : agg.allPending ? "text-gray-400" : "text-gray-800"}`}>
        {agg.ingredient_name}
        {agg.sourceCount > 1 && (
          <span className="ml-1.5 text-xs text-gray-400 not-italic">
            （{agg.sourceCount}品分）
          </span>
        )}
        {agg.allPending && (
          <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">保留</span>
        )}
      </span>

      {agg.totalQuantity !== null ? (
        <span className={`text-sm font-semibold flex-shrink-0 ${dimmed || agg.allPending ? "text-gray-300" : "text-orange-500"}`}>
          {agg.totalQuantity}{agg.unit}
        </span>
      ) : agg.unit ? (
        <span className={`text-sm flex-shrink-0 ${dimmed || agg.allPending ? "text-gray-300" : "text-gray-400"}`}>
          {agg.unit}
        </span>
      ) : null}

      {/* PC: ホバー時に⋯ボタン表示 */}
      <button
        onClick={() => setContextMenuAgg(agg)}
        className={`w-7 h-7 flex items-center justify-center flex-shrink-0 transition-all rounded-full hover:bg-gray-100 text-gray-400
          ${hoveredKey === agg.key ? "opacity-100" : "opacity-0 pointer-events-none"}
          hidden md:flex`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
        </svg>
      </button>

      <button
        onClick={() => handleDelete(agg)}
        className={`w-7 h-7 flex items-center justify-center active:scale-90 transition-all flex-shrink-0 ${
          dimmed || agg.allPending ? "text-gray-200 hover:text-red-300" : "text-gray-300 hover:text-red-400"
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
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">買い物リスト</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setDraftOrder([...categoryOrder]); setShowSortModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 font-medium active:bg-gray-50 transition-colors"
              title="カテゴリ順を変更"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
              並び替え
            </button>
            <button
              onClick={handleCopyList}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 font-medium active:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              LINEで送る
            </button>
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
        {uncheckedGroups.map(([category, catAggs]) => (
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

      {/* コピー完了トースト */}
      {copyToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[70] bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg whitespace-nowrap">
          ✓ コピーしました
        </div>
      )}

      {/* 長押しコンテキストメニュー */}
      {contextMenuAgg && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setContextMenuAgg(null)}
        >
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 text-center line-clamp-1">{contextMenuAgg.ingredient_name}</p>
            <button
              onClick={() => handleTogglePending(contextMenuAgg)}
              className="w-full bg-gray-50 text-gray-700 border border-gray-200 py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
            >
              {contextMenuAgg.allPending ? "保留を解除する" : "保留にする"}
            </button>
            <button
              onClick={() => { handleDelete(contextMenuAgg); setContextMenuAgg(null); }}
              className="w-full bg-red-50 text-red-500 border border-red-200 py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
            >
              削除する
            </button>
            <button
              onClick={() => setContextMenuAgg(null)}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold text-sm"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* カテゴリ並び替えモーダル */}
      {showSortModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSortModal(false); }}
        >
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[80vh] flex flex-col">
            <h3 className="text-base font-bold text-gray-800 text-center flex-shrink-0">
              カテゴリの表示順
            </h3>
            <p className="text-xs text-gray-400 text-center -mt-2 flex-shrink-0">
              ▲▼で並び替えて保存してください
            </p>
            <div className="overflow-y-auto flex-1 space-y-2">
              {draftOrder.map((cat, idx) => (
                <div key={cat} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                  <span className="flex-1 text-sm text-gray-700 font-medium">{cat}</span>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveDraftCategory(idx, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-400 disabled:opacity-20 active:bg-gray-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveDraftCategory(idx, 1)}
                      disabled={idx === draftOrder.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-400 disabled:opacity-20 active:bg-gray-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowSortModal(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={saveCategoryOrder}
                className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                保存する
              </button>
            </div>
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
