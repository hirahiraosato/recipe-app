import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ShoppingClient from "./ShoppingClient";

export default async function ShoppingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: items } = await supabase
    .from("shopping_items")
    .select("*")
    .order("category", { ascending: true })
    .order("is_checked", { ascending: true });

  return <ShoppingClient initialItems={items ?? []} />;
}
