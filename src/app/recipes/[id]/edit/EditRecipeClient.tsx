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

type Ingredient = {
  id?: string;
  group_label: string;  // "A", "B", "下味" など（省略可）
  name: string;
  amount: string;   // 表示・編集用の文字列（"1/2", "2/3", "100" など）
  unit: string;
  category: string;
  order_index: number;
};

type IngredientFromDB = {
  id?: string;
  group_label?: string | null;
  name: string;
  amount: number | null;
  unit: string;
  category: string;
  order_index: number;
};

type Step = {
  id?: string;
  step_number: number;
  step_text: string;
};

type Recipe = {
  id: string;
  title: string;
  image_url: string | null;
  servings_base: number;
  cooking_time_minutes: number | null;
  category: string | null;
  cuisine: string | null;
  notes: string | null;
  family_note: string | null;
  source_url: string | null;
  tags: string[];
};

export default function EditRecipeClient({
  recipe,
  ingredients: initialIngredients,
  steps: initialSteps,
  allIngredientNames,
}: {
  recipe: Recipe;
  ingredients: IngredientFromDB[];
  steps: Step[];
  allIngredientNames: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 画像
  const [imageUrl, setImageUrl] = useState<string | null>(recipe.image_url);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [title, setTitle] = useState(recipe.title);
  const [servings, setServings] = useState(recipe.servings_base);
  const [cookingTime, setCookingTime] = useState<number | null>(recipe.cooking_time_minutes);
  const [category, setCategory] = useState(recipe.category || "");
  const [cuisine, setCuisine] = useState(recipe.cuisine || "");
  const [notes, setNotes] = useState(recipe.notes || "");
  const [familyNote, setFamilyNote] = useState(recipe.family_note || "");
  const [tags, setTags] = useState<string[]>(recipe.tags || []);

  const toggleTag = (id: string) =>
    setTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialIngredients.length > 0
      ? initialIngredients.map((ing) => ({
          ...ing,
          group_label: ing.group_label ?? "",
          amount: ing.amount !== null && ing.amount !== undefined ? formatAmount(ing.amount) : "",
        }))
      : [{ group_label: "", name: "", amount: "", unit: "", category: "その他", order_index: 0 }]
  );
  const [steps, setSteps] = useState<Step[]>(
    initialSteps.length > 0
      ? initialSteps
      : [{ step_number: 1, step_text: "" }]
  );

  const addIngredient = () => {
    setIngredients([...ingredients, { group_label: "", name: "", amount: "", unit: "", category: "その他", order_index: ingredients.length }]);
  };

  const removeIngredient = (i: number) => {
    setIngredients(ingredients.filter((_, idx) => idx !== i));
  };

  const addStep = () => {
    setSteps([...steps, { step_number: steps.length + 1, step_text: "" }]);
  };

  const removeStep = (i: number) => {
    const newSteps = steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 }));
    setSteps(newSteps);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError("レシピ名を入力してください"); return; }
    setSaving(true);
    setError("");

    const supabase = createClient();

    // 新しい画像があればアップロード
    let finalImageUrl = imageUrl;
    if (imageFile) {
      try {
        finalImageUrl = await uploadRecipeImage(imageFile, recipe.id);
      } catch (uploadErr) {
        const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        setError(msg);
        setSaving(false);
        return;
      }
    }

    // レシピ本体を更新
    const { error: recipeError } = await supabase
      .from("recipes")
      .update({
        title: title.trim(),
        image_url: finalImageUrl,
        servings_base: servings,
        cooking_time_minutes: cookingTime,
        category: category || null,
        cuisine: cuisine || null,
        notes: notes || null,
        family_note: familyNote || null,
        tags,
      })
      .eq("id", recipe.id);

    if (recipeError) {
      setError("保存に失敗しました: " + recipeError.message);
      setSaving(false);
      return;
    }

    // 材料を削除してから再挿入
    await supabase.from("ingredients").delete().eq("recipe_id", recipe.id);
    const validIngredients = ingredients.filter((ing) => ing.name.trim());
    if (validIngredients.length > 0) {
      const { error: ingError } = await supabase.from("ingredients").insert(
        validIngredients.map((ing, i) => ({
          recipe_id: recipe.id,
          group_label: ing.group_label.trim() || null,
          name: ing.name.trim(),
          amount: parseFraction(ing.amount),
          unit: ing.unit || "",
          category: ing.category || "その他",
          order_index: i,
        }))
      );
      if (ingError) {
        setError("材料の保存に失敗しました: " + ingError.message);
        setSaving(false);
        return;
      }
    }

    // 手順を削除してから再挿入
    await supabase.from("recipe_steps").delete().eq("recipe_id", recipe.id);
    const validSteps = steps.filter((s) => s.step_text.trim());
    if (validSteps.length > 0) {
      await supabase.from("recipe_steps").insert(
        validSteps.map((s, i) => ({
          recipe_id: recipe.id,
          step_number: i + 1,
          step_text: s.step_text.trim(),
        }))
      );
    }

    router.push(`/recipes/${recipe.id}`);
  };

  if (saving) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
          <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">保存中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-40 md:pb-24">
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 p-1 -ml-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-800 flex-1">レシピを編集</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* 画像 */}
        <RecipeImagePicker
          currentUrl={imageUrl}
          previewUrl={imagePreview}
          onFileSelect={(file, preview) => {
            setImageFile(file);
            setImagePreview(preview);
          }}
          onRemove={() => {
            setImageFile(null);
            setImagePreview(null);
            setImageUrl(null);
          }}
        />

        {/* 基本情報 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">レシピ名</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-base font-bold text-gray-800 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">人数</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={servings}
                  onChange={(e) => setServings(Number(e.target.value))}
                  className="w-full text-center text-base font-semibold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-orange-400"
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">人前</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">時間</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={cookingTime ?? ""}
                  onChange={(e) => setCookingTime(e.target.value ? Number(e.target.value) : null)}
                  placeholder="--"
                  className="w-full text-center text-base font-semibold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-orange-400"
                />
                <span className="text-xs text-gray-400">分</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">カテゴリ</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-center text-sm font-semibold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-orange-400 bg-white"
              >
                <option value="">未選択</option>
                {RECIPE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">ジャンル</label>
              <select
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                className="w-full text-center text-sm font-semibold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-orange-400 bg-white"
              >
                <option value="">未選択</option>
                {RECIPE_CUISINES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 材料 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-1">材料</h2>
          <p className="text-xs text-gray-400 mb-3">
            グループ欄に「A」「B」「下味」などを入れると、材料名と区別して管理できます（買い物リストには材料名のみ反映）
          </p>

          {/* オートコンプリート候補 */}
          <datalist id="ingredient-names">
            {allIngredientNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  {/* グループラベル（省略可能） */}
                  <input
                    value={ing.group_label}
                    onChange={(e) => {
                      const n = [...ingredients];
                      n[i] = { ...n[i], group_label: e.target.value };
                      setIngredients(n);
                    }}
                    placeholder="A"
                    maxLength={4}
                    className="w-10 text-center text-xs border border-gray-200 rounded-lg px-1 py-2 focus:outline-none focus:border-orange-400 text-orange-500 font-bold"
                  />
                  {/* 材料名（オートコンプリート付き） */}
                  <input
                    list="ingredient-names"
                    value={ing.name}
                    onChange={(e) => {
                      const n = [...ingredients];
                      n[i] = { ...n[i], name: e.target.value };
                      setIngredients(n);
                    }}
                    placeholder="材料名"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ing.amount}
                    onChange={(e) => {
                      const n = [...ingredients];
                      n[i] = { ...n[i], amount: e.target.value };
                      setIngredients(n);
                    }}
                    placeholder="1/2"
                    className="w-16 text-right text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-orange-400"
                  />
                  <input
                    value={ing.unit}
                    onChange={(e) => {
                      const n = [...ingredients];
                      n[i] = { ...n[i], unit: e.target.value };
                      setIngredients(n);
                    }}
                    placeholder="単位"
                    className="w-14 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-orange-400"
                  />
                  <button
                    onClick={() => removeIngredient(i)}
                    className="text-gray-300 hover:text-red-400 flex-shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* カテゴリ（買い物リスト分類用） */}
                <div className="pl-12">
                  <select
                    value={ing.category}
                    onChange={(e) => {
                      const n = [...ingredients];
                      n[i] = { ...n[i], category: e.target.value };
                      setIngredients(n);
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
            onClick={addIngredient}
            className="mt-3 w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
          >
            + 材料を追加
          </button>
        </div>

        {/* 作り方 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-3">作り方</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-orange-500 text-white rounded-full text-xs font-bold flex items-center justify-center mt-2">
                  {i + 1}
                </span>
                <textarea
                  value={step.step_text}
                  onChange={(e) => {
                    const n = [...steps];
                    n[i] = { ...n[i], step_text: e.target.value };
                    setSteps(n);
                  }}
                  placeholder={`手順 ${i + 1}`}
                  rows={2}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 resize-none"
                />
                <button
                  onClick={() => removeStep(i)}
                  className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addStep}
            className="mt-3 w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
          >
            + 手順を追加
          </button>
        </div>

        {/* タグ */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-3">特徴・備考</h2>
          <div className="flex flex-wrap gap-2">
            {RECIPE_TAGS.map((tag) => {
              const selected = tags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
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

        {/* メモ */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-2">メモ</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="コツ・ポイントなど"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 resize-none"
          />
        </div>

        {/* 家族メモ */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-amber-700 mb-2">👨‍👩‍👧‍👦 家族メモ</h2>
          <textarea
            value={familyNote}
            onChange={(e) => setFamilyNote(e.target.value)}
            placeholder="例：子どもに大好評！次回は薄味で。"
            rows={3}
            className="w-full text-sm border border-amber-300 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400 bg-white resize-none"
          />
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
          保存する
        </button>
      </div>
    </div>
  );
}
