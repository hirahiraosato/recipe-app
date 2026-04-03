import { createClient } from "@/lib/supabase/client";

const BUCKET = "recipe-images";

/**
 * 画像ファイルをSupabase Storageにアップロードして公開URLを返す
 */
export async function uploadRecipeImage(file: File, recipeId: string): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${recipeId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return publicUrl;
}

/**
 * ファイルをFileReaderでdata URL（プレビュー用）に変換
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
