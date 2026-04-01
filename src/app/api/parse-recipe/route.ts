import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

      // Recipe オブジェクトを探す（@graph内も含む）
      let recipe = null;
      if (data["@type"] === "Recipe") {
        recipe = data;
      } else if (Array.isArray(data["@graph"])) {
        recipe = data["@graph"].find((item: { "@type": string }) => item["@type"] === "Recipe");
      } else if (Array.isArray(data)) {
        recipe = data.find((item: { "@type": string }) => item?.["@type"] === "Recipe");
      }

      if (!recipe) continue;

      // 材料を解析
      const rawIngredients: string[] = recipe.recipeIngredient || [];
      const ingredients = rawIngredients.map((ing: string, i: number) => {
        // "200g 鶏もも肉" や "鶏もも肉 200g" などのパターンに対応
        const match = ing.match(/^([\d./]+)\s*([a-zA-Zぁ-ん一-龯ァ-ン]*)\s+(.+)$/) ||
          ing.match(/^(.+?)\s+([\d./]+)\s*([a-zA-Zぁ-ん一-龯ァ-ン]*)$/);
        if (match) {
          if (/^\d/.test(ing)) {
            return {
              name: match[3] || ing,
              amount: parseFloat(match[1]) || null,
              unit: match[2] || "",
              category: guessCategory(match[3] || ing),
              order_index: i,
            };
          } else {
            return {
              name: match[1] || ing,
              amount: parseFloat(match[2]) || null,
              unit: match[3] || "",
              category: guessCategory(match[1] || ing),
              order_index: i,
            };
          }
        }
        return {
          name: ing,
          amount: null,
          unit: "",
          category: guessCategory(ing),
          order_index: i,
        };
      });

      // 調理時間（ISO 8601 duration → 分）
      let cookingTime = null;
      const timeStr = recipe.totalTime || recipe.cookTime;
      if (timeStr) {
        const mins = timeStr.match(/(\d+)M/);
        const hours = timeStr.match(/(\d+)H/);
        cookingTime =
          (hours ? parseInt(hours[1]) * 60 : 0) +
          (mins ? parseInt(mins[1]) : 0) || null;
      }

      // 人数
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
        notes: recipe.description || null,
        ingredients,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// 材料名からカテゴリを推測
function guessCategory(name: string): string {
  const n = name;
  if (/鶏|豚|牛|ひき肉|ベーコン|ハム|ソーセージ|肉/.test(n)) return "肉類";
  if (/魚|鮭|マグロ|えび|いか|たこ|貝|サーモン|ツナ|しらす/.test(n)) return "魚介類";
  if (/醤油|みりん|砂糖|塩|酒|味噌|酢|油|ごま|だし|コンソメ|ケチャップ|マヨ|ソース|スパイス|こしょう|小麦粉|片栗粉|バター/.test(n)) return "調味料";
  if (/玉ねぎ|じゃがいも|にんじん|キャベツ|レタス|トマト|きゅうり|なす|ほうれん草|もやし|ねぎ|しいたけ|きのこ|大根|ごぼう|豆腐|卵|チーズ|牛乳|豆/.test(n)) return "野菜";
  return "その他";
}

export async function POST(request: NextRequest) {
  try {
    const { url, manualText } = await request.json();

    // 手動テキスト入力の場合
    if (manualText) {
      return await parseWithGemini(manualText, url || "");
    }

    if (!url) {
      return NextResponse.json({ error: "URLが必要です" }, { status: 400 });
    }

    // URLのHTMLを取得（複数のUser-Agentで試行）
    let html = "";
    const userAgents = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
    ];

    let fetchSuccess = false;
    for (const ua of userAgents) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
          },
          signal: AbortSignal.timeout(12000),
          redirect: "follow",
        });
        if (res.ok) {
          html = await res.text();
          fetchSuccess = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!fetchSuccess || !html) {
      return NextResponse.json(
        {
          error: "このサイトはURLからの自動取得に対応していません。\nレシピの内容をテキストでコピーして「手動入力」から追加してください。",
          needsManual: true,
        },
        { status: 400 }
      );
    }

    // まずJSON-LDから試みる（高速・正確）
    const fromJsonLd = extractFromJsonLd(html);
    if (fromJsonLd && fromJsonLd.ingredients.length > 0) {
      return NextResponse.json(fromJsonLd);
    }

    // JSON-LDが取れなかった場合はGeminiで解析
    const truncatedHtml = html.slice(0, 40000);
    return await parseWithGemini(truncatedHtml, url);
  } catch (error) {
    console.error("parse-recipe error:", error);
    return NextResponse.json(
      { error: "レシピの解析に失敗しました。手動入力をお試しください。", needsManual: true },
      { status: 500 }
    );
  }
}

async function parseWithGemini(content: string, url: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `以下のテキストから料理レシピ情報を抽出してください。
必ずJSON形式のみで返してください（前後の説明文やコードブロック記号は不要）。

JSON形式:
{
  "title": "レシピ名",
  "servings_base": 人数（数値、例: 2）,
  "cooking_time_minutes": 調理時間（分・数値、不明な場合はnull）,
  "category": "カテゴリ（主菜/副菜/汁物/デザート等、不明な場合はnull）",
  "notes": "ポイントや備考（任意、長すぎる場合はnull）",
  "ingredients": [
    {
      "name": "材料名",
      "amount": 数量（数値のみ、例: 200。不明な場合はnull）,
      "unit": "単位（例: g、ml、個、大さじ、適量）",
      "category": "肉類/魚介類/野菜/調味料/その他 のいずれか",
      "order_index": 0
    }
  ]
}

テキスト:
${content}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSONを抽出（複数のパターンで試みる）
    let recipeData = null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        recipeData = JSON.parse(jsonMatch[0]);
      } catch {
        // JSONパースに失敗した場合、最低限の構造を返す
        recipeData = {
          title: "レシピ",
          servings_base: 2,
          cooking_time_minutes: null,
          category: null,
          notes: content.slice(0, 200),
          ingredients: [],
        };
      }
    }

    if (!recipeData) {
      // Geminiが何も返せなかった場合も最低限の構造を返す
      recipeData = {
        title: "レシピ",
        servings_base: 2,
        cooking_time_minutes: null,
        category: null,
        notes: null,
        ingredients: [],
      };
    }

    // 必須フィールドの保証
    recipeData.ingredients = Array.isArray(recipeData.ingredients) ? recipeData.ingredients : [];
    recipeData.servings_base = recipeData.servings_base || 2;
    recipeData.source_url = url;
    return NextResponse.json(recipeData);
  } catch (error) {
    console.error("Gemini parse error:", error);
    // API自体が失敗した場合は最低限の構造を返してプレビュー画面へ
    return NextResponse.json({
      title: "レシピ",
      servings_base: 2,
      cooking_time_minutes: null,
      category: null,
      notes: null,
      ingredients: [],
      source_url: url,
    });
  }
}
