"use server";

import { createClient } from "@/lib/supabase/server";

// 手入力で食材を追加
export async function addShoppingItem(data: {
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  category: string;
  trip_half: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未ログイン");

  const { data: item, error } = await supabase
    .from("shopping_items")
    .insert({
      user_id: user.id,
      ingredient_name: data.ingredient_name,
      quantity: data.quantity,
      unit: data.unit,
      category: data.category,
      is_checked: false,
      trip_half: data.trip_half,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return item;
}

// 個別削除
export async function deleteShoppingItem(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未ログイン");

  await supabase
    .from("shopping_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
}

// チェック（取り消し線）トグル
export async function toggleShoppingItem(id: string, isChecked: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未ログイン");

  await supabase
    .from("shopping_items")
    .update({ is_checked: isChecked })
    .eq("id", id)
    .eq("user_id", user.id);
}

// 複数アイテムを一括削除（リセット）
export async function deleteShoppingItems(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未ログイン");

  await supabase
    .from("shopping_items")
    .delete()
    .in("id", ids)
    .eq("user_id", user.id);
}
