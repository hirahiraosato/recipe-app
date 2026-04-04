-- ============================================================
-- レシピアプリ Supabase スキーマ
-- Supabase Dashboard > SQL Editor で実行してください
-- ============================================================

-- ① 家族メンバー
CREATE TABLE IF NOT EXISTS family_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  birth_date  DATE NOT NULL,
  role        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_members_owner" ON family_members
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ② レシピ
CREATE TABLE IF NOT EXISTS recipes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  source_url            TEXT,
  image_url             TEXT,
  description           TEXT,
  servings_base         NUMERIC NOT NULL DEFAULT 2,  -- 元レシピの人数
  cooking_time_minutes  INT,
  category              TEXT,
  memo                  TEXT,
  is_favorite           BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_owner" ON recipes
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ③ 材料
CREATE TABLE IF NOT EXISTS ingredients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  group_label TEXT,   -- "A", "B", "下味" など（省略可）
  name        TEXT NOT NULL,
  amount      NUMERIC,
  unit        TEXT,
  category    TEXT,   -- 野菜/肉類/魚介類/調味料/その他
  order_index INT NOT NULL DEFAULT 0
);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredients_via_recipe" ON ingredients
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = ingredients.recipe_id
        AND r.user_id = auth.uid()
    )
  );


-- ④ 献立
CREATE TABLE IF NOT EXISTS meal_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id     UUID REFERENCES recipes(id) ON DELETE SET NULL,
  planned_date  DATE NOT NULL,
  meal_type     TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  servings      NUMERIC,  -- NULL の場合は家族全員分
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, planned_date, meal_type)
);

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_plans_owner" ON meal_plans
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ⑤ 買い物リスト
CREATE TABLE IF NOT EXISTS shopping_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ingredient_name  TEXT NOT NULL,
  quantity         TEXT,
  unit             TEXT,
  category         TEXT,
  is_checked       BOOLEAN NOT NULL DEFAULT FALSE,
  trip_half        INT CHECK (trip_half IN (1, 2)),  -- 1=前半, 2=後半
  source_recipe    TEXT,  -- どのレシピから来たか（表示用）
  week_start_date  DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopping_items_owner" ON shopping_items
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- updated_at 自動更新トリガー（recipes用）
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
