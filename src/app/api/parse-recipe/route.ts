import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URLが必要です" }, { status: 400 });
    }

    // URLのHTMLを取得
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "URLにアクセスできませんでした" },
        { status: 400 }
      );
    }

    const html = await response.text();
    // HTML を短縮（Geminiのトークン制限対策）
    const truncatedHtml = html.slice(0, 50000);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `以下のHTMLから料理レシピ情報を抽出してください。
必ずJSON形式のみで返してください（説明文やコードブロックは不要）。

抽出するJSON形式:
{
  "title": "レシピ名",
  "servings_base": 人数（数値、例: 2）,
  "cooking_time_minutes": 調理時間（分・数値、不明な場合はnull）,
  "category": "カテゴリ（例: 主菜、副菜、汁物、デザート等）",
  "notes": "作り方のポイントや備考（任意）",
  "ingredients": [
    {
      "name": "材料名",
      "amount": 数量（数値、例: 200）,
      "unit": "単位（例: g、ml、個、大さじ等）",
      "category": "材料カテゴリ（肉類/魚介類/野菜/調味料/その他）",
      "order_index": 0
    }
  ]
}

HTML:
${truncatedHtml}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSONを抽出（コードブロックがある場合も対応）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "レシピ情報を抽出できませんでした" },
        { status: 500 }
      );
    }

    const recipeData = JSON.parse(jsonMatch[0]);
    return NextResponse.json(recipeData);
  } catch (error) {
    console.error("parse-recipe error:", error);
    return NextResponse.json(
      { error: "レシピの解析に失敗しました" },
      { status: 500 }
    );
  }
}
