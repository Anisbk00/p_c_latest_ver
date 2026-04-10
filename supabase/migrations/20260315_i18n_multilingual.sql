-- ═══════════════════════════════════════════════════════════════
-- Migration: Full i18n / Multilingual System
-- Date: 2026-03-15
-- Supports: EN / FR / AR
-- ═══════════════════════════════════════════════════════════════

-- ── 1. user_settings: ensure language column exists with constraint ──
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en'
    CHECK (language IN ('en','fr','ar'));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS last_locale_applied_at timestamptz DEFAULT now();

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en'
    CHECK (preferred_language IN ('en','fr','ar'));

-- ── 2. profiles: ensure locale column exists ─────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale text DEFAULT 'en';

-- ── 3. ai_messages: locale column ────────────────────────────────────
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS locale text DEFAULT 'en';

-- ── 4. translations table (DB-driven UI strings) ─────────────────────
CREATE TABLE IF NOT EXISTS public.translations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL,
  locale       text NOT NULL CHECK (locale IN ('en','fr','ar')),
  text_value   text NOT NULL,
  namespace    text NOT NULL DEFAULT 'app',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (key, locale)
);

-- ── 5. translation_cache table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.translation_cache (
  locale         text PRIMARY KEY,
  translations   jsonb NOT NULL,
  updated_at     timestamptz DEFAULT now()
);

-- ── 6. food_translations ─────────────────────────────────────────────
-- Supplements global_foods which already has name_en / name_fr / name_ar columns.
-- This table handles the user-created foods (public.foods table).
CREATE TABLE IF NOT EXISTS public.food_translations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id          uuid REFERENCES public.foods(id) ON DELETE CASCADE,
  locale           text NOT NULL CHECK (locale IN ('en','fr','ar')),
  translated_name  text NOT NULL,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (food_id, locale)
);

-- ── 7. ai_translation_jobs ───────────────────────────────────────────
-- Queue table: new UI strings trigger an AI translation job.
CREATE TABLE IF NOT EXISTS public.ai_translation_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text      text NOT NULL,
  source_locale    text NOT NULL DEFAULT 'en',
  target_locale    text NOT NULL CHECK (target_locale IN ('en','fr','ar')),
  translated_text  text,
  namespace        text DEFAULT 'app',
  translation_key  text,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','done','failed')),
  model            text,
  confidence       numeric,
  created_at       timestamptz DEFAULT now(),
  processed_at     timestamptz
);

-- ── 8. supported_locales ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supported_locales (
  code        text PRIMARY KEY,
  name        text,
  native_name text,
  rtl         boolean DEFAULT false
);

INSERT INTO public.supported_locales (code, name, native_name, rtl)
VALUES
  ('en', 'English',  'English',   false),
  ('fr', 'French',   'Français',  false),
  ('ar', 'Arabic',   'العربية',   true)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      native_name = EXCLUDED.native_name,
      rtl         = EXCLUDED.rtl;

-- ── 9. Performance indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_translations_key_locale
  ON public.translations (key, locale);

CREATE INDEX IF NOT EXISTS idx_translations_namespace
  ON public.translations (namespace, locale);

CREATE INDEX IF NOT EXISTS idx_food_translations_food_locale
  ON public.food_translations (food_id, locale);

CREATE INDEX IF NOT EXISTS idx_ai_messages_locale
  ON public.ai_messages (locale);

CREATE INDEX IF NOT EXISTS idx_ai_translation_jobs_status
  ON public.ai_translation_jobs (status);

CREATE INDEX IF NOT EXISTS idx_ai_translation_jobs_target_locale
  ON public.ai_translation_jobs (target_locale, status);

-- ── 10. updated_at trigger for translations ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_translations_updated_at ON public.translations;
CREATE TRIGGER trg_translations_updated_at
  BEFORE UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 11. RLS policies ─────────────────────────────────────────────────
ALTER TABLE public.translations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_translations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_translation_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supported_locales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_cache      ENABLE ROW LEVEL SECURITY;

-- Translations are public-read (no user filtering needed)
DROP POLICY IF EXISTS "translations_public_read" ON public.translations;
CREATE POLICY "translations_public_read"
  ON public.translations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "translation_cache_public_read" ON public.translation_cache;
CREATE POLICY "translation_cache_public_read"
  ON public.translation_cache FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "supported_locales_public_read" ON public.supported_locales;
CREATE POLICY "supported_locales_public_read"
  ON public.supported_locales FOR SELECT
  USING (true);

-- food_translations: user owns their food's translations
DROP POLICY IF EXISTS "food_translations_owner" ON public.food_translations;
CREATE POLICY "food_translations_owner"
  ON public.food_translations FOR ALL
  USING (
    food_id IN (
      SELECT id FROM public.foods WHERE user_id = auth.uid()
    )
  );

-- ai_translation_jobs: service role only (no user RLS)
DROP POLICY IF EXISTS "ai_translation_jobs_service" ON public.ai_translation_jobs;
CREATE POLICY "ai_translation_jobs_service"
  ON public.ai_translation_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- ── 12. Seed: core UI translations (bootstrap set) ───────────────────
-- French
INSERT INTO public.translations (key, locale, text_value, namespace) VALUES
  ('home.greeting.morning',   'fr', 'Bonjour',               'app'),
  ('home.greeting.afternoon', 'fr', 'Bon après-midi',        'app'),
  ('home.greeting.evening',   'fr', 'Bonsoir',               'app'),
  ('home.calories.consumed',  'fr', 'Consommées',            'app'),
  ('home.calories.remaining', 'fr', 'Restantes',             'app'),
  ('home.calories.burned',    'fr', 'Brûlées',               'app'),
  ('foods.log.breakfast',     'fr', 'Petit-déjeuner',        'app'),
  ('foods.log.lunch',         'fr', 'Déjeuner',              'app'),
  ('foods.log.dinner',        'fr', 'Dîner',                 'app'),
  ('foods.log.snack',         'fr', 'Collation',             'app'),
  ('common.save',             'fr', 'Enregistrer',           'app'),
  ('common.cancel',           'fr', 'Annuler',               'app'),
  ('common.loading',          'fr', 'Chargement…',           'app'),
  ('settings.title',          'fr', 'Paramètres',            'app'),
  ('coach.title',             'fr', 'Iron Coach',            'app')
ON CONFLICT (key, locale) DO NOTHING;

-- Arabic
INSERT INTO public.translations (key, locale, text_value, namespace) VALUES
  ('home.greeting.morning',   'ar', 'صباح الخير',            'app'),
  ('home.greeting.afternoon', 'ar', 'مساء الخير',            'app'),
  ('home.greeting.evening',   'ar', 'مساء النور',            'app'),
  ('home.calories.consumed',  'ar', 'المستهلكة',             'app'),
  ('home.calories.remaining', 'ar', 'المتبقية',              'app'),
  ('home.calories.burned',    'ar', 'المحروقة',              'app'),
  ('foods.log.breakfast',     'ar', 'الإفطار',               'app'),
  ('foods.log.lunch',         'ar', 'الغداء',                'app'),
  ('foods.log.dinner',        'ar', 'العشاء',                'app'),
  ('foods.log.snack',         'ar', 'وجبة خفيفة',            'app'),
  ('common.save',             'ar', 'حفظ',                   'app'),
  ('common.cancel',           'ar', 'إلغاء',                 'app'),
  ('common.loading',          'ar', 'جارٍ التحميل…',         'app'),
  ('settings.title',          'ar', 'الإعدادات',             'app'),
  ('coach.title',             'ar', 'المدرب الحديدي',        'app')
ON CONFLICT (key, locale) DO NOTHING;
