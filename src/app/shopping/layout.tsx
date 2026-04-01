import BottomNav from "@/components/BottomNav";

export default function ShoppingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="pb-safe">{children}</main>
      <BottomNav />
    </>
  );
}
