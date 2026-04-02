import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Gemini REST APIを直接呼ぶ
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
      const ingredients = rawIngredients.map((ing: string, i: number) => ({
        name: ing,
        amount: null,
        unit: "",
        category: guessCategory(ing),
        order_index: i,
      }));

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

function guessTags(text: string): string[] {
  const t = text;
  const tags: string[] = [];
  if (/冷凍/.test(t)) tags.push("freezable");
  if (/レンジ|電子レンジ/.test(t)) tags.push("microwave");
  if (/炊飯器/.test(t)) tags.push("rice_cooker");
  if (/乳児|赤ちゃん|離乳食|とりわけ/.test(t)) tags.push("baby");
  if (/作り置き|常備菜/.test(t)) tags.push("make_ahead");
  if (/時短|簡単|すぐ/.test(t)) tags.push("quick");
  if (/オーブン/.test(t)) tags.push("oven");
  if (/加熱不要|火を使わない/.test(t)) tags.push("no_heat");
  return tags;
}

function guessCategory(name: string): string {
  if (/鶏|豚|牛|ひき肉|ベーコン|ハム|ソーセージ/.test(name)) return "肉類";
  if (/魚|鮭|えび|いか|たこ|貝|ツナ/.test(name)) return "魚介類";
  if (/醤油|みりん|砂糖|塩|酒|味噌|酢|油|ごま|だし|こしょう|小麦粉|片栗粉|バター/.test(name)) return "調味料";
  if (/玉ねぎ|じゃがいも|にんじん|キャベツ|トマト|豆腐|卵|チーズ|牛乳/.test(name)) return "野菜";
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

// Geminiでテキストを解析して構造化レシピを返す
async function parseWithGemini(content: string): Promise<{ data?: object; error?: string }> {
  if (!GEMINI_API_KEY) {
    return { error: "GEMINI_API_KEY が設定されていません。Vercel環境変数を確認してください。" };
  }

  const trimmedContent = content.trim();
  if (!trimmedContent || trimmedContent.length < 10) {
    return { error: "テキストが短すぎます。レシピページ全体をコピーして貼り付けてください。" };
  }

  const prompt = `以下のテキストから料理レシピ情報を抽出してください。
必ず純粋なJSONのみを返してください（説明文や記号は不要）。

形式:
{
  "title": "レシピ名",
  "servings_base": 人数の数値（例: 2）,
  "cooking_time_minutes": 調理時間の数値または null,
  "category": "次の選択肢から最も近いものを選択（一致しなければ null）: 主菜（肉）/主菜（魚）/主菜（卵・豆腐）/副菜/汁物・スープ/ご飯・丼/麺・パスタ/パン・粉もの/サラダ/お菓子・デザート/その他",
  "notes": "備考または null",
  "tags": ["該当するタグIDのみ配列で。選択肢: freezable(冷凍保存OK), microwave(レンジ使用), rice_cooker(炊飯器使用), baby(乳児とりわけ可), make_ahead(作り置き), quick(時短), oven(オーブン使用), no_heat(加熱不要)"],
  "ingredients": [
    {
      "name": "材料名",
      "amount": 数量の数値または null,
      "unit": "単位（g/ml/個/大さじ など）",
      "category": "肉類/魚介類/野菜/調味料/その他",
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

    if (!text) {
      return { error: "GeminiAPIから空のレスポンスが返りました。" };
    }

    // JSON部分のみ抽出（```json ... ``` ブロックにも対応）
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

    // JSON文字列内の不正な改行・制御文字をエスケープ
    const cleanJson = jsonStr
      .replace(/[\u0000-\u001F\u007F]/g, (ch) => {
        // 許可する制御文字のみエスケープ、タブ・改行はスペースに
        if (ch === '\t') return ' ';
        if (ch === '\n' || ch === '\r') return ' ';
        return '';
      });

    let data;
    try {
      data = JSON.parse(cleanJson);
    } catch {
      // クリーンアップしても失敗した場合、stepsなし版を試みる
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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Gemini parse failed:", errMsg);
    return { error: `AI解析エラー: ${errMsg.slice(0, 200)}` };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, manualText } = await request.json();

    // 手動テキスト入力
    if (manualText) {
      const result = await parseWithGemini(manualText);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json(result.data);
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
      return NextResponse.json(fromJsonLd);
    }

    // HTMLをプレーンテキストに変換してからGeminiへ（ノイズ除去）
    const cleanText = htmlToText(html);
    const result = await parseWithGemini(cleanText);
    if (result.error) {
      return NextResponse.json({ error: result.error, needsManual: true }, { status: 500 });
    }
    // OGP画像をGemini結果に追加
    const ogImage = extractImageUrl(html);
    return NextResponse.json({ ...result.data, image_url: ogImage });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("parse-recipe error:", errMsg);
    return NextResponse.json({ error: `サーバーエラー: ${errMsg.slice(0, 200)}` }, { status: 500 });
  }
}
