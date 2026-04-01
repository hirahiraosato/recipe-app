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
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
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

      return {
        title: recipe.name || "レシピ",
        servings_base: servings,
        cooking_time_minutes: cookingTime,
        category: recipe.recipeCategory || null,
        notes: recipe.description?.slice(0, 200) || null,
        ingredients,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function guessCategory(name: string): string {
  if (/鶏|豚|牛|ひき肉|ベーコン|ハム|ソーセージ/.test(name)) return "肉類";
  if (/魚|鮭|えび|いか|たこ|貝|ツナ/.test(name)) return "魚介類";
  if (/醤油|みりん|砂糖|塩|酒|味噌|酢|油|ごま|だし|こしょう|小麦粉|片栗粉|バター/.test(name)) return "調味料";
  if (/玉ねぎ|じゃがいも|にんじん|キャベツ|トマト|豆腐|卵|チーズ|牛乳/.test(name)) return "野菜";
  return "その他";
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
  "category": "主菜/副菜/汁物/デザート/その他 または null",
  "notes": "備考または null",
  "ingredients": [
    {
      "name": "材料名",
      "amount": 数量の数値または null,
      "unit": "単位（g/ml/個/大さじ など）",
      "category": "肉類/魚介類/野菜/調味料/その他",
      "order_index": 0
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

    // JSON部分のみ抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: `GeminiのレスポンスがJSON形式ではありません: ${text.slice(0, 100)}` };
    }

    const data = JSON.parse(jsonMatch[0]);
    data.ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
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

    // Geminiで解析
    const truncated = html.slice(0, 40000);
    const result = await parseWithGemini(truncated);
    if (result.error) {
      return NextResponse.json({ error: result.error, needsManual: true }, { status: 500 });
    }
    return NextResponse.json(result.data);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("parse-recipe error:", errMsg);
    return NextResponse.json({ error: `サーバーエラー: ${errMsg.slice(0, 200)}` }, { status: 500 });
  }
}
