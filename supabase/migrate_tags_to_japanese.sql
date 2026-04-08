-- ============================================================
-- タグID変換マイグレーション: 英語 → 日本語
-- Supabase Dashboard > SQL Editor で実行してください
-- ============================================================
-- 対象: recipes テーブルの tags カラム
--
-- 変換対応表:
--   freezable    → 冷凍保存OK
--   microwave    → レンジ使用
--   rice_cooker  → 炊飯器使用
--   baby         → 乳児とりわけ可
--   make_ahead   → 作り置き
--   quick        → 時短
--   oven         → オーブン使用
--   no_heat      → 加熱不要
-- ============================================================

-- ■ jsonb 型の場合（こちらを先に試してください）
UPDATE recipes
SET tags = (
  SELECT jsonb_agg(
    CASE val
      WHEN 'freezable'   THEN '冷凍保存OK'
      WHEN 'microwave'   THEN 'レンジ使用'
      WHEN 'rice_cooker' THEN '炊飯器使用'
      WHEN 'baby'        THEN '乳児とりわけ可'
      WHEN 'make_ahead'  THEN '作り置き'
      WHEN 'quick'       THEN '時短'
      WHEN 'oven'        THEN 'オーブン使用'
      WHEN 'no_heat'     THEN '加熱不要'
      ELSE val
    END
  )
  FROM jsonb_array_elements_text(tags) AS val
)
WHERE tags IS NOT NULL
  AND tags != '[]'::jsonb;

-- ■ もし上記でエラーが出た場合は text[] 型です。
-- 上のクエリを削除して、下のコメントを外して実行してください。
/*
UPDATE recipes
SET tags = ARRAY(
  SELECT
    CASE t
      WHEN 'freezable'   THEN '冷凍保存OK'
      WHEN 'microwave'   THEN 'レンジ使用'
      WHEN 'rice_cooker' THEN '炊飯器使用'
      WHEN 'baby'        THEN '乳児とりわけ可'
      WHEN 'make_ahead'  THEN '作り置き'
      WHEN 'quick'       THEN '時短'
      WHEN 'oven'        THEN 'オーブン使用'
      WHEN 'no_heat'     THEN '加熱不要'
      ELSE t
    END
  FROM unnest(tags) AS t
)
WHERE tags IS NOT NULL
  AND array_length(tags, 1) > 0;
*/
