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
  display_name: string | null;
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

  // メンバー追加
  const [showAddMember, setShowAddMember] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBirthDate, setNewBirthDate] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");

  // メンバー編集
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editRole, setEditRole] = useState("");

  // 表示名編集
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [displayNameInput, setDisplayNameInput] = useState(user.display_name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const router = useRouter();
  const supabase = createClient();

  const totalServings = familyMembers.reduce(
    (sum, m) => sum + getAgeCoefficient(m.birth_date),
    0
  );

  // ---- プロフィール保存 ----
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError("");
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayNameInput.trim() || null },
    });
    if (error) {
      setProfileError("保存に失敗しました");
    } else {
      setDisplayName(displayNameInput.trim());
      setShowEditProfile(false);
    }
    setSavingProfile(false);
  };

  // ---- メンバー追加 ----
  const handleAddMember = async () => {
    if (!newName || !newBirthDate) return;
    setAddError("");
    const { data, error } = await supabase
      .from("family_members")
      .insert({ name: newName, birth_date: newBirthDate, role: newRole || null })
      .select()
      .single();
    if (error) {
      setAddError(`エラー: ${error.message}`);
      return;
    }
    if (data) {
      setFamilyMembers((prev) => [...prev, data]);
      setNewName("");
      setNewBirthDate("");
      setNewRole("");
      setAddError("");
      setShowAddMember(false);
    }
  };

  // ---- メンバー編集開始 ----
  const handleStartEdit = (member: FamilyMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditBirthDate(member.birth_date);
    setEditRole(member.role ?? "");
  };

  // ---- メンバー編集保存 ----
  const handleSaveEdit = async () => {
    if (!editingMember || !editName || !editBirthDate) return;
    const { data, error } = await supabase
      .from("family_members")
      .update({ name: editName, birth_date: editBirthDate, role: editRole || null })
      .eq("id", editingMember.id)
      .select()
      .single();
    if (!error && data) {
      setFamilyMembers((prev) =>
        prev.map((m) => (m.id === editingMember.id ? data : m))
      );
      setEditingMember(null);
    }
  };

  // ---- メンバー削除 ----
  const handleDeleteMember = async (id: string) => {
    await supabase.from("family_members").delete().eq("id", id);
    setFamilyMembers((prev) => prev.filter((m) => m.id !== id));
    setEditingMember(null);
  };

  // ---- ログアウト ----
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const avatarLetter = (displayName || user.email).charAt(0).toUpperCase();

  return (
    <>
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* ヘッダー */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-800">設定</h1>
      </header>

      <div className="px-4 py-4 space-y-4">

        {/* ===== アカウント ===== */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            アカウント
          </h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* アバター＋名前 */}
            <button
              onClick={() => {
                setDisplayNameInput(displayName);
                setProfileError("");
                setShowEditProfile(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-500 font-bold text-xl">{avatarLetter}</span>
              </div>
              <div className="flex-1 text-left">
                {displayName ? (
                  <>
                    <p className="text-sm font-semibold text-gray-800">{displayName}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-800">{user.email}</p>
                    <p className="text-xs text-orange-400">表示名を設定する →</p>
                  </>
                )}
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            {/* ログアウト */}
            <div className="border-t border-gray-50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50"
              >
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-sm text-red-500 font-medium">ログアウト</span>
              </button>
            </div>
          </div>
        </section>

        {/* ===== 家族メンバー ===== */}
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
              <button
                key={member.id}
                onClick={() => handleStartEdit(member)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors text-left ${
                  idx < familyMembers.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-orange-400">
                    {member.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {member.name}
                    {member.role && (
                      <span className="ml-1.5 text-xs text-gray-400">({member.role})</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {getAgeLabel(member.birth_date)} ·{" "}
                    <span className="text-orange-400">
                      {getAgeCoefficient(member.birth_date)}人前
                    </span>
                  </p>
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
            <button
              onClick={() => {
                setNewName(""); setNewBirthDate(""); setNewRole("");
                setShowAddMember(true);
              }}
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

        {/* ===== 人前係数について ===== */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            人前係数について
          </h2>
          <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
            <p className="text-xs text-gray-400 mb-3">
              年齢に応じてレシピの分量を自動調整するための係数です。
            </p>
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

        {/* ===== アプリ情報 ===== */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            アプリ情報
          </h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
              <span className="text-sm text-gray-700">バージョン</span>
              <span className="text-sm text-gray-400">1.0.0</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-gray-700">Made with</span>
              <span className="text-sm text-gray-400">🍳 家族の味</span>
            </div>
          </div>
        </section>

      </div>
    </div>

      {/* ===== 表示名編集モーダル ===== */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-end">
          <div className="bg-white rounded-t-3xl w-full flex flex-col" style={{ maxHeight: "85vh" }}>
            <div className="flex items-center justify-between px-4 pt-5 pb-4 flex-shrink-0 border-b border-gray-50">
              <h3 className="text-lg font-bold text-gray-800">プロフィール編集</h3>
              <button onClick={() => setShowEditProfile(false)} className="text-gray-400 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">メールアドレス</label>
                  <div className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm text-gray-400">
                    {user.email}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">表示名</label>
                  <input
                    type="text"
                    placeholder="例: さとみ"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                {profileError && (
                  <p className="text-xs text-red-500">{profileError}</p>
                )}
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="w-full bg-orange-500 text-white py-4 rounded-2xl font-semibold text-base shadow-md disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {savingProfile ? "保存中..." : "保存する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== メンバー追加モーダル ===== */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-end">
          <div className="bg-white rounded-t-3xl w-full flex flex-col" style={{ maxHeight: "85vh" }}>
            <div className="flex items-center justify-between px-4 pt-5 pb-4 flex-shrink-0 border-b border-gray-50">
              <h3 className="text-lg font-bold text-gray-800">メンバーを追加</h3>
              <button onClick={() => setShowAddMember(false)} className="text-gray-400 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">名前 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    placeholder="例: たろう"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">生年月日 <span className="text-red-400">*</span></label>
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
                {(!newName || !newBirthDate) && (
                  <p className="text-xs text-gray-400">※ 名前と生年月日を入力してください</p>
                )}
                {addError && (
                  <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{addError}</p>
                )}
                <button
                  onClick={handleAddMember}
                  disabled={!newName || !newBirthDate}
                  className="w-full bg-orange-500 text-white py-4 rounded-2xl font-semibold text-base shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
                >
                  追加する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== メンバー編集モーダル ===== */}
      {editingMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-end">
          <div className="bg-white rounded-t-3xl w-full flex flex-col" style={{ maxHeight: "85vh" }}>
            <div className="flex items-center justify-between px-4 pt-5 pb-4 flex-shrink-0 border-b border-gray-50">
              <h3 className="text-lg font-bold text-gray-800">メンバーを編集</h3>
              <button onClick={() => setEditingMember(null)} className="text-gray-400 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">名前</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">生年月日</label>
                  <input
                    type="date"
                    value={editBirthDate}
                    onChange={(e) => setEditBirthDate(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">役割（任意）</label>
                  <input
                    type="text"
                    placeholder="例: パパ、ママ"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editName || !editBirthDate}
                  className="w-full bg-orange-500 text-white py-4 rounded-2xl font-semibold text-base shadow-md disabled:opacity-40 active:scale-95 transition-transform"
                >
                  保存する
                </button>
                <button
                  onClick={() => handleDeleteMember(editingMember.id)}
                  className="w-full py-3 rounded-2xl text-sm font-medium text-red-500 border border-red-200 active:bg-red-50 transition-colors"
                >
                  このメンバーを削除する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
