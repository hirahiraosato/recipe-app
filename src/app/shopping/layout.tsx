import AppShell from "@/components/AppShell";

export default function ShoppingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
