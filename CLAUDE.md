# CLAUDE.md — レシピ管理アプリ プロジェクト

> さとみの個人開発プロジェクト。家族の食事管理を効率化するWebアプリ。
> 料理中にスマホ片手で使える、忙しいママ向けのレシピ・献立・買い物管理ツール。

---

## 🛠 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **バックエンド/DB**: Supabase（認証・DB・RLS）
- **AI連携**: Google Gemini 1.5 Flash（レシピ解析・献立AI提案）
- **PWA**: @ducanh2912/next-pwa
- **デプロイ**: Vercel（GitHub連携）
- **パッケージマネージャ**: npm

---

## 📁 フォルダ構成

```
recipe-app/
├── CLAUDE.md                    ← このファイル
├── src/
│   ├── app/
│   │   ├── page.tsx                # ホーム（リダイレクト）
│   │   ├── login/                  # ログイン画面
│   │   ├── recipes/                # レシピ一覧・詳細・新規・編集
│   │   ├── meal-plans/             # 献立カレンダー・AI提案・テンプレート
│   │   ├── shopping/               # 買い物リスト
│   │   ├── settings/               # 設定（家族構成等）
│   │   ├── auth/callback/          # Supabase OAuth コールバック
│   │   └── api/parse-recipe/       # レシピURL解析API（Gemini）
│   ├── components/
│   │   ├── AppShell.tsx            # アプリ共通レイアウト
│   │   ├── BottomNav.tsx           # 下部ナビ（レシピ/献立/買い物/設定）
│   │   ├── AddToMealPlanModal.tsx  # 献立追加モーダル
│   │   └── RecipeImagePicker.tsx   # レシピ画像選択
│   ├── lib/
│   │   ├── supabase/              # Supabaseクライアント（client/server/middleware）
│   │   ├── ingredientCategories.ts # 食材カテゴリ定義
│   │   ├── recipeCategories.ts     # レシピカテゴリ定義
│   │   ├── recipeCuisines.ts       # 料理ジャンル定義
│   │   ├── recipeTags.ts           # タグ定義
│   │   ├── fractionUtils.ts        # 分量計算ユーティリティ
│   │   └── imageUpload.ts          # 画像アップロード処理
│   └── middleware.ts               # 認証ミドルウェア
├── supabase/
│   ├── schema.sql                  # DBスキーマ定義（最新の正）
│   └── migrate_tags_to_japanese.sql # 既存DB向けの追加マイグレーション
└── public/                         # 静的ファイル（sw.js 等はPWA生成物＝Git管理外）
```

---

## 🗄 DB設計（Supabase）

全テーブルでRLS（Row Level Security）有効。ユーザーは自分のデータのみアクセス可能。

| テーブル | 役割 |
|---|---|
| `family_members` | 家族メンバー（名前・生年月日・役割） |
| `recipes` | レシピ（タイトル・URL・画像・人数・時間・カテゴリ・メモ・お気に入り） |
| `ingredients` | 材料（レシピ紐づけ、グループ・名前・量・単位・カテゴリ・並び順） |
| `meal_plans` | 献立（日付・食事種別breakfast/lunch/dinner・人数・メモ） |
| `shopping_items` | 買い物リスト（食材・数量・チェック状態・前半/後半・元レシピ） |

---

## 📱 画面構成（4タブ）

下部ナビゲーションで切り替え:

1. **レシピ** (`/recipes`) — 一覧・検索・新規登録・詳細・編集
2. **献立** (`/meal-plans`) — 週間カレンダー・AI提案・テンプレート保存
3. **買い物** (`/shopping`) — 献立から自動生成・チェックリスト
4. **設定** (`/settings`) — 家族構成の管理

---

## 📌 開発ルール

### コーディング規約
- コンポーネントは関数コンポーネント + Hooks
- 型定義は省略しない（`any` 禁止）
- ファイル名: コンポーネントはPascalCase、それ以外はkebab-case
- インポートは相対パスより `@/` エイリアスを優先
- Server Actionsはページごとのactions.tsにまとめる

### コミット・変更
- 既存のコードを変更する前に、影響範囲を確認する
- 破壊的変更がある場合は事前に説明する
- DBスキーマ変更時はマイグレーションSQLを作成する

### UI/UX方針
- モバイルファースト（スマホで料理中に片手操作を想定）
- シンプルで直感的な操作を最優先
- 子育て中の忙しいユーザーが3タップ以内で目的に到達できること
- テーマカラー: オレンジ（`orange-500`）

---

## ⚖️ 判断の優先順位

1. 既存機能を壊さない
2. モバイルでの使いやすさ
3. コードの型安全性
4. パフォーマンス（軽量・高速表示）
5. コードの可読性

---

## 🔒 セキュリティ

- Supabaseの接続情報（APIキー等）はコードにハードコードしない
- 環境変数（`.env.local`）で管理し、`.gitignore`に含める
- APIキー情報は `APIキー一覧_重要.txt` を参照（Git管理外）

---

## 📎 関連ドキュメント

- `../recipe-app-spec.docx` — 機能仕様・画面仕様
- `../レシピ管理アプリ_設計書.docx` — DB設計・アーキテクチャ

---

## 💻 Claude Code 運用メモ

### プロジェクトの場所
- 作業ディレクトリ: `C:\Users\Satomi Tsuboi\Desktop\稼ぐ力\CC\recipe-app`
- Claude Code 起動時は上記をワーキングディレクトリに指定すること

### よく使うコマンド
| 目的 | コマンド |
|---|---|
| 開発サーバ起動 | `npm run dev` （http://localhost:3000） |
| 本番ビルド確認 | `npm run build` |
| Lint | `npm run lint` |
| 本番起動（ローカル） | `npm run start` |
| 依存追加 | `npm install <package>` |
| 依存全入れ直し | `rm -rf node_modules package-lock.json && npm install` |

### 環境変数
`.env.local`（Git管理外）に以下を設定。テンプレは `.env.local.example`。

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase プロジェクトURL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase 公開anonキー
- `GEMINI_API_KEY` — Google Gemini 1.5 Flash の APIキー（レシピ解析・献立AI提案）
- `NEXTAUTH_URL` — 開発時は `http://localhost:3000`
- `NEXTAUTH_SECRET` — 適当な乱数文字列

APIキー原本は `APIキー一覧_重要.txt`（Git管理外・プロジェクト外）を参照。Claude にキー本体を貼り付けないこと。

### Git / デプロイ運用
- リモート: `origin`（個人用フォーク）と `recipe`（メイン）の2つを設定済み
- デフォルトブランチ: `main`
- Vercel が GitHub と連携しており、`origin/main` への push で自動デプロイ
- 画像ホスト（`next.config.js` の `remotePatterns`）に Supabase のドメインを追加済み
- PWA（`@ducanh2912/next-pwa`）は本番ビルド時のみ有効（dev では無効化）

### Supabase マイグレーション運用
- **新規セットアップ**: `supabase/schema.sql` をそのまま実行（全テーブル＋RLS付き）
- **既存DBの追加変更**: `supabase/migrate_tags_to_japanese.sql` 等の個別SQLを手動適用
- スキーマ変更時は `schema.sql` を最新状態に更新し、追加マイグレーションファイルも残す

### 動作確認の鉄板手順
1. `.env.local` が存在することを確認
2. `npm run build` が通ることを確認（TypeScriptエラーは `ignoreBuildErrors: true` で素通りするので、型変更時は `npx tsc --noEmit` で別途チェック）
3. `npm run dev` で `/recipes`, `/meal-plans`, `/shopping`, `/settings` の4タブが開くことを確認
4. ログイン画面（`/login`）で Supabase 認証が動くことを確認

### 変更時の注意
- `src/lib/supabase/` 配下のクライアント（client/server/middleware）は用途別に3つある。**Server Components では server 版、Client Components では client 版**を必ず使い分ける
- `src/middleware.ts` は認証ガード。ルート追加時は認証必須かどうかを確認
- DBスキーマ変更時は **必ず**マイグレーションSQLも作成（`schema.sql` だけの更新で済ませない）
