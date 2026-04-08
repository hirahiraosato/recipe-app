import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredientCategories";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Supabase client for fetching existing ingredient names
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 既存の食材名をDBから取得
async function fetchExistingIngredientNames(): Promise<string[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("ingredients")
      .select("name")
      .limit(1000);
    if (error || !data) return [];
    // 重複を除いてソート
    return [...new Set(data.map((d: { name: string }) => d.name))].sort();
  } catch {
    return [];
  }
}

// カタカナ → ひらがな変換（正規化用）
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

// 食材名を既存の名前に正規化する
function normalizeIngredientName(name: string, existingNames: string[]): string {
  if (!existingNames.length) return name;

  // 完全一致チェック
  if (existingNames.includes(name)) return name;

  // ひらがな正規化して比較
  const nameHira = katakanaToHiragana(name).toLowerCase();
  for (const existing of existingNames) {
    if (katakanaToHiragana(existing).toLowerCase() === nameHira) {
      return existing;
    }
  }

  return name;
}
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Gemini REST APIを直接呼ぶ（テキスト）
async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// Gemini Vision API（画像 + テキスト）
async function callGeminiVision(imageBase64: string, mimeType: string, prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Vision API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// 画像URLを抽出（JSON-LD → OGP の順で試みる）
function extractImageUrl(html: string, recipe?: Record<string, unknown>): string | null {
  // JSON-LD の image フィールド
  if (recipe) {
    const img = recipe.image;
    if (typeof img === "string" && img.startsWith("http")) return img;
    if (Array.isArray(img)) {
      const first = img[0];
      if (typeof first === "string" && first.startsWith("http")) return first;
      if (first && typeof first === "object" && typeof (first as Record<string, unknown>).url === "string") return (first as Record<string, unknown>).url as string;
    }
    if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string") return (img as Record<string, unknown>).url as string;
  }
  // OGP meta tag
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch) return ogMatch[1];
  return null;
}

// JSON-LD からレシピを抽出
function extractFromJsonLd(html: string) {
  const scriptMatches = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!scriptMatches) return null;

  for (const script of scriptMatches) {
    try {
      const content = script
        .replace(/<script[^>]*>/i, "")
        .replace(/<\/script>/i, "")
        .trim();
      const data = JSON.parse(content);

      let recipe = null;
      if (data["@type"] === "Recipe") {
        recipe = data;
      } else if (Array.isArray(data["@graph"])) {
        recipe = data["@graph"].find((item: { "@type": string }) => item["@type"] === "Recipe");
      } else if (Array.isArray(data)) {
        recipe = data.find((item: { "@type": string }) => item?.["@type"] === "Recipe");
      }
      if (!recipe) continue;
      const imageUrl = extractImageUrl(html, recipe);

      const rawIngredients: string[] = recipe.recipeIngredient || [];
      const ingredients = rawIngredients.map((ing: string, i: number) => {
        const parsed = parseIngredientString(ing);
        return {
          name: parsed.name,
          amount: parsed.amount,
          unit: parsed.unit,
          category: guessCategory(parsed.name),
          order_index: i,
        };
      });

      let cookingTime = null;
      const timeStr = recipe.totalTime || recipe.cookTime;
      if (timeStr) {
        const mins = timeStr.match(/(\d+)M/);
        const hours = timeStr.match(/(\d+)H/);
        cookingTime =
          (hours ? parseInt(hours[1]) * 60 : 0) +
          (mins ? parseInt(mins[1]) : 0) || null;
      }

      const yieldStr =
        typeof recipe.recipeYield === "string"
          ? recipe.recipeYield
          : Array.isArray(recipe.recipeYield)
          ? recipe.recipeYield[0]
          : null;
      const servings = yieldStr ? parseInt(yieldStr) || 2 : 2;

      // 手順を抽出（recipeInstructions は文字列・HowToStep・配列など様々）
      const rawInstructions = recipe.recipeInstructions || [];
      const steps: { step_number: number; step_text: string }[] = [];
      const instructionList = Array.isArray(rawInstructions) ? rawInstructions : [rawInstructions];
      let stepNum = 1;
      for (const inst of instructionList) {
        if (typeof inst === "string" && inst.trim()) {
          steps.push({ step_number: stepNum++, step_text: inst.trim() });
        } else if (inst && typeof inst === "object") {
          // HowToStep / HowToSection
          if (inst["@type"] === "HowToSection" && Array.isArray(inst.itemListElement)) {
            for (const sub of inst.itemListElement) {
              const text = sub.text || sub.name || "";
              if (text.trim()) steps.push({ step_number: stepNum++, step_text: text.trim() });
            }
          } else {
            const text = inst.text || inst.name || "";
            if (text.trim()) steps.push({ step_number: stepNum++, step_text: text.trim() });
          }
        }
      }

      const allText = [
        recipe.name || "",
        recipe.description || "",
        ...steps.map((s: { step_text: string }) => s.step_text),
      ].join(" ");

      return {
        title: recipe.name || "レシピ",
        image_url: imageUrl,
        servings_base: servings,
        cooking_time_minutes: cookingTime,
        category: recipe.recipeCategory || null,
        cuisine: guessCuisine(allText),
        notes: recipe.description?.slice(0, 200) || null,
        tags: guessTags(allText),
        ingredients,
        steps,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// 分数文字列を数値に変換
function parseFractionStr(str: string): number | null {
  if (!str) return null;
  // "1と1/2" 形式
  const mixed = str.match(/^(\d+)と(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  // "1/2" 形式
  const frac = str.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const d = parseInt(frac[2]);
    return d !== 0 ? parseInt(frac[1]) / d : null;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

// 材料文字列を名前・量・単位に分解
function parseIngredientString(str: string): { name: string; amount: number | null; unit: string } {
  let s = str.trim();

  // 先頭の「・」をスペースなしでも除去（NHKきょうの料理など）
  s = s.replace(/^・/, "");
  // グループ記号を除去: "A ", "B ", "☆ " など先頭の1〜2文字+スペース
  s = s.replace(/^[A-Za-z☆★◎●○※♦♪【】]\s+/, "");

  // 最後のスペース（半角・全角）で名前と量+単位を分割
  const lastHalf = s.lastIndexOf(" ");
  const lastFull = s.lastIndexOf("\u3000");
  const lastSpaceIdx = Math.max(lastHalf, lastFull);

  if (lastSpaceIdx === -1) return { name: s, amount: null, unit: "" };

  const name = s.slice(0, lastSpaceIdx).trim();
  const quantStr = s.slice(lastSpaceIdx + 1).trim();

  // 「少々・適量・適宜」等のテキスト単位
  if (/^(少々|適量|適宜|少量|ひとつまみ|少し|お好みで|各適[量宜]|好みで|ふたつまみ)/.test(quantStr)) {
    return { name, amount: null, unit: quantStr };
  }

  // 「大さじ2」「小さじ1/2」「カップ1」などの 単位+数値 パターン
  const unitFirstMatch = quantStr.match(/^(大さじ|小さじ|カップ|合)\s*(\d+(?:\/\d+)?(?:\.\d+)?(?:と\d+\/\d+)?)(.*)$/);
  if (unitFirstMatch) {
    const unit = unitFirstMatch[1] + (unitFirstMatch[3] ? unitFirstMatch[3].replace(/[（(].*?[）)]/g, "").trim() : "");
    return { name, amount: parseFractionStr(unitFirstMatch[2]), unit };
  }

  // 「300g」「2個（400g）」「1/2かけ」などの 数値+単位 パターン
  const numFirstMatch = quantStr.match(/^(\d+(?:\/\d+)?(?:\.\d+)?)\s*([^\d（(（].*)?/);
  if (numFirstMatch && numFirstMatch[1]) {
    const unit = (numFirstMatch[2] || "").replace(/[（(].*?[）)]/g, "").trim();
    return { name, amount: parseFractionStr(numFirstMatch[1]), unit };
  }

  // パース失敗 → 文字列全体を名前として返す
  return { name: s, amount: null, unit: "" };
}

function guessTags(text: string): string[] {
  const t = text;
  const tags: string[] = [];
  if (/冷凍/.test(t)) tags.push("冷凍保存OK");
  if (/レンジ|電子レンジ/.test(t)) tags.push("レンジ使用");
  if (/炊飯器/.test(t)) tags.push("炊飯器使用");
  if (/乳児|赤ちゃん|離乳食|とりわけ/.test(t)) tags.push("乳児とりわけ可");
  if (/作り置き|常備菜/.test(t)) tags.push("作り置き");
  if (/時短|簡単|すぐ/.test(t)) tags.push("時短");
  if (/オーブン/.test(t)) tags.push("オーブン使用");
  if (/加熱不要|火を使わない/.test(t)) tags.push("加熱不要");
  return tags;
}

function guessCuisine(text: string): string | null {
  const t = text;
  if (/タイ|フォー|ナンプラー|パクチー|ガパオ|グリーンカレー|レッドカレー|トムヤム|インド|サモサ|ナン|チャイ|タンドール|ビリヤニ|メキシコ|タコス|サルサ|ブリトー|韓国|キムチ|チゲ|プルコギ|ビビンバ|チャプチェ|サムゲタン|ベトナム|バインミー|エスニック|スパイス/.test(t)) return "エスニック";
  if (/チャーハン|餃子|麻婆|酢豚|春巻|八宝菜|エビチリ|回鍋肉|青椒肉絲|中華|担担麺|ラーメン|中国|豆板醤|テンメンジャン|オイスターソース|紹興酒/.test(t)) return "中華";
  if (/ハンバーグ|グラタン|シチュー|ポトフ|ロールキャベツ|オムライス|ドリア|ピザ|パスタ|カルボナーラ|ペペロンチーノ|リゾット|ラザニア|アヒージョ|ミネストローネ|ポークソテー|チキンソテー|バターチキン|クリーム煮|洋食|デミグラス|コンソメ|チーズフォンデュ|ラタトゥイユ|キッシュ|ガレット/.test(t)) return "洋食";
  if (/味噌汁|みそ汁|出汁|だし|煮物|炒め物|天ぷら|唐揚げ|から揚げ|肉じゃが|筑前煮|きんぴら|ひじき|おひたし|茶碗蒸し|親子丼|かつ丼|牛丼|どんぶり|和食|おでん|すき焼き|しゃぶしゃぶ|照り焼き|塩焼き|味噌漬け|西京漬け|混ぜご飯|炊き込みご飯|お茶漬け|お浸し/.test(t)) return "和食";
  return null;
}

function guessCategory(name: string): string {
  if (/鶏|豚|牛|ひき肉|ベーコン|ハム|ソーセージ|スパム|サラミ/.test(name)) return "肉類";
  if (/魚|鮭|えび|いか|たこ|貝|ツナ|サバ|アジ|ぶり|あさり|しじみ|帆立|カニ|いくら/.test(name)) return "魚介類";
  if (/牛乳|チーズ|バター|生クリーム|ヨーグルト|卵/.test(name)) return "乳製品・卵";
  if (/豆腐|納豆|豆乳|厚揚げ|油揚げ|がんもどき|おから|枝豆/.test(name)) return "豆腐・大豆製品";
  if (/缶|ホールトマト|コーン缶|ツナ缶|サバ缶|缶詰/.test(name)) return "缶詰・瓶詰";
  if (/米|もち米|パスタ|うどん|そば|そうめん|春雨|ビーフン|乾麺|乾物|ひじき|わかめ|昆布|切り干し/.test(name)) return "乾物・米・麺";
  if (/醤油|みりん|砂糖|塩|酒|味噌|酢|油|ごま|だし|こしょう|小麦粉|片栗粉|マヨネーズ|ケチャップ|ソース|スパイス|コンソメ|鶏ガラ|めんつゆ|ポン酢/.test(name)) return "調味料・油";
  if (/冷凍|フローズン/.test(name)) return "冷凍食品";
  if (/パン|食パン|ベーグル|薄力粉|強力粉|ベーキングパウダー|重曹/.test(name)) return "パン・粉類";
  if (/玉ねぎ|じゃがいも|にんじん|キャベツ|トマト|ほうれん草|小松菜|ブロッコリー|きのこ|しいたけ|えのき|大根|れんこん|ごぼう|ズッキーニ|なす|ピーマン|パプリカ|ねぎ|にら|もやし|白菜|レタス|きゅうり|セロリ|アスパラ|かぼちゃ|さつまいも|里芋|果物|りんご|バナナ|みかん|いちご|ぶどう|桃|梨|柿/.test(name)) return "野菜・果物";
  return "その他";
}

// HTMLをプレーンテキストに変換（Geminiに送る前のノイズ除去）
function htmlToText(html: string): string {
  return html
    // script / style / noscript / nav / footer / header 系を除去
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    // aタグはテキストだけ残す
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    // brやliはセパレータに
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    // 残りのHTMLタグを除去
    .replace(/<[^>]+>/g, "")
    // HTMLエンティティをデコード
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    // 空白の正規化
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 30000);
}

// GeminiレスポンスからJSONを抽出・パース（共通）
function extractJsonFromGeminiResponse(text: string): { data?: Record<string, unknown>; error?: string } {
  if (!text) return { error: "GeminiAPIから空のレスポンスが返りました。" };

  let jsonStr: string | null = null;
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
  }
  if (!jsonStr) {
    return { error: `GeminiのレスポンスがJSON形式ではありません: ${text.slice(0, 100)}` };
  }

  const cleanJson = jsonStr.replace(/[\u0000-\u001F\u007F]/g, (ch) => {
    if (ch === "\t" || ch === "\n" || ch === "\r") return " ";
    return "";
  });

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleanJson);
  } catch {
    try {
      const withoutSteps = cleanJson.replace(/"steps"\s*:\s*\[[\s\S]*?\](\s*,)?/, '"steps": []');
      data = JSON.parse(withoutSteps);
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : String(e2);
      return { error: `JSONパースエラー: ${msg.slice(0, 150)}` };
    }
  }

  data.ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
  data.steps = Array.isArray(data.steps) ? data.steps : [];
  data.tags = Array.isArray(data.tags) ? data.tags : [];
  data.servings_base = data.servings_base || 2;
  return { data };
}

// Geminiでテキストを解析して構造化レシピを返す
async function parseWithGemini(content: string, existingNames: string[] = []): Promise<{ data?: object; error?: string }> {
  if (!GEMINI_API_KEY) {
    return { error: "GEMINI_API_KEY が設定されていません。Vercel環境変数を確認してください。" };
  }

  const trimmedContent = content.trim();
  if (!trimmedContent || trimmedContent.length < 10) {
    return { error: "テキストが短すぎます。レシピページ全体をコピーして貼り付けてください。" };
  }

  const nameNormalizationInstruction = existingNames.length > 0
    ? `\n\n【重要】材料名の表記統一ルール:
以下は既存の登録済み材料名リストです。同じ材料を指す場合は、必ずこのリストの表記に合わせてください。
例: レシピに「醤油」とあっても、リストに「しょうゆ」があれば「しょうゆ」を使ってください。
例: 「塩コショウ」→リストに「塩こしょう」があれば「塩こしょう」を使ってください。
リストにない新しい材料はそのまま記載してください。

登録済み材料名: ${existingNames.join("、")}`
    : "";

  const prompt = `以下のテキストから料理レシピ情報を抽出してください。
必ず純粋なJSONのみを返してください（説明文や記号は不要）。${nameNormalizationInstruction}

形式:
{
  "title": "レシピ名",
  "servings_base": 人数の数値（例: 2）,
  "cooking_time_minutes": 調理時間の数値または null,
  "category": "次の選択肢から最も近いものを選択（一致しなければ null）: 主菜（肉）/主菜（魚）/主菜（卵・豆腐）/副菜/汁物・スープ/ご飯・丼/麺・パスタ/パン・粉もの/サラダ/お菓子・デザート/その他",
  "cuisine": "次の選択肢から最も近いものを選択（一致しなければ null）: 和食/洋食/中華/エスニック/その他",
  "notes": "備考または null",
  "tags": ["該当するタグのみ配列で。選択肢: 冷凍保存OK, レンジ使用, 炊飯器使用, 乳児とりわけ可, 作り置き, 時短, オーブン使用, 加熱不要"],
  "ingredients": [
    {
      "name": "材料名",
      "amount": 数量の数値または null,
      "unit": "単位（g/ml/個/大さじ など）",
      "category": "野菜・果物/肉類/魚介類/乳製品・卵/豆腐・大豆製品/缶詰・瓶詰/乾物・米・麺/調味料・油/冷凍食品/パン・粉類/飲料/お菓子/その他",
      "order_index": 0
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "step_text": "手順の内容"
    }
  ]
}

テキスト:
${trimmedContent.slice(0, 30000)}`;

  try {
    const text = await callGemini(prompt);
    return extractJsonFromGeminiResponse(text);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Gemini parse failed:", errMsg);
    return { error: `AI解析エラー: ${errMsg.slice(0, 200)}` };
  }
}

// パース結果の食材名を正規化する共通処理
function normalizeIngredientsInResult(
  data: Record<string, unknown>,
  existingNames: string[]
): Record<string, unknown> {
  if (!existingNames.length || !Array.isArray(data.ingredients)) return data;
  const normalized = (data.ingredients as Array<Record<string, unknown>>).map((ing) => ({
    ...ing,
    name: normalizeIngredientName(String(ing.name || ""), existingNames),
  }));
  return { ...data, ingredients: normalized };
}

export async function POST(request: NextRequest) {
  try {
    const { url, manualText, imageBase64, mimeType } = await request.json();

    // 既存の食材名を取得（全パスで使用）
    const existingNames = await fetchExistingIngredientNames();

    // 画像入力
    if (imageBase64) {
      if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません。" }, { status: 500 });
      }

      const nameNormalizationInstruction = existingNames.length > 0
        ? `\n\n【重要】材料名の表記統一ルール:
以下は既存の登録済み材料名リストです。同じ材料を指す場合は、必ずこのリストの表記に合わせてください。
例: レシピに「醤油」とあっても、リストに「しょうゆ」があれば「しょうゆ」を使ってください。
リストにない新しい材料はそのまま記載してください。

登録済み材料名: ${existingNames.join("、")}`
        : "";

      const prompt = `この画像はレシピです。画像から料理レシピ情報を抽出してください。
必ず純粋なJSONのみを返してください（説明文や記号は不要）。${nameNormalizationInstruction}

形式:
{
  "title": "レシピ名",
  "servings_base": 人数の数値（例: 2）,
  "cooking_time_minutes": 調理時間の数値または null,
  "category": "次の選択肢から最も近いものを選択（一致しなければ null）: 主菜（肉）/主菜（魚）/主菜（卵・豆腐）/副菜/汁物・スープ/ご飯・丼/麺・パスタ/パン・粉もの/サラダ/お菓子・デザート/その他",
  "cuisine": "次の選択肢から最も近いものを選択（一致しなければ null）: 和食/洋食/中華/エスニック/その他",
  "notes": "備考または null",
  "tags": ["該当するタグのみ配列で。選択肢: 冷凍保存OK, レンジ使用, 炊飯器使用, 乳児とりわけ可, 作り置き, 時短, オーブン使用, 加熱不要"],
  "ingredients": [
    {
      "name": "材料名",
      "amount": 数量の数値または null,
      "unit": "単位（g/ml/個/大さじ など）",
      "category": "野菜・果物/肉類/魚介類/乳製品・卵/豆腐・大豆製品/缶詰・瓶詰/乾物・米・麺/調味料・油/冷凍食品/パン・粉類/飲料/お菓子/その他",
      "order_index": 0
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "step_text": "手順の内容"
    }
  ]
}`;
      try {
        const text = await callGeminiVision(imageBase64, mimeType || "image/jpeg", prompt);
        const result = extractJsonFromGeminiResponse(text);
        if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
        // AIが見逃した表記ブレもコードで正規化
        const normalized = normalizeIngredientsInResult(result.data!, existingNames);
        return NextResponse.json(normalized);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `画像解析エラー: ${msg.slice(0, 200)}` }, { status: 500 });
      }
    }

    // 手動テキスト入力
    if (manualText) {
      const result = await parseWithGemini(manualText, existingNames);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      // AIが見逃した表記ブレもコードで正規化
      const normalized = normalizeIngredientsInResult(result.data as Record<string, unknown>, existingNames);
      return NextResponse.json(normalized);
    }

    if (!url) {
      return NextResponse.json({ error: "URLが必要です" }, { status: 400 });
    }

    // URLからHTMLを取得
    let html = "";
    const userAgents = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];

    for (const ua of userAgents) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": ua,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "ja,en-US;q=0.7",
          },
          signal: AbortSignal.timeout(12000),
          redirect: "follow",
        });
        if (res.ok) {
          html = await res.text();
          break;
        }
      } catch {
        continue;
      }
    }

    if (!html) {
      return NextResponse.json(
        {
          error:
            "このサイトはURL自動取得に対応していません。\n「テキストで入力」タブからレシピをコピーして貼り付けてください。",
          needsManual: true,
        },
        { status: 400 }
      );
    }

    // JSON-LD優先（高速）
    const fromJsonLd = extractFromJsonLd(html);
    if (fromJsonLd && fromJsonLd.ingredients.length > 0) {
      // JSON-LDパスでも正規化を適用
      const normalizedIngredients = fromJsonLd.ingredients.map((ing) => ({
        ...ing,
        name: normalizeIngredientName(ing.name, existingNames),
      }));
      return NextResponse.json({ ...fromJsonLd, ingredients: normalizedIngredients });
    }

    // HTMLをプレーンテキストに変換してからGeminiへ（ノイズ除去）
    const cleanText = htmlToText(html);
    const result = await parseWithGemini(cleanText, existingNames);
    if (result.error) {
      return NextResponse.json({ error: result.error, needsManual: true }, { status: 500 });
    }
    // AIが見逃した表記ブレもコードで正規化
    const normalized = normalizeIngredientsInResult(result.data as Record<string, unknown>, existingNames);
    // OGP画像をGemini結果に追加
    const ogImage = extractImageUrl(html);
    return NextResponse.json({ ...normalized, image_url: ogImage });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("parse-recipe error:", errMsg);
    return NextResponse.json({ error: `サーバーエラー: ${errMsg.slice(0, 200)}` }, { status: 500 });
  }
}
