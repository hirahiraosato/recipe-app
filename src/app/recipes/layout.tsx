import AppShell from "@/components/AppShell";

export default function RecipesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
