"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addFamilyMember(data: {
  name: string;
  birth_date: string;
  role: string | null;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  const { data: member, error } = await supabase
    .from("family_members")
    .insert({ user_id: user.id, ...data })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { data: member };
}

export async function updateFamilyMember(
  id: string,
  data: { name: string; birth_date: string; role: string | null }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  const { data: member, error } = await supabase
    .from("family_members")
    .update(data)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { data: member };
}

export async function deleteFamilyMember(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "ログインが必要です" };

  const { error } = await supabase
    .from("family_members")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { data: true };
}
