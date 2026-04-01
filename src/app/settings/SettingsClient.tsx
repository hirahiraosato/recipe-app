"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type FamilyMember = {
  id: string;
  name: string;
  birth_date: string;
  role: string | null;
};

type User = {
  email: string;
  id: string;
};

function getAgeCoefficient(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  const ageInMonths =
    (today.getFullYear() - birth.getFullYear()) * 12 +
    (today.getMonth() - birth.getMonth());
  const ageInYears = ageInMonths / 12;

  if (ageInYears < 1) return 0.2;
  if (ageInYears < 3) return 0.3;
  if (ageInYears < 6) return 0.5;
  if (ageInYears < 13) return 0.7;
  return 1.0;
}

function getAgeLabel(birthDate: string): string {
  const today = new Date();
  const birth = new Date(birthDate);
  const years =
    today.getFullYear() -
    birth.getFullYear() -
    (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  return `${years}歳`;
}

export default function SettingsClient({
  user,
  initialFamilyMembers,
}: {
  user: User;
  initialFamilyMembers: FamilyMember[];
}) {
  const [familyMembers, setFamilyMembers] = useState(initialFamilyMembers);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBirthDate, setNewBirthDate] = useState("");
  const [newRole, setNewRole] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const totalServings = familyMembers.reduce(
    (sum, m) => sum + getAgeCoefficient(m.birth_date),
    0
  );

  const handleAddMember = async () => {
    if (!newName || !newBirthDate) return;
    const { data, error } = await supabase
      .from("family_members")
      .insert({ name: newName, birth_date: newBirthDate, role: newRole || null })
      .select()
      .single();
    if (!error && data) {
      setFamilyMembers((prev) => [...prev, data]);
      setNewName("");
      setNewBirthDate("");
      setNewRole("");
      setShowAddMember(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    await supabase.from("family_members").delete().eq("id", id);
    setFamilyMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-800">設定</h1>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* アカウント */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            アカウント
          </h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-orange-500 font-bold text-lg">
                  {user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{user.email}</p>
                <p className="text-xs text-gray-400">Googleアカウント</p>
              </div>
            </div>
            <div className="border-t border-gray-50">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-3.5 text-left text-sm text-red-500 font-medium active:bg-gray-50"
              >
                ログアウト
              </button>
            </div>
          </div>
        </section>

        {/* 家族メンバー */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              家族メンバー
            </h2>
            <span className="text-xs text-orange-500 font-semibold">
              合計 {totalServings.toFixed(1)} 人前
            </span>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {familyMembers.map((member, idx) => (
              <div
                key={member.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  idx < familyMembers.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-orange-400">
                    {member.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{member.name}</p>
                  <p className="text-xs text-gray-400">
                    {getAgeLabel(member.birth_date)} ·{" "}
                    <span className="text-orange-400">
                      {getAgeCoefficient(member.birth_date)}人前
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteMember(member.id)}
                  className="text-gray-300 active:text-red-400 transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => setShowAddMember(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-gray-50 active:bg-gray-50 transition-colors"
            >
              <div className="w-9 h-9 rounded-full border-2 border-dashed border-orange-200 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm text-orange-400 font-medium">メンバーを追加</span>
            </button>
          </div>
        </section>

        {/* 人前係数の説明 */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            人前係数について
          </h2>
          <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
            <div className="space-y-1.5 text-sm text-gray-600">
              {[
                ["0歳", "0.2人前"],
                ["1〜2歳", "0.3人前"],
                ["3〜5歳", "0.5人前"],
                ["6〜12歳", "0.7人前"],
                ["大人", "1.0人前"],
              ].map(([age, coef]) => (
                <div key={age} className="flex justify-between">
                  <span className="text-gray-500">{age}</span>
                  <span className="font-medium text-orange-500">{coef}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* メンバー追加モーダル */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
          <div className="bg-white rounded-t-3xl w-full px-4 pt-5 pb-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">メンバーを追加</h3>
              <button
                onClick={() => setShowAddMember(false)}
                className="text-gray-400 p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">名前</label>
                <input
                  type="text"
                  placeholder="例: たろう"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">生年月日</label>
                <input
                  type="date"
                  value={newBirthDate}
                  onChange={(e) => setNewBirthDate(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">役割（任意）</label>
                <input
                  type="text"
                  placeholder="例: パパ、ママ"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <button
                onClick={handleAddMember}
                disabled={!newName || !newBirthDate}
                className="w-full bg-orange-500 text-white py-4 rounded-2xl font-semibold text-base shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
