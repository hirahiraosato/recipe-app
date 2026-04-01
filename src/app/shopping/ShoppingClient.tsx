"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ShoppingItem = {
  id: string;
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  is_checked: boolean;
  trip_half: number | null; // 1=前半, 2=後半
};

const TRIP_LABELS: Record<number, string> = {
  1: "前半",
  2: "後半",
};

export default function ShoppingClient({
  initialItems,
}: {
  initialItems: ShoppingItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [activeTrip, setActiveTrip] = useState<1 | 2>(1);
  const supabase = createClient();

  const tripItems = items.filter(
    (item) => item.trip_half === activeTrip || item.trip_half === null
  );
  const unchecked = tripItems.filter((i) => !i.is_checked);
  const checked = tripItems.filter((i) => i.is_checked);

  const toggleItem = async (item: ShoppingItem) => {
    const newChecked = !item.is_checked;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_checked: newChecked } : i))
    );
    await supabase
      .from("shopping_items")
      .update({ is_checked: newChecked })
      .eq("id", item.id);
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
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold text-gray-800 mb-3">買い物リスト</h1>
          {/* 前半/後半 タブ */}
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
        {/* 残りアイテム数 */}
        <p className="text-sm text-gray-500 mb-4">
          残り <span className="font-semibold text-orange-500">{unchecked.length}</span> 品
        </p>

        {/* 未チェックアイテム（カテゴリ別） */}
        {Object.entries(uncheckedGroups).map(([category, catItems]) => (
          <div key={category} className="mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {category}
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {catItems.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors ${
                    idx < catItems.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <div className="w-6 h-6 rounded-full border-2 border-orange-300 flex-shrink-0" />
                  <span className="flex-1 text-left text-sm text-gray-800">
                    {item.ingredient_name}
                  </span>
                  {item.quantity && (
                    <span className="text-sm text-gray-400">
                      {item.quantity}
                      {item.unit}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* チェック済み */}
        {checked.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              完了 ({checked.length})
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm opacity-60">
              {checked.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors ${
                    idx < checked.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-orange-400 flex-shrink-0 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="flex-1 text-left text-sm text-gray-400 line-through">
                    {item.ingredient_name}
                  </span>
                  {item.quantity && (
                    <span className="text-sm text-gray-300">
                      {item.quantity}
                      {item.unit}
                    </span>
                  )}
                </button>
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
    </div>
  );
}
