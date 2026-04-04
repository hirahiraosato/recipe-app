"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RECIPE_TAGS } from "@/lib/recipeTags";
import { parseFraction, formatAmount } from "@/lib/fractionUtils";
import { RECIPE_CATEGORIES } from "@/lib/recipeCategories";
import { RECIPE_CUISINES } from "@/lib/recipeCuisines";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredientCategories";
import RecipeImagePicker from "@/components/RecipeImagePicker";
import { uploadRecipeImage } from "@/lib/imageUpload";

type ParsedIngredient = {
  group_label: string;  // "A", "B", "下味" など（省略可）
  name: string;
  amount: string;   // 表示・編集用の文字列（"1/2", "2/3", "100" など）
  unit: string;
  category: string;
  order_index: number;
};

type ParsedStep = {
  step_number: number;
  step_text: string;
};

type ParsedRecipe = {
  title: string;
  image_url: string | null;
  servings_base: number;
  cooking_time_minutes: number | null;
  category: string | null;
  cuisine: string | null;
  notes: string | null;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
  tags: string[];
};

type Step = "input" | "loading" | "preview" | "saving";
type InputMode = "url" | "manual" | "image";

export default function NewRecipePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [manualText, setManualText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // 確認画面で追加・差し替えする画像
  const [confirmImageFile, setConfirmImageFile] = useState<File | null>(null);
  const [confirmImagePreview, setConfirmImagePreview] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<string[]>([]);
  const [error, setError] = useState("");

  const handleParse = async () => {
    if (inputMode === "url" && !url.trim()) {
      setError("URLを入力してください");
      return;
    }
    if (inputMode === "url") {
      try { new URL(url); } catch { setError("正しいURLを入力してください"); return; }
    }
    if (inputMode === "manual" && !manualText.trim()) {
      setError("レシピのテキストを入力してください");
      return;
    }
    if (inputMode === "image" && !imageFile) {
      setError("画像を選択してください");
      return;
    }

    setError("");
    setStep("loading");

    try {
      let body: Record<string, unknown>;
      if (inputMode === "url") {
        body = { url };
      } else if (inputMode === "image" && imageFile) {
        // 画像をbase64に変換
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]); // data:image/...;base64, を除去
          };
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
        body = { imageBase64: base64, mimeType: imageFile.type };
      } else {
        body = { manualText, url: "" };
      }

      const res = await fetch("/api/parse-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      });
      const data = await res.json();

      if (!res.ok) {
        // needsManual フラグがある場合は手動入力に自動切り替え
        if (data.needsManual && inputMode === "url") {
          setInputMode("manual");
          setError(data.error || "自動取得に失敗しました。レシピをコピーして手動入力してください。");
          setStep("input");
        } else {
          throw new Error(data.error || "解析に失敗しました");
        }
        return;
      }
      if (!data.steps) data.steps = [];
      if (!data.tags) data.tags = [];
      if (!data.image_url) data.image_url = null;
      // 材料の amount を数値→分数文字列に変換
      data.ingredients = (data.ingredients || []).map((ing: { group_label?: string; name: string; amount: number | null; unit: string; category: string; order_index: number }) => ({
        ...ing,
        group_label: ing.group_label ?? "",
        amount: ing.amount !== null && ing.amount !== undefined ? formatAmount(ing.amount) : "",
      }));
      setAiSuggestedTags(data.tags.length > 0 ? [...data.tags] : []);
      setParsed(data);
      setStep("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setStep("input");
    }
  };

  const handleSave = async () => {
    if (!parsed) return;
    setStep("saving");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // 確認画面で選択した画像をアップロード（仮IDで先行保存後にURLを更新）
    let imageUrl = parsed.image_url || null;

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        user_id: user.id,
        title: parsed.title,
        image_url: imageUrl,
        source_url: inputMode === "url" ? url : null,
        servings_base: parsed.servings_base || 2,
        cooking_time_minutes: parsed.cooking_time_minutes,
        category: parsed.category,
        cuisine: parsed.cuisine || null,
        notes: parsed.notes,
        tags: parsed.tags || [],
      })
      .select()
      .single();

    if (recipeError) {
      setError("保存に失敗しました: " + recipeError.message);
      setStep("preview");
      return;
    }

    // 確認画面で画像が選択されていればアップロードして更新
    if (confirmImageFile) {
      try {
        const uploadedUrl = await uploadRecipeImage(confirmImageFile, recipe.id);
        await supabase.from("recipes").update({ image_url: uploadedUrl }).eq("id", recipe.id);
      } catch (uploadErr) {
        console.error("画像アップロード失敗（レシピは保存済み）:", uploadErr);
        // 画像失敗はレシピ保存を止めない
      }
    }

    if (parsed.ingredients?.length > 0) {
      const ingredients = parsed.ingredients.map((ing, i) => ({
        recipe_id: recipe.id,
        group_label: ing.group_label.trim() || null,
        name: ing.name,
        amount: parseFraction(ing.amount),
        unit: ing.unit || "",
        category: ing.category || "その他",
        order_index: i,
      }));
      const { error: ingError } = await supabase.from("ingredients").insert(ingredients);
      if (ingError) {
        setError("材料の保存に失敗しました: " + ingError.message);
        setStep("preview");
        return;
      }
    }

    if (parsed.steps?.length > 0) {
      const steps = parsed.steps.map((s, i) => ({
        recipe_id: recipe.id,
        step_number: s.step_number || i + 1,
        step_text: s.step_text,
      }));
      const { error: stepsError } = await supabase.from("recipe_steps").insert(steps);
      if (stepsError) {
        console.error("手順の保存エラー:", stepsError.message);
        // 手順エラーは致命的でないので続行
      }
    }

    router.push(`/recipes/${recipe.id}`);
  };

  // ---- ローディング ----
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
          <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">AIがレシピを解析中...</p>
        <p className="text-gray-400 text-sm">少々お待ちください</p>
      </div>
    );
  }

  if (step === "saving") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
          <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">レシピを保存中...</p>
      </div>
    );
  }

  // ---- プレビュー ----
  if (step === "preview" && parsed) {
    return (
      <div className="min-h-screen bg-gray-50 pb-40 md:pb-24">
        <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
          <div className="px-4 py-3 flex items-center gap-3">
            <button onClick={() => setStep("input")} className="text-gray-500 p-1 -ml-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-800 flex-1">レシピの確認</h1>
            <span className="text-xs text-gray-400">編集できます</span>
          </div>
        </header>

        <div className="px-4 py-4 space-y-4">
          {/* 画像 */}
          <RecipeImagePicker
            currentUrl={parsed.image_url}
            previewUrl={confirmImagePreview}
            onFileSelect={(file, preview) => {
              setConfirmImageFile(file);
              setConfirmImagePreview(preview);
            }}
            onRemove={() => {
              setConfirmImageFile(null);
              setConfirmImagePreview(null);
              setParsed({ ...parsed, image_url: null });
            }}
          />

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <input
              value={parsed.title}
              onChange={(e) => setParsed({ ...parsed, title: e.target.value })}
              className="w-full text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-3 focus:outline-none focus:border-orange-400"
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">人数</p>
                <input
                  type="number"
                  value={parsed.servings_base || 2}
                  onChange={(e) => setParsed({ ...parsed, servings_base: Number(e.target.value) })}
                  className="w-full text-center text-base font-semibold text-gray-700 border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-orange-400"
                />
                <p className="text-xs text-gray-400 mt-0.5">人前</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">時間</p>
                <input
                  type="number"
                  value={parsed.cooking_time_minutes || ""}
                  onChange={(e) => setParsed({ ...parsed, cooking_time_minutes: e.target.value ? Number(e.target.value) : null })}
                  placeholder="--"
                  className="w-full text-center text-base font-semibold text-gray-700 border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-orange-400"
                />
                <p className="text-xs text-gray-400 mt-0.5">分</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">カテゴリ</p>
                <select
                  value={parsed.category || ""}
                  onChange={(e) => setParsed({ ...parsed, category: e.target.value || null })}
                  className="w-full text-center text-sm font-semibold text-gray-700 border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-orange-400 bg-white"
                >
                  <option value="">未選択</option>
                  {RECIPE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">ジャンル</p>
                <select
                  value={parsed.cuisine || ""}
                  onChange={(e) => setParsed({ ...parsed, cuisine: e.target.value || null })}
                  className="w-full text-center text-sm font-semibold text-gray-700 border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-orange-400 bg-white"
                >
                  <option value="">未選択</option>
                  {RECIPE_CUISINES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-800 mb-3">
              材料 ({parsed.servings_base}人前)
            </h2>
            <div className="space-y-2">
              {parsed.ingredients.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">材料が取り込めませんでした。下の「＋ 追加」から手動で入力してください。</p>
              )}
              {parsed.ingredients.map((ing, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      value={ing.group_label}
                      onChange={(e) => {
                        const newIngs = [...parsed.ingredients];
                        newIngs[i] = { ...newIngs[i], group_label: e.target.value };
                        setParsed({ ...parsed, ingredients: newIngs });
                      }}
                      placeholder="A"
                      maxLength={4}
                      className="w-10 text-center text-xs border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:border-orange-400 text-orange-500 font-bold"
                    />
                    <input
                      value={ing.name}
                      onChange={(e) => {
                        const newIngs = [...parsed.ingredients];
                        newIngs[i] = { ...newIngs[i], name: e.target.value };
                        setParsed({ ...parsed, ingredients: newIngs });
                      }}
                      placeholder="材料名"
                      className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ing.amount}
                      onChange={(e) => {
                        const newIngs = [...parsed.ingredients];
                        newIngs[i] = { ...newIngs[i], amount: e.target.value };
                        setParsed({ ...parsed, ingredients: newIngs });
                      }}
                      placeholder="1/2"
                      className="w-16 text-right text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                    />
                    <input
                      value={ing.unit}
                      onChange={(e) => {
                        const newIngs = [...parsed.ingredients];
                        newIngs[i] = { ...newIngs[i], unit: e.target.value };
                        setParsed({ ...parsed, ingredients: newIngs });
                      }}
                      placeholder="g"
                      className="w-12 text-sm text-gray-500 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newIngs = parsed.ingredients.filter((_, idx) => idx !== i);
                        setParsed({ ...parsed, ingredients: newIngs });
                      }}
                      className="flex-shrink-0 w-6 h-6 text-gray-300 hover:text-red-400 flex items-center justify-center text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                  {/* カテゴリ（AIが自動選択・修正可能） */}
                  <div className="pl-12">
                    <select
                      value={ing.category || "その他"}
                      onChange={(e) => {
                        const newIngs = [...parsed.ingredients];
                        newIngs[i] = { ...newIngs[i], category: e.target.value };
                        setParsed({ ...parsed, ingredients: newIngs });
                      }}
                      className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400 bg-white"
                    >
                      {INGREDIENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const newIng = { group_label: "", name: "", amount: "", unit: "", category: "その他", order_index: parsed.ingredients.length };
                setParsed({ ...parsed, ingredients: [...parsed.ingredients, newIng] });
              }}
              className="mt-3 w-full py-2 border border-dashed border-orange-300 rounded-lg text-orange-500 text-sm font-medium hover:bg-orange-50 transition-colors"
            >
              ＋ 材料を追加
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-800 mb-3">作り方</h2>
            <div className="space-y-3">
              {parsed.steps.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">手順が取り込めませんでした。下の「＋ 追加」から手動で入力してください。</p>
              )}
              {parsed.steps.map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-orange-500 text-white rounded-full text-xs font-bold flex items-center justify-center mt-1">
                    {i + 1}
                  </span>
                  <textarea
                    value={step.step_text}
                    onChange={(e) => {
                      const newSteps = [...parsed.steps];
                      newSteps[i] = { ...newSteps[i], step_text: e.target.value };
                      setParsed({ ...parsed, steps: newSteps });
                    }}
                    rows={2}
                    className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newSteps = parsed.steps.filter((_, idx) => idx !== i);
                      setParsed({ ...parsed, steps: newSteps });
                    }}
                    className="flex-shrink-0 w-6 h-6 text-gray-300 hover:text-red-400 flex items-center justify-center text-lg leading-none mt-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const newStep = { step_number: parsed.steps.length + 1, step_text: "" };
                setParsed({ ...parsed, steps: [...parsed.steps, newStep] });
              }}
              className="mt-3 w-full py-2 border border-dashed border-orange-300 rounded-lg text-orange-500 text-sm font-medium hover:bg-orange-50 transition-colors"
            >
              ＋ 手順を追加
            </button>
          </div>

          {/* タグ */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-bold text-gray-800">特徴・備考</h2>
              {aiSuggestedTags.length > 0 && (
                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">✨ AIが候補を提案</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {RECIPE_TAGS.map((tag) => {
                const selected = parsed.tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      const newTags = selected
                        ? parsed.tags.filter((t) => t !== tag.id)
                        : [...parsed.tags, tag.id];
                      setParsed({ ...parsed, tags: newTags });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      selected
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    <span>{tag.emoji}</span>
                    <span>{tag.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-40">
          <button
            onClick={handleSave}
            className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-bold text-base shadow-md active:scale-95 transition-transform"
          >
            このレシピを保存する
          </button>
        </div>
      </div>
    );
  }

  // ---- 入力 ----
  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 p-1 -ml-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-800">レシピを追加</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* 切り替えタブ */}
        <div className="bg-gray-100 rounded-xl p-1 flex">
          <button
            onClick={() => { setInputMode("url"); setError(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "url" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
            }`}
          >
            🔗 URL
          </button>
          <button
            onClick={() => { setInputMode("image"); setError(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "image" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
            }`}
          >
            📷 画像
          </button>
          <button
            onClick={() => { setInputMode("manual"); setError(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "manual" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
            }`}
          >
            ✏️ テキスト
          </button>
        </div>

        {inputMode === "image" ? (
          <>
            <div className="bg-purple-50 rounded-2xl p-4 flex gap-3">
              <span className="text-2xl flex-shrink-0">📷</span>
              <div>
                <p className="text-sm font-semibold text-purple-700 mb-1">画像から取り込む</p>
                <p className="text-xs text-purple-600 leading-relaxed">
                  レシピのスクリーンショットや写真を選択するとAIが自動で読み取ります
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                画像を選択
              </label>
              {imagePreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="選択した画像" className="w-full rounded-xl object-contain max-h-64" />
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-purple-300 transition-colors">
                  <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-400">タップして画像を選択</span>
                  <span className="text-xs text-gray-300 mt-1">JPG / PNG / WEBP</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImageFile(file);
                      setError("");
                      const reader = new FileReader();
                      reader.onload = () => setImagePreview(reader.result as string);
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
              {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            </div>
          </>
        ) : inputMode === "url" ? (
          <>
            <div className="bg-orange-50 rounded-2xl p-4 flex gap-3">
              <span className="text-2xl flex-shrink-0">✨</span>
              <div>
                <p className="text-sm font-semibold text-orange-700 mb-1">AIで自動取り込み</p>
                <p className="text-xs text-orange-600 leading-relaxed">
                  レシピURLを入力するとAIが材料・分量を自動で読み取ります
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                レシピのURL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(""); }}
                placeholder="https://cookpad.com/recipe/..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                autoFocus
              />
              {error && <p className="text-red-500 text-xs mt-2 whitespace-pre-line">{error}</p>}
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2 px-1">対応サイト（例）</p>
              <div className="flex flex-wrap gap-2">
                {["クックパッド", "白ごはん.com", "NHKきょうの料理", "みんなのきょうの料理"].map((site) => (
                  <span key={site} className="text-xs bg-white border border-gray-200 text-gray-500 px-3 py-1.5 rounded-full shadow-sm">
                    {site}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 px-1">
                ※クラシル・デリッシュキッチン等はURL取得非対応のため「テキスト入力」をご利用ください
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-blue-50 rounded-2xl p-4 flex gap-3">
              <span className="text-2xl flex-shrink-0">📋</span>
              <div>
                <p className="text-sm font-semibold text-blue-700 mb-1">テキストから取り込む</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  レシピページで <strong>Ctrl+A（全選択）→ Ctrl+C（コピー）</strong> してから貼り付けてください。<br />
                  材料・分量の部分が含まれていると精度が上がります。
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                レシピのテキスト
              </label>
              <textarea
                value={manualText}
                onChange={(e) => { setManualText(e.target.value); setError(""); }}
                placeholder={"ページ全体をコピー（Ctrl+A → Ctrl+C）して貼り付けてください\n材料・分量が含まれていると自動で読み取れます\n\n例：\n豆腐とわかめの味噌汁\n2人分 / 10分\n\n材料：\n豆腐 1/2丁\nわかめ 5g\nだし 400ml\n味噌 大さじ2..."}
                rows={12}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                autoFocus
              />
              {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            </div>

            {inputMode === "manual" && url && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  元レシピURL（任意）
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            )}
          </>
        )}

        <button
          onClick={handleParse}
          disabled={
            inputMode === "url" ? !url.trim() :
            inputMode === "image" ? !imageFile :
            !manualText.trim()
          }
          className="w-full bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white py-4 rounded-xl font-bold text-base shadow-md active:scale-95 transition-transform"
        >
          AIでレシピを取り込む
        </button>
      </div>
    </div>
  );
}
