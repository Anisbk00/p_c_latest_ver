-- Migration: Atomic Profile Update RPC Function
-- Purpose: Wrap all profile-related updates in a single transaction
-- Prevents partial updates on failure

-- ═══════════════════════════════════════════════════════════════
-- RATE LIMIT TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS _rate_limits (
  identifier TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  failed_attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked_until ON _rate_limits(blocked_until);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON _rate_limits(window_start);

-- ═══════════════════════════════════════════════════════════════
-- ATOMIC PROFILE UPDATE RPC
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION atomic_profile_update(
  p_user_id UUID,
  p_profile_data JSONB DEFAULT '{}',
  p_user_profile_data JSONB DEFAULT '{}',
  p_body_metric_data JSONB DEFAULT '{}',
  p_settings_data JSONB DEFAULT '{}',
  p_goal_data JSONB DEFAULT '{}',
  p_expected_version INTEGER DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_version INTEGER;
  v_current_updated_at TIMESTAMPTZ;
  v_profile_exists BOOLEAN;
  v_user_profile_exists BOOLEAN;
  v_result JSONB := '{"success": true, "updated_tables": []}'::jsonb;
  v_updated_tables TEXT[] := '{}';
BEGIN
  -- ─────────────────────────────────────────────────────────────
  -- OPTIMISTIC LOCKING CHECK
  -- ─────────────────────────────────────────────────────────────
  
  IF p_expected_version IS NOT NULL OR p_expected_updated_at IS NOT NULL THEN
    SELECT version, updated_at INTO v_current_version, v_current_updated_at
    FROM profiles WHERE id = p_user_id;
    
    -- Check version if provided
    IF p_expected_version IS NOT NULL AND v_current_version IS NOT NULL THEN
      IF v_current_version != p_expected_version THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'VERSION_CONFLICT',
          'message', 'Profile was modified by another request',
          'current_version', v_current_version,
          'expected_version', p_expected_version
        );
      END IF;
    END IF;
    
    -- Check timestamp if provided (with 1 second tolerance)
    IF p_expected_updated_at IS NOT NULL AND v_current_updated_at IS NOT NULL THEN
      IF ABS(EXTRACT(EPOCH FROM (v_current_updated_at - p_expected_updated_at))) > 1 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'TIMESTAMP_CONFLICT',
          'message', 'Profile was modified by another request',
          'current_updated_at', v_current_updated_at,
          'expected_updated_at', p_expected_updated_at
        );
      END IF;
    END IF;
  END IF;
  
  -- ─────────────────────────────────────────────────────────────
  -- UPDATE PROFILES TABLE
  -- ─────────────────────────────────────────────────────────────
  
  IF p_profile_data != '{}'::jsonb THEN
    SELECT EXISTS(SELECT 1 FROM profiles WHERE id = p_user_id) INTO v_profile_exists;
    
    IF v_profile_exists THEN
      UPDATE profiles SET
        name = COALESCE(p_profile_data->>'name', name),
        avatar_url = COALESCE(p_profile_data->>'avatar_url', avatar_url),
        coaching_tone = COALESCE(p_profile_data->>'coaching_tone', coaching_tone),
        privacy_mode = COALESCE((p_profile_data->>'privacy_mode')::boolean, privacy_mode),
        timezone = COALESCE(p_profile_data->>'timezone', timezone),
        locale = COALESCE(p_profile_data->>'locale', locale),
        updated_at = NOW(),
        version = COALESCE(version, 0) + 1
      WHERE id = p_user_id;
      
      v_updated_tables := array_append(v_updated_tables, 'profiles');
    END IF;
  END IF;
  
  -- ─────────────────────────────────────────────────────────────
  -- UPSERT USER_PROFILES TABLE
  -- ─────────────────────────────────────────────────────────────
  
  IF p_user_profile_data != '{}'::jsonb THEN
    INSERT INTO user_profiles (
      user_id, height_cm, biological_sex, birth_date, 
      activity_level, fitness_level, target_weight_kg, primary_goal
    )
    VALUES (
      p_user_id,
      (p_user_profile_data->>'height_cm')::numeric,
      p_user_profile_data->>'biological_sex',
      (p_user_profile_data->>'birth_date')::date,
      COALESCE(p_user_profile_data->>'activity_level', 'moderate'),
      COALESCE(p_user_profile_data->>'fitness_level', 'beginner'),
      (p_user_profile_data->>'target_weight_kg')::numeric,
      p_user_profile_data->>'primary_goal'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      height_cm = COALESCE(EXCLUDED.height_cm, user_profiles.height_cm),
      biological_sex = COALESCE(EXCLUDED.biological_sex, user_profiles.biological_sex),
      birth_date = COALESCE(EXCLUDED.birth_date, user_profiles.birth_date),
      activity_level = COALESCE(EXCLUDED.activity_level, user_profiles.activity_level),
      fitness_level = COALESCE(EXCLUDED.fitness_level, user_profiles.fitness_level),
      target_weight_kg = COALESCE(EXCLUDED.target_weight_kg, user_profiles.target_weight_kg),
      primary_goal = COALESCE(EXCLUDED.primary_goal, user_profiles.primary_goal),
      updated_at = NOW()
    WHERE user_profiles.user_id = p_user_id;
    
    v_updated_tables := array_append(v_updated_tables, 'user_profiles');
  END IF;
  
  -- ─────────────────────────────────────────────────────────────
  -- INSERT BODY METRICS
  -- ─────────────────────────────────────────────────────────────
  
  IF p_body_metric_data != '{}'::jsonb THEN
    INSERT INTO body_metrics (
      user_id, metric_type, value, unit, captured_at, source
    )
    VALUES (
      p_user_id,
      COALESCE(p_body_metric_data->>'metric_type', 'weight'),
      (p_body_metric_data->>'value')::numeric,
      COALESCE(p_body_metric_data->>'unit', 'kg'),
      COALESCE((p_body_metric_data->>'captured_at')::timestamptz, NOW()),
      COALESCE(p_body_metric_data->>'source', 'manual')
    );
    
    v_updated_tables := array_append(v_updated_tables, 'body_metrics');
  END IF;
  
  -- ─────────────────────────────────────────────────────────────
  -- UPSERT USER SETTINGS
  -- ─────────────────────────────────────────────────────────────
  
  IF p_settings_data != '{}'::jsonb THEN
    -- Handle map_storage merge
    IF p_settings_data ? 'map_storage' THEN
      UPDATE user_settings SET
        map_storage = COALESCE(map_storage, '{}'::jsonb) || (p_settings_data->'map_storage'),
        updated_at = NOW()
      WHERE user_id = p_user_id;
    ELSE
      UPDATE user_settings SET
        theme = COALESCE(p_settings_data->>'theme', theme),
        language = COALESCE(p_settings_data->>'language', language),
        units = COALESCE(p_settings_data->>'units', units),
        updated_at = NOW()
      WHERE user_id = p_user_id;
    END IF;
    
    v_updated_tables := array_append(v_updated_tables, 'user_settings');
  END IF;
  
  -- ─────────────────────────────────────────────────────────────
  -- UPSERT GOALS
  -- ─────────────────────────────────────────────────────────────
  
  IF p_goal_data != '{}'::jsonb THEN
    INSERT INTO goals (
      user_id, goal_type, status, target_value,
      calories_target, protein_target_g, carbs_target_g, fat_target_g,
      water_target_ml, steps_target
    )
    VALUES (
      p_user_id,
      COALESCE(p_goal_data->>'goal_type', 'maintenance'),
      'active',
      COALESCE((p_goal_data->>'target_value')::numeric, 0),
      (p_goal_data->>'calories_target')::integer,
      (p_goal_data->>'protein_target_g')::integer,
      (p_goal_data->>'carbs_target_g')::integer,
      (p_goal_data->>'fat_target_g')::integer,
      (p_goal_data->>'water_target_ml')::integer,
      (p_goal_data->>'steps_target')::integer
    )
    ON CONFLICT (user_id, status) WHERE status = 'active' DO UPDATE SET
      goal_type = COALESCE(EXCLUDED.goal_type, goals.goal_type),
      target_value = COALESCE(EXCLUDED.target_value, goals.target_value),
      calories_target = COALESCE(EXCLUDED.calories_target, goals.calories_target),
      protein_target_g = COALESCE(EXCLUDED.protein_target_g, goals.protein_target_g),
      carbs_target_g = COALESCE(EXCLUDED.carbs_target_g, goals.carbs_target_g),
      fat_target_g = COALESCE(EXCLUDED.fat_target_g, goals.fat_target_g),
      water_target_ml = COALESCE(EXCLUDED.water_target_ml, goals.water_target_ml),
      steps_target = COALESCE(EXCLUDED.steps_target, goals.steps_target),
      updated_at = NOW();
    
    v_updated_tables := array_append(v_updated_tables, 'goals');
  END IF;
  
  -- ─────────────────────────────────────────────────────────────
  -- RETURN SUCCESS
  -- ─────────────────────────────────────────────────────────────
  
  RETURN jsonb_build_object(
    'success', true,
    'updated_tables', v_updated_tables,
    'new_version', (SELECT version FROM profiles WHERE id = p_user_id),
    'new_updated_at', (SELECT updated_at FROM profiles WHERE id = p_user_id)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TRANSACTION_ERROR',
      'message', SQLERRM
    );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION atomic_profile_update TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_profile_update TO service_role;
GRANT ALL ON _rate_limits TO service_role;
