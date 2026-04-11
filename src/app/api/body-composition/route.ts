/**
 * Body Composition API — Supabase-native
 * GET  /api/body-composition?summary=true  — fetch scan history with trends
 * POST /api/body-composition                — analyze photo & persist results
 *
 * POST uses the SAME rich user context as Iron Coach for accurate AI estimation.
 * Results are persisted to body_metrics AND reflected on the profile page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

// ─────────────────────────────────────────────────────────────────
// GET — Scan History (format matches body-composition-page.tsx)
// ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    const isSummary = searchParams.get('summary') === 'true'
    const limit = parseInt(searchParams.get('limit') ?? '30', 10)

    // Fetch all body_fat metrics ordered by date
    const { data: bodyFatMetrics, error } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .eq('metric_type', 'body_fat')
      .order('captured_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const metrics = bodyFatMetrics ?? []

    // Also fetch muscle_mass metrics
    const { data: muscleMetrics } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .eq('metric_type', 'muscle_mass')
      .order('captured_at', { ascending: false })
      .limit(limit)

    // Build a map of capturedAt -> muscle value for joining
    const muscleMap = new Map<string, number>()
    for (const m of muscleMetrics ?? []) {
      if (m.captured_at && m.value) {
        muscleMap.set(m.captured_at, Number(m.value))
      }
    }

    if (!isSummary) {
      return NextResponse.json({ metrics })
    }

    // ── Build scan objects (format expected by body-composition-page.tsx) ──
    const scans = metrics.map((m, index) => {
      const value = Number(m.value)
      const prevValue = index < metrics.length - 1 ? Number(metrics[index + 1].value) : null
      let bodyFatChange: number | null = null
      let changeDirection: string | null = null

      if (prevValue !== null && Number.isFinite(prevValue)) {
        bodyFatChange = Math.round((value - prevValue) * 10) / 10
        if (bodyFatChange < -0.5) changeDirection = 'improving'
        else if (bodyFatChange > 0.5) changeDirection = 'declining'
        else changeDirection = 'stable'
      }

      const muscleValue = muscleMap.get(m.captured_at)

      return {
        id: m.id,
        capturedAt: m.captured_at,
        bodyFatMin: Math.round(Math.max(3, value - 3) * 10) / 10,
        bodyFatMax: Math.round(Math.min(55, value + 3) * 10) / 10,
        bodyFatConfidence: Math.round(Number(m.confidence ?? 0.5) * 100) / 100,
        leanMassMin: muscleValue ? Math.round((muscleValue - 2) * 10) / 10 : null,
        leanMassMax: muscleValue ? Math.round((muscleValue + 2) * 10) / 10 : null,
        bodyFatChange,
        changeDirection,
        aiCommentary: m.notes || null,
        photoClarity: 0.7,
        lightingQuality: 0.7,
        poseQuality: 0.7,
        rapidChangeDetected: bodyFatChange !== null && Math.abs(bodyFatChange) > 3,
        safetyAlert: bodyFatChange !== null && Math.abs(bodyFatChange) > 3
          ? `Large body fat change detected (${bodyFatChange > 0 ? '+' : ''}${bodyFatChange.toFixed(1)}%). This may indicate measurement variability.`
          : null,
      }
    })

    // ── Trends ──
    const reversedScans = [...scans].reverse()
    const trendData = reversedScans.map(s => ({
      date: s.capturedAt,
      value: (s.bodyFatMin + s.bodyFatMax) / 2,
      confidence: s.bodyFatConfidence,
    }))
    const avgChange = trendData.length >= 2
      ? Math.round((trendData[trendData.length - 1].value - trendData[0].value) / trendData.length * 10) / 10
      : 0

    let direction: 'improving' | 'stable' | 'declining' = 'stable'
    if (trendData.length >= 2) {
      const recent = trendData.slice(-3).map(t => t.value)
      const older = trendData.slice(0, 3).map(t => t.value)
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length
      const diff = recentAvg - olderAvg
      if (diff < -0.5) direction = 'improving'
      else if (diff > 0.5) direction = 'declining'
    }

    // ── Monthly Summary ──
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const recentScans = scans.filter(s => new Date(s.capturedAt) >= thirtyDaysAgo)

    let monthlySummary: {
      period: string
      scanCount: number
      bodyFatChange: number
      direction: string
      summary: string
    } | null = null

    if (recentScans.length >= 2) {
      const newest = recentScans[0]
      const oldest = recentScans[recentScans.length - 1]
      const newestAvg = (newest.bodyFatMin + newest.bodyFatMax) / 2
      const oldestAvg = (oldest.bodyFatMin + oldest.bodyFatMax) / 2
      const change = Math.round((newestAvg - oldestAvg) * 10) / 10

      let dirLabel = 'stable'
      if (change < -0.5) dirLabel = 'decreased'
      else if (change > 0.5) dirLabel = 'increased'

      const dir = change < -0.5 ? 'decreased' : change > 0.5 ? 'increased' : 'stable'

      monthlySummary = {
        period: 'Last 30 days',
        scanCount: recentScans.length,
        bodyFatChange: change,
        direction: dir,
        summary: `Body fat ${dirLabel} by ${Math.abs(change).toFixed(1)}% over the last 30 days across ${recentScans.length} scans.`,
      }
    }

    return NextResponse.json({
      scans,
      trends: {
        bodyFatTrend: trendData,
        avgChange,
        direction,
      },
      monthlySummary,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch body composition', details: msg }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────
// POST — Analyze Photo with Full User Context (same data as Iron Coach)
// ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    // ── Parse request body ──────────────────────────────────────────
    let body: { frontPhotoUrl?: string; lighting?: string; clothing?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { frontPhotoUrl, lighting = 'moderate', clothing = 'light' } = body

    if (!frontPhotoUrl || typeof frontPhotoUrl !== 'string') {
      return NextResponse.json({ error: 'frontPhotoUrl is required' }, { status: 400 })
    }

    // ── Fetch FULL user context (same data Iron Coach gets) ─────────
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const todayStr = now.toISOString().split('T')[0]

    // Calculate current week Monday
    const dayOfWeek = now.getDay()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
    const weekStartStr = weekStart.toISOString().split('T')[0]

    const [
      { data: profile },
      { data: userProfile },
      { data: settings },
      { data: latestWeightMetric },
      { data: prevBodyFatMetric },
      { data: prevMuscleMassMetric },
      { data: recentGoals },
      { data: recentFoodLogs },
      { data: recentWorkouts },
      { data: sleepLogs },
      { data: supplements },
      { data: weeklyPlan },
    ] = await Promise.all([
      supabase.from('profiles').select('name, height_cm, weight_kg, activity_level, fitness_level, dietary_restrictions, allergies').eq('id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('height_cm, activity_level, fitness_level, dietary_restrictions, allergies, primary_goal, target_weight_kg, birth_date, biological_sex').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_settings').select('map_storage').eq('user_id', user.id).maybeSingle(),
      supabase.from('body_metrics').select('value, unit, captured_at').eq('user_id', user.id).eq('metric_type', 'weight').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('body_metrics').select('value, captured_at').eq('user_id', user.id).eq('metric_type', 'body_fat').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('body_metrics').select('value, captured_at').eq('user_id', user.id).eq('metric_type', 'muscle_mass').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('goals').select('goal_type, target_weight_kg, target_date').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1),
      supabase.from('food_logs').select('food_name, meal_type, protein, calories, carbs, fat, logged_at').eq('user_id', user.id).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }).limit(7),
      supabase.from('workouts').select('calories_burned, duration_minutes, workout_type, started_at').eq('user_id', user.id).gte('started_at', sevenDaysAgo).order('started_at', { ascending: false }).limit(5),
      supabase.from('sleep_logs').select('duration_minutes, quality').eq('user_id', user.id).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }).limit(7),
      supabase.from('supplements').select('name, dose, timing').eq('user_id', user.id),
      (supabase as any).from('weekly_plans').select('week_start_date, week_end_date, plan_data, confidence_score').eq('user_id', user.id).eq('week_start_date', weekStartStr).eq('status', 'active').maybeSingle(),
    ])

    // ── Resolve user context values ─────────────────────────────────
    const heightCm = userProfile?.height_cm ?? (profile as any)?.height_cm ?? null
    const weightKg = latestWeightMetric?.value ? Number(latestWeightMetric.value) : (profile as any)?.weight_kg ?? null
    const birthDate = (userProfile as any)?.birth_date ?? null
    const age = birthDate
      ? Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
    const sex = (userProfile as any)?.biological_sex ?? 'unknown'
    const activityLevel = userProfile?.activity_level ?? profile?.activity_level ?? 'moderate'
    const fitnessLevel = userProfile?.fitness_level ?? profile?.fitness_level ?? 'beginner'
    const primaryGoal = userProfile?.primary_goal ?? recentGoals?.[0]?.goal_type ?? 'maintenance'
    const targetWeightKg = userProfile?.target_weight_kg ?? recentGoals?.[0]?.target_weight_kg ?? null
    const dietaryRestrictions = userProfile?.dietary_restrictions || profile?.dietary_restrictions || []
    const allergies = userProfile?.allergies || profile?.allergies || []
    const prevBodyFat = prevBodyFatMetric?.value ? Number(prevBodyFatMetric.value) : null
    const prevMuscleMass = prevMuscleMassMetric?.value ? Number(prevMuscleMassMetric.value) : null

    // ── Calculate weekly nutrition stats ────────────────────────────
    const foodLogs = recentFoodLogs ?? []
    const totalCalories = Math.round(foodLogs.reduce((sum: number, f: any) => sum + (Number(f.calories) || 0), 0))
    const totalProtein = Math.round(foodLogs.reduce((sum: number, f: any) => sum + (Number(f.protein) || 0), 0))
    const totalCarbs = Math.round(foodLogs.reduce((sum: number, f: any) => sum + (Number(f.carbs) || 0), 0))
    const totalFat = Math.round(foodLogs.reduce((sum: number, f: any) => sum + (Number(f.fat) || 0), 0))

    // ── Calculate weekly workout stats ──────────────────────────────
    const workouts = recentWorkouts ?? []
    const workoutsThisWeek = workouts.length
    const caloriesBurned = Math.round(workouts.reduce((sum: number, w: any) => sum + (Number(w.calories_burned) || 0), 0))
    const totalWorkoutMin = Math.round(workouts.reduce((sum: number, w: any) => sum + (Number(w.duration_minutes) || 0), 0))

    // ── Calculate avg sleep ─────────────────────────────────────────
    const sleepData = sleepLogs ?? []
    const avgSleepHrs = sleepData.length > 0
      ? Math.round(sleepData.reduce((sum: number, s: any) => sum + (Number(s.duration_minutes) || 0), 0) / sleepData.length / 60 * 10) / 10
      : null

    // ── Supplements list ────────────────────────────────────────────
    const suppList = (supplements ?? []).filter((s: any) => s.name).map((s: any) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`)

    // ── Weekly plan summary ─────────────────────────────────────────
    let weeklyPlanStr = ''
    if (weeklyPlan) {
      const planData = (weeklyPlan as any).plan_data
      const overview = planData?.weekly_overview
      if (overview) {
        weeklyPlanStr = `Weekly Plan Active: ${overview.weekly_strategy || 'No strategy noted'}`
        if (overview.total_workout_days) weeklyPlanStr += `. Workout days: ${overview.total_workout_days}/week`
        if (overview.weekly_calorie_target) weeklyPlanStr += `. Calorie target: ${overview.weekly_calorie_target}cal/day`
        if (overview.focus_areas?.length) weeklyPlanStr += `. Focus: ${overview.focus_areas.join(', ')}`
      }
    }

    // ── Build RICH AI prompt (same data Iron Coach sees) ───────────
    const contextLines: string[] = []
    contextLines.push('USER PROFILE (use this data to improve accuracy):')
    const profileParts: string[] = []
    if (heightCm) profileParts.push(`Height: ${heightCm}cm`)
    if (weightKg) profileParts.push(`Weight: ${weightKg}kg`)
    if (sex && sex !== 'unknown') profileParts.push(`Sex: ${sex}`)
    if (age) profileParts.push(`Age: ${age}`)
    profileParts.push(`Activity: ${activityLevel}`)
    profileParts.push(`Fitness: ${fitnessLevel}`)
    profileParts.push(`Goal: ${primaryGoal}`)
    contextLines.push(`- ${profileParts.join(' | ') || 'No physical measurements available — estimate visually'}`)
    
    if (targetWeightKg) contextLines.push(`- Target Weight: ${targetWeightKg}kg`)
    if (dietaryRestrictions?.length) contextLines.push(`- Dietary Restrictions: ${Array.isArray(dietaryRestrictions) ? dietaryRestrictions.join(', ') : dietaryRestrictions}`)
    if (allergies?.length) contextLines.push(`- Allergies: ${Array.isArray(allergies) ? allergies.join(', ') : allergies}`)
    if (prevBodyFat !== null) contextLines.push(`- Previous Body Fat: ${prevBodyFat}% (use as baseline reference)`)
    if (prevMuscleMass !== null) contextLines.push(`- Previous Muscle Mass: ${prevMuscleMass}kg`)

    contextLines.push('')
    contextLines.push('THIS WEEK (7 days):')
    contextLines.push(`- Calories consumed: ${totalCalories} | Protein: ${totalProtein}g | Carbs: ${totalCarbs}g | Fat: ${totalFat}g`)
    contextLines.push(`- Workouts: ${workoutsThisWeek} (${totalWorkoutMin}min total, ${caloriesBurned}cal burned)`)
    if (avgSleepHrs) contextLines.push(`- Avg Sleep: ${avgSleepHrs}h/night`)
    if (suppList.length) contextLines.push(`- Supplements: ${suppList.join(', ')}`)

    if (weeklyPlanStr) {
      contextLines.push('')
      contextLines.push(weeklyPlanStr)
    }

    if (foodLogs.length > 0) {
      contextLines.push('')
      contextLines.push('RECENT MEALS:')
      foodLogs.slice(0, 5).forEach((f: any) => {
        contextLines.push(`- ${f.food_name || 'Unknown'}: ${f.calories || 0}cal, ${f.protein || 0}g P (${f.meal_type || '?'})`)
      })
    }

    const enhancedPrompt = `Estimate body comp from this photo. Use profile data above. Photo: lighting=${lighting}, clothing=${clothing}.
Cross-reference: caloric deficit + high protein + training = more lean mass. Use prev BF as anchor.
Realistic ranges: avg 15-30%, athlete 8-15%, bodybuilder 4-8%.
Return ONLY JSON:{"bodyFatEstimate":{"value":0,"confidence":0,"rationale":""},"muscleMassEstimate":{"value":0,"confidence":0,"rationale":""},"weightEstimate":{"value":0,"confidence":0,"rationale":""},"overallConfidence":0,"analysisNotes":"","recommendations":[]}
No disclaimers. No text outside JSON.`

    // ── Call AI vision analysis ─────────────────────────────────────
    const { analyzePhoto } = await import('@/lib/ai/gemini-service')

    const fullPrompt = `${contextLines.join('\n')}

${enhancedPrompt}`

    const aiResult = await analyzePhoto(frontPhotoUrl, 'body-composition', fullPrompt)

    if (!aiResult.success || !aiResult.analysis) {
      return NextResponse.json({
        error: 'AI analysis failed',
        details: aiResult.error || 'Unknown error',
      }, { status: 500 })
    }

    const analysis = aiResult.analysis as Record<string, unknown>

    // Extract body fat estimate
    const bodyFatEstimate = analysis.bodyFatEstimate as Record<string, unknown> | undefined
    const muscleMassEstimate = analysis.muscleMassEstimate as Record<string, unknown> | undefined
    const weightEstimate = analysis.weightEstimate as Record<string, unknown> | undefined

    const rawBodyFat = bodyFatEstimate?.value ? Number(bodyFatEstimate.value) : null
    const rawConfidence = analysis.overallConfidence ? Number(analysis.overallConfidence) / 100 : 0.5
    const confidence = Math.max(0.3, Math.min(0.95, rawConfidence))
    const rawMuscleMass = muscleMassEstimate?.value ? Number(muscleMassEstimate.value) : null

    // Build min/max range (±3 around center estimate)
    let bodyFatMin: number
    let bodyFatMax: number
    if (rawBodyFat !== null && Number.isFinite(rawBodyFat)) {
      bodyFatMin = Math.max(3, Math.min(55, rawBodyFat - 3))
      bodyFatMax = Math.max(bodyFatMin + 1, Math.min(55, rawBodyFat + 3))
    } else {
      bodyFatMin = 15
      bodyFatMax = 25
    }

    // ── Save body metrics to database (with error handling) ─────────
    const capturedAt = now.toISOString()
    const bodyFatAvg = (bodyFatMin + bodyFatMax) / 2
    let bodyFatSaved = false
    let muscleMassSaved = false

    // Insert body_fat metric
    const { error: bfError } = await supabase.from('body_metrics').insert({
      user_id: user.id,
      metric_type: 'body_fat',
      value: bodyFatAvg,
      unit: '%',
      source: 'model',
      captured_at: capturedAt,
      confidence: confidence,
    })
    if (bfError) {
      console.error('[body-composition] Failed to save body_fat metric:', bfError.message)
    } else {
      bodyFatSaved = true
    }

    // Insert muscle_mass metric if we have a valid estimate
    if (rawMuscleMass !== null && Number.isFinite(rawMuscleMass) && rawMuscleMass > 0) {
      const { error: mmError } = await supabase.from('body_metrics').insert({
        user_id: user.id,
        metric_type: 'muscle_mass',
        value: rawMuscleMass,
        unit: 'kg',
        source: 'model',
        captured_at: capturedAt,
        confidence: confidence * 0.8,
      })
      if (mmError) {
        console.error('[body-composition] Failed to save muscle_mass metric:', mmError.message)
      } else {
        muscleMassSaved = true
      }
    }

    // ── Calculate change from previous scan ─────────────────────────
    let bodyFatChange: number | null = null
    let changeDirection: string | null = null

    if (prevBodyFat !== null && Number.isFinite(prevBodyFat)) {
      bodyFatChange = Math.round((bodyFatAvg - prevBodyFat) * 10) / 10
      if (bodyFatChange < -0.5) changeDirection = 'improving'
      else if (bodyFatChange > 0.5) changeDirection = 'declining'
      else changeDirection = 'stable'
    }

    // ── Generate AI commentary ──────────────────────────────────────
    const analysisNotes = (analysis.analysisNotes as string) || ''
    const recommendations = Array.isArray(analysis.recommendations) ? (analysis.recommendations as string[]) : []

    let aiCommentary = analysisNotes
    if (recommendations.length > 0) {
      aiCommentary += (aiCommentary ? '\n\n' : '') + recommendations.join('. ') + '.'
    }
    if (bodyFatChange !== null && changeDirection) {
      const directionLabel = changeDirection === 'improving'
        ? 'decreased'
        : changeDirection === 'declining'
          ? 'increased'
          : 'remained stable'
      aiCommentary += (aiCommentary ? '\n\n' : '') + `Body fat ${directionLabel} by ${Math.abs(bodyFatChange).toFixed(1)}% since last scan.`
    }

    // ── Derive photo quality scores from lighting/clothing inputs ──
    const lightingScores: Record<string, number> = { good: 0.9, moderate: 0.7, poor: 0.4 }
    const clothingScores: Record<string, number> = { minimal: 0.9, light: 0.7, heavy: 0.4 }

    const lightingQuality = lightingScores[lighting] ?? 0.6
    const poseQuality = clothingScores[clothing] ?? 0.6
    const photoClarity = Math.round(((lightingQuality + poseQuality) / 2) * 10) / 10

    // ── Rapid change detection (safety check) ───────────────────────
    const rapidChangeDetected = bodyFatChange !== null && Math.abs(bodyFatChange) > 3
    const safetyAlert = rapidChangeDetected
      ? `Large body fat change detected (${bodyFatChange > 0 ? '+' : ''}${bodyFatChange.toFixed(1)}%). This may indicate measurement variability rather than actual change. Consider scanning again for verification.`
      : null

    // ── Build scan ID ───────────────────────────────────────────────
    const scanId = `scan_${user.id.slice(0, 8)}_${Date.now()}`

    // ── Build response ──────────────────────────────────────────────
    const scan = {
      id: scanId,
      capturedAt: capturedAt,
      bodyFatMin: Math.round(bodyFatMin * 10) / 10,
      bodyFatMax: Math.round(bodyFatMax * 10) / 10,
      bodyFatConfidence: Math.round(confidence * 100) / 100,
      leanMassMin: rawMuscleMass !== null && Number.isFinite(rawMuscleMass)
        ? Math.round((rawMuscleMass - 2) * 10) / 10
        : null,
      leanMassMax: rawMuscleMass !== null && Number.isFinite(rawMuscleMass)
        ? Math.round((rawMuscleMass + 2) * 10) / 10
        : null,
      bodyFatChange,
      changeDirection,
      aiCommentary: aiCommentary || null,
      photoClarity,
      lightingQuality,
      poseQuality,
      rapidChangeDetected,
      safetyAlert,
      persisted: bodyFatSaved,
    }

    return NextResponse.json({ scan }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[body-composition POST]', err)
    return NextResponse.json({ error: 'Failed to analyze body composition', details: msg }, { status: 500 })
  }
}
