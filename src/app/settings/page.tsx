import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("*")
    .order("birth_date", { ascending: true });

  return (
    <SettingsClient
      user={{
        email: user.email ?? "",
        id: user.id,
        display_name: (user.user_metadata?.display_name as string | null) ?? null,
      }}
      initialFamilyMembers={familyMembers ?? []}
    />
  );
}
