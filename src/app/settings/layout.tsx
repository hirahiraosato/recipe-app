import BottomNav from "@/components/BottomNav";

export default function SettingsLayout({
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
