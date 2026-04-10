-- ============================================================
-- Food Full-Text Search Optimization
-- Date: 2026-03-22
-- 
-- Replaces in-memory ILIKE search (up to 1000 records per query)
-- with PostgreSQL full-text search using tsvector + GIN indexes.
-- 
-- Changes:
-- 1. GIN expression indexes on global_foods and foods
-- 2. RPC function: search_foods() — ranked full-text search
-- 3. RPC function: count_food_search() — total count for pagination
--
-- Usage: Run this in Supabase SQL Editor (or via migration tool)
-- ============================================================

-- Ensure unaccent extension is available (Supabase usually has it)
-- Required for diacritic-insensitive matching (e.g., "é" matches "e")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ----------------------------------------------------------
-- 1. GIN Expression Indexes
-- ----------------------------------------------------------
-- These indexes allow PostgreSQL to use full-text search
-- without needing a dedicated tsvector column.
-- The 'simple' config is used because we don't want stemming
-- (important for food names in multiple languages).

CREATE INDEX IF NOT EXISTS idx_global_foods_fts
  ON global_foods USING GIN (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' ||
      coalesce(name_en, '') || ' ' ||
      coalesce(name_fr, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(origin, '')
    )
  );

-- Additional trigram index for prefix matching (pg_trgm enables LIKE '%term%' to use index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_global_foods_name_trgm
  ON global_foods USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_global_foods_name_en_trgm
  ON global_foods USING GIN (name_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_global_foods_name_fr_trgm
  ON global_foods USING GIN (name_fr gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_global_foods_brand_trgm
  ON global_foods USING GIN (brand gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_foods_fts
  ON foods USING GIN (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(barcode, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_foods_name_trgm
  ON foods USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_foods_brand_trgm
  ON foods USING GIN (brand gin_trgm_ops);

-- ----------------------------------------------------------
-- 2. search_foods() — Main RPC Function
-- ----------------------------------------------------------
-- Returns ranked food results from both global_foods and user foods.
-- Uses ts_rank for relevance + explicit exact/prefix match signals.
--
-- Parameters:
--   search_query     text   — The user's search query
--   search_limit     int    — Max results to return (default 50)
--   search_offset    int    — Pagination offset (default 0)
--   search_user_id   uuid   — Current user ID (for custom foods, NULL = no user foods)
--   exclude_supplements bool — Filter out supplement/vitamin categories
--
-- Returns: JSON array of food objects with rank metadata

CREATE OR REPLACE FUNCTION search_foods(
  search_query text,
  search_limit integer DEFAULT 50,
  search_offset integer DEFAULT 0,
  search_user_id uuid DEFAULT NULL,
  exclude_supplements boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  norm_query text;
  ts_q text;
  result_json json;
BEGIN
  -- Normalize: lowercase, remove diacritics, replace non-word chars with space
  norm_query := lower(regexp_replace(unaccent(coalesce(search_query, '')), '[^\w\s]', ' ', 'g'));
  norm_query := btrim(norm_query);

  -- Build tsquery with prefix matching (term:* matches any word starting with term)
  -- Use 'simple' config to avoid English stemming
  IF norm_query != '' THEN
    SELECT string_agg(trim(token), ':*')
    INTO ts_q
    FROM regexp_split_to_table(norm_query, '\s+') AS token
    WHERE length(trim(token)) >= 1;
    
    IF ts_q IS NULL THEN ts_q := ''; END IF;
  ELSE
    ts_q := '';
  END IF;

  -- Build JSON result
  SELECT json_agg(row_to_json(t))
  INTO result_json
  FROM (
    SELECT
      -- Core fields
      id,
      user_id,
      name,
      brand,
      barcode,
      category,
      origin,
      verified,
      tags,
      aliases,

      -- Nutrition per 100g (global) or per serving (user)
      CASE WHEN is_global
        THEN calories_per_100g
        ELSE calories
      END AS calories,
      CASE WHEN is_global
        THEN protein_per_100g
        ELSE protein
      END AS protein,
      CASE WHEN is_global
        THEN carbs_per_100g
        ELSE carbs
      END AS carbs,
      CASE WHEN is_global
        THEN fats_per_100g
        ELSE fat
      END AS fat,
      CASE WHEN is_global
        THEN fiber_per_100g
        ELSE fiber
      END AS fiber,
      CASE WHEN is_global
        THEN sugar_per_100g
        ELSE sugar
      END AS sugar,
      CASE WHEN is_global
        THEN sodium_per_100g
        ELSE sodium
      END AS sodium,

      -- Serving info
      CASE WHEN is_global
        THEN typical_serving_grams
        ELSE serving_size
      END AS serving_size,
      CASE WHEN is_global THEN 'g' ELSE serving_unit END AS serving_unit,

      -- Source/metadata
      CASE WHEN is_global THEN 'global' ELSE 'manual' END AS source,
      is_global,

      -- Ranking signals (for client-side refinement if needed)
      CASE WHEN ts_q != '' THEN
        ts_rank(
          CASE WHEN is_global
            THEN to_tsvector('simple',
              coalesce(gf_name, '') || ' ' || coalesce(gf_name_en, '') || ' ' ||
              coalesce(gf_name_fr, '') || ' ' || coalesce(brand, '') || ' ' ||
              coalesce(category, '') || ' ' || coalesce(origin, ''))
            ELSE to_tsvector('simple',
              coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(barcode, ''))
          END,
          to_tsquery('simple', ts_q)
        )
      ELSE 0 END AS search_rank,

      -- Exact name match (highest boost)
      CASE WHEN norm_query != '' AND (
        lower(unaccent(CASE WHEN is_global THEN coalesce(gf_name, '') ELSE coalesce(name, '') END)) = norm_query
        OR (is_global AND lower(unaccent(coalesce(gf_name_en, ''))) = norm_query)
        OR (is_global AND lower(unaccent(coalesce(gf_name_fr, ''))) = norm_query)
      ) THEN true ELSE false END AS name_exact,

      -- Name prefix match
      CASE WHEN norm_query != '' AND (
        lower(unaccent(CASE WHEN is_global THEN coalesce(gf_name, '') ELSE coalesce(name, '') END)) LIKE norm_query || '%'
        OR (is_global AND lower(unaccent(coalesce(gf_name_en, ''))) LIKE norm_query || '%')
        OR (is_global AND lower(unaccent(coalesce(gf_name_fr, ''))) LIKE norm_query || '%')
      ) THEN true ELSE false END AS name_prefix,

      -- Brand match signals
      CASE WHEN norm_query != '' AND lower(unaccent(coalesce(brand, ''))) = norm_query
        THEN true ELSE false END AS brand_exact,
      CASE WHEN norm_query != '' AND lower(unaccent(coalesce(brand, ''))) LIKE norm_query || '%'
        THEN true ELSE false END AS brand_prefix,

      -- Barcode exact match
      CASE WHEN search_query != '' AND coalesce(barcode, '') = search_query
        THEN true ELSE false END AS barcode_exact,

      -- Category match
      CASE WHEN norm_query != '' AND is_global AND lower(unaccent(coalesce(category, ''))) LIKE '%' || norm_query || '%'
        THEN true ELSE false END AS category_match,

      -- All search tokens matched (union of both name fields)
      CASE WHEN norm_query != '' AND ts_q != '' THEN
        (SELECT count(*)
         FROM regexp_split_to_table(norm_query, '\s+') AS token
         WHERE trim(token) != ''
         AND (
           lower(unaccent(
             CASE WHEN is_global
               THEN coalesce(gf_name, '') || ' ' || coalesce(gf_name_en, '') || ' ' || coalesce(gf_name_fr, '')
               ELSE coalesce(name, '')
             END
           )) LIKE '%' || trim(token) || '%'
           OR lower(unaccent(coalesce(brand, ''))) LIKE '%' || trim(token) || '%'
           OR (is_global AND lower(unaccent(coalesce(category, ''))) LIKE '%' || trim(token) || '%')
           OR (is_global AND lower(unaccent(coalesce(origin, ''))) LIKE '%' || trim(token) || '%')
         )
        ) = (SELECT count(*) FROM regexp_split_to_table(norm_query, '\s+') AS token WHERE trim(token) != '')
      ELSE false END AS all_tokens_matched

    FROM (
      -- Global foods
      SELECT
        gf.id,
        NULL::uuid AS user_id,
        gf.name AS gf_name,
        gf.name_en AS gf_name_en,
        gf.name_fr AS gf_name_fr,
        gf.name,
        gf.brand,
        gf.barcode,
        gf.calories_per_100g,
        gf.protein_per_100g,
        gf.carbs_per_100g,
        gf.fats_per_100g,
        gf.fiber_per_100g,
        gf.sugar_per_100g,
        gf.sodium_per_100g,
        gf.typical_serving_grams,
        'g'::text AS serving_unit,
        gf.verified,
        gf.category,
        gf.origin,
        gf.aliases,
        '[]'::jsonb AS tags,
        NULL::numeric AS calories,
        NULL::numeric AS protein,
        NULL::numeric AS carbs,
        NULL::numeric AS fat,
        NULL::numeric AS fiber,
        NULL::numeric AS sugar,
        NULL::numeric AS sodium,
        NULL::numeric AS serving_size,
        true AS is_global
      FROM global_foods gf
      WHERE
        gf.status = 'active'
        AND (
          ts_q = ''
          OR to_tsvector('simple',
            coalesce(gf.name, '') || ' ' || coalesce(gf.name_en, '') || ' ' ||
            coalesce(gf.name_fr, '') || ' ' || coalesce(gf.brand, '') || ' ' ||
            coalesce(gf.category, '') || ' ' || coalesce(gf.origin, '')
          ) @@ to_tsquery('simple', ts_q)
        )
        AND (NOT exclude_supplements OR coalesce(gf.category, '') !~* 'supplement|vitamin')

      UNION ALL

      -- User custom foods
      SELECT
        f.id,
        f.user_id,
        NULL::text AS gf_name,
        NULL::text AS gf_name_en,
        NULL::text AS gf_name_fr,
        f.name,
        f.brand,
        f.barcode,
        NULL::numeric AS calories_per_100g,
        NULL::numeric AS protein_per_100g,
        NULL::numeric AS carbs_per_100g,
        NULL::numeric AS fats_per_100g,
        NULL::numeric AS fiber_per_100g,
        NULL::numeric AS sugar_per_100g,
        NULL::numeric AS sodium_per_100g,
        NULL::numeric AS typical_serving_grams,
        f.serving_unit,
        f.verified,
        NULL::text AS category,
        NULL::text AS origin,
        NULL::jsonb AS aliases,
        '[]'::jsonb AS tags,
        f.calories,
        f.protein,
        f.carbs,
        f.fat,
        f.fiber,
        f.sugar,
        f.sodium,
        f.serving_size,
        false AS is_global
      FROM foods f
      WHERE
        f.status = 'active'
        AND (search_user_id IS NULL OR f.user_id = search_user_id)
        AND (
          ts_q = ''
          OR to_tsvector('simple',
            coalesce(f.name, '') || ' ' || coalesce(f.brand, '') || ' ' || coalesce(f.barcode, '')
          ) @@ to_tsquery('simple', ts_q)
        )
    ) combined

    -- Sort: barcode exact > name exact > name prefix > brand exact > brand prefix >
    --        all tokens matched > ts_rank > verified > manual > alphabetical
    ORDER BY
      barcode_exact DESC,
      name_exact DESC,
      name_prefix DESC,
      brand_exact DESC,
      brand_prefix DESC,
      all_tokens_matched DESC,
      search_rank DESC NULLS LAST,
      verified DESC,
      CASE WHEN NOT is_global THEN 1 ELSE 0 END DESC,
      name ASC

    LIMIT search_limit
    OFFSET search_offset
  ) t;

  RETURN coalesce(result_json, '[]'::json);
END;
$$;

-- ----------------------------------------------------------
-- 3. count_food_search() — Pagination Count
-- ----------------------------------------------------------
-- Returns total matching rows for hasMore pagination calculation.
-- Much faster than counting all rows then slicing in the app.

CREATE OR REPLACE FUNCTION count_food_search(
  search_query text,
  search_user_id uuid DEFAULT NULL,
  exclude_supplements boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  norm_query text;
  ts_q text;
  total_count bigint;
BEGIN
  norm_query := lower(regexp_replace(unaccent(coalesce(search_query, '')), '[^\w\s]', ' ', 'g'));
  norm_query := btrim(norm_query);

  IF norm_query != '' THEN
    SELECT string_agg(trim(token), ':*')
    INTO ts_q
    FROM regexp_split_to_table(norm_query, '\s+') AS token
    WHERE length(trim(token)) >= 1;
    IF ts_q IS NULL THEN ts_q := ''; END IF;
  ELSE
    ts_q := '';
  END IF;

  SELECT count(*) INTO total_count FROM (
    SELECT 1 FROM global_foods gf
    WHERE gf.status = 'active'
    AND (
      ts_q = ''
      OR to_tsvector('simple',
        coalesce(gf.name, '') || ' ' || coalesce(gf.name_en, '') || ' ' ||
        coalesce(gf.name_fr, '') || ' ' || coalesce(gf.brand, '') || ' ' ||
        coalesce(gf.category, '') || ' ' || coalesce(gf.origin, '')
      ) @@ to_tsquery('simple', ts_q)
    )
    AND (NOT exclude_supplements OR coalesce(gf.category, '') !~* 'supplement|vitamin')

    UNION ALL

    SELECT 1 FROM foods f
    WHERE f.status = 'active'
    AND (search_user_id IS NULL OR f.user_id = search_user_id)
    AND (
      ts_q = ''
      OR to_tsvector('simple',
        coalesce(f.name, '') || ' ' || coalesce(f.brand, '') || ' ' || coalesce(f.barcode, '')
      ) @@ to_tsquery('simple', ts_q)
    )
  ) sub;

  RETURN total_count;
END;
$$;

-- ----------------------------------------------------------
-- 4. Grant execute permissions (Supabase anon + authenticated)
-- ----------------------------------------------------------
GRANT EXECUTE ON FUNCTION search_foods TO anon, authenticated;
GRANT EXECUTE ON FUNCTION count_food_search TO anon, authenticated;
