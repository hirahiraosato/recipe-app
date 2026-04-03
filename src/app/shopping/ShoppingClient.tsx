"use client";

import { useState } from "react";
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

const TRIP_LABELS: Record<number, string> = {
  1: "前半",
  2: "後半",
};

const CATEGORIES = ["野菜", "肉類", "魚介類", "調味料", "その他"];

export default function ShoppingClient({
  initialItems,
}: {
  initialItems: ShoppingItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [activeTrip, setActiveTrip] = useState<1 | 2>(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 手入力フォームの状態
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCategory, setNewCategory] = useState("その他");
  const [addLoading, setAddLoading] = useState(false);

  const tripItems = items.filter(
    (item) => item.trip_half === activeTrip || item.trip_half === null
  );
  const unchecked = tripItems.filter((i) => !i.is_checked);
  const checked = tripItems.filter((i) => i.is_checked);

  // チェック（取り消し線）トグル
  const handleToggle = async (item: ShoppingItem) => {
    const newChecked = !item.is_checked;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_checked: newChecked } : i))
    );
    await toggleShoppingItem(item.id, newChecked);
  };

  // 個別削除
  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteShoppingItem(id);
  };

  // 完了済みのみ削除
  const handleDeleteChecked = async () => {
    const ids = checked.map((i) => i.id);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    await deleteShoppingItems(ids);
    setShowResetConfirm(false);
  };

  // 一括全削除
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

  const groupByCategory = (itemList: ShoppingItem[]) => {
    const groups: Record<string, ShoppingItem[]> = {};
    itemList.forEach((item) => {
      const cat = item.category ?? "その他";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  };

  const uncheckedGroups = groupByCategory(unchecked);

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
        {/* 残り件数 + 一括リセットボタン */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            残り <span className="font-semibold text-orange-500">{unchecked.length}</span> 品
            {checked.length > 0 && (
              <span className="text-gray-400 ml-1">（完了 {checked.length} 品）</span>
            )}
          </p>
          {tripItems.length > 0 && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-red-300 hover:text-red-400 transition-colors"
            >
              一括リセット
            </button>
          )}
        </div>

        {/* 未チェックアイテム（カテゴリ別） */}
        {Object.entries(uncheckedGroups).map(([category, catItems]) => (
          <div key={category} className="mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {category}
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {catItems.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    idx < catItems.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  {/* 取り消し線トグルボタン */}
                  <button
                    onClick={() => handleToggle(item)}
                    className="w-6 h-6 rounded-full border-2 border-orange-300 flex-shrink-0 active:scale-90 transition-transform"
                  />
                  <span className="flex-1 text-sm text-gray-800 text-left">
                    {item.ingredient_name}
                  </span>
                  {item.quantity && (
                    <span className="text-sm text-gray-400">
                      {item.quantity}{item.unit}
                    </span>
                  )}
                  {/* 削除ボタン */}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-400 active:scale-90 transition-all flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* チェック済み（取り消し線表示） */}
        {checked.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              完了 ({checked.length})
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm opacity-60">
              {checked.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    idx < checked.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  {/* チェック解除ボタン */}
                  <button
                    onClick={() => handleToggle(item)}
                    className="w-6 h-6 rounded-full bg-orange-400 flex-shrink-0 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <span className="flex-1 text-sm text-gray-400 line-through text-left">
                    {item.ingredient_name}
                  </span>
                  {item.quantity && (
                    <span className="text-sm text-gray-300">
                      {item.quantity}{item.unit}
                    </span>
                  )}
                  {/* 削除ボタン */}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="w-7 h-7 flex items-center justify-center text-gray-200 hover:text-red-300 active:scale-90 transition-all flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tripItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-gray-500 text-base font-medium">買い物リストが空です</p>
            <p className="text-gray-400 text-sm mt-1">
              献立を設定すると自動で生成されます
            </p>
          </div>
        )}
      </div>

      {/* 手入力追加ボタン（固定フッター） */}
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

      {/* 一括リセット確認ダイアログ */}
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

            {checked.length > 0 && (
              <button
                onClick={handleDeleteChecked}
                className="w-full bg-orange-50 text-orange-600 border border-orange-200 py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                完了済み（{checked.length}品）を削除
              </button>
            )}

            <button
              onClick={handleResetAll}
              className="w-full bg-red-50 text-red-500 border border-red-200 py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
            >
              リストを全て削除（{tripItems.length}品）
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
