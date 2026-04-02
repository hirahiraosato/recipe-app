import AppShell from "@/components/AppShell";

export default function MealPlansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
