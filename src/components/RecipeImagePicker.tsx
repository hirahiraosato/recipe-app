"use client";

import { useRef } from "react";
import { readFileAsDataUrl } from "@/lib/imageUpload";

type Props = {
  /** 現在保存されている画像URL（null = 未設定） */
  currentUrl: string | null;
  /** FileReaderで生成したプレビュー用data URL */
  previewUrl: string | null;
  onFileSelect: (file: File, preview: string) => void;
  onRemove: () => void;
};

export default function RecipeImagePicker({ currentUrl, previewUrl, onFileSelect, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** 表示する画像：新規選択プレビュー → 既存URL の優先順 */
  const displayUrl = previewUrl || currentUrl;

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // 同じファイルを再選択できるようリセット
    const preview = await readFileAsDataUrl(file);
    onFileSelect(file, preview);
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-gray-800">料理の写真</h2>
        {displayUrl && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-600"
          >
            削除
          </button>
        )}
      </div>

      {displayUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="レシピ画像"
            className="w-full rounded-xl object-cover aspect-video"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-black/80 transition-colors"
          >
            📷 写真を変更
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
        >
          <span className="text-3xl">📷</span>
          <span className="text-sm font-medium">写真を追加</span>
          <span className="text-xs">JPG / PNG / WEBP</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
