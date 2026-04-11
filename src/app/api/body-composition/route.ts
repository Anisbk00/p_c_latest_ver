/**
 * Body Composition API — Supabase-native
 * GET  /api/body-composition
 * POST /api/body-composition
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') ?? '30', 10)

    const { data, error } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .in('metric_type', ['weight', 'body_fat', 'muscle_mass', 'bmi'])
      .order('captured_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json({ metrics: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch body composition', details: msg }, { status: 500 })
  }
}

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

    // ── Fetch user context in parallel ──────────────────────────────
    const now = new Date().toISOString()

    const [
      { data: profile },
      { data: userProfile },
      { data: latestWeightMetric },
      { data: prevBodyFatMetric },
    ] = await Promise.all([
      supabase.from('profiles').select('height_cm, weight, biological_sex, birth_date').eq('id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('height_cm, activity_level, fitness_level, primary_goal').eq('user_id', user.id).maybeSingle(),
      supabase.from('body_metrics').select('value, unit').eq('user_id', user.id).eq('metric_type', 'weight').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('body_metrics').select('value, captured_at').eq('user_id', user.id).eq('metric_type', 'body_fat').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    // Resolve user context values with sensible defaults
    const heightCm = userProfile?.height_cm ?? (profile as any)?.height_cm ?? null
    const weightKg = latestWeightMetric?.value ? Number(latestWeightMetric.value) : null
    const sex = (profile as any)?.biological_sex ?? 'unknown'
    const birthDate = (profile as any)?.birth_date ?? null
    const age = birthDate
      ? Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
    const activityLevel = userProfile?.activity_level ?? 'moderate'
    const fitnessLevel = userProfile?.fitness_level ?? 'beginner'
    const primaryGoal = userProfile?.primary_goal ?? 'maintenance'
    const prevBodyFat = prevBodyFatMetric?.value ? Number(prevBodyFatMetric.value) : null

    // ── Build enhanced AI prompt with user context ──────────────────
    const enhancedPrompt = `Estimate body composition from this photo.
USER CONTEXT:
- Height: ${heightCm ?? 'unknown'}cm
- Weight: ${weightKg ?? 'unknown'}kg
- Sex: ${sex}
- Age: ${age ?? 'unknown'}
- Activity Level: ${activityLevel}
- Primary Goal: ${primaryGoal}
- Previous Body Fat: ${prevBodyFat !== null ? `${prevBodyFat}%` : 'none'}
PHOTO CONDITIONS:
- Lighting: ${lighting}
- Clothing: ${clothing}
Return JSON only:{"bodyFatEstimate":{"value":0,"confidence":0,"rationale":""},"muscleMassEstimate":{"value":0,"confidence":0,"rationale":""},"weightEstimate":{"value":0,"confidence":0,"rationale":""},"overallConfidence":0,"analysisNotes":"","recommendations":[]}`

    // ── Call AI vision analysis ─────────────────────────────────────
    const { analyzePhoto } = await import('@/lib/ai/gemini-service')

    const aiResult = await analyzePhoto(frontPhotoUrl, 'body-composition', enhancedPrompt)

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

    // ── Save body metrics to database ───────────────────────────────
    const capturedAt = now

    // Insert body_fat metric
    await supabase.from('body_metrics').insert({
      user_id: user.id,
      metric_type: 'body_fat',
      value: (bodyFatMin + bodyFatMax) / 2,
      unit: '%',
      source: 'model',
      captured_at: capturedAt,
      confidence: confidence,
    })

    // Insert muscle_mass metric if we have an estimate
    if (rawMuscleMass !== null && Number.isFinite(rawMuscleMass) && rawMuscleMass > 0) {
      await supabase.from('body_metrics').insert({
        user_id: user.id,
        metric_type: 'muscle_mass',
        value: rawMuscleMass,
        unit: 'kg',
        source: 'model',
        captured_at: capturedAt,
        confidence: confidence * 0.8, // muscle mass less confident than body fat
      })
    }

    // ── Calculate change from previous scan ─────────────────────────
    let bodyFatChange: number | null = null
    let changeDirection: string | null = null

    if (prevBodyFat !== null && Number.isFinite(prevBodyFat)) {
      const currentAvg = (bodyFatMin + bodyFatMax) / 2
      bodyFatChange = Math.round((currentAvg - prevBodyFat) * 10) / 10

      if (bodyFatChange < -0.5) {
        changeDirection = 'improving'
      } else if (bodyFatChange > 0.5) {
        changeDirection = 'declining'
      } else {
        changeDirection = 'stable'
      }
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
    }

    return NextResponse.json({ scan }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[body-composition POST]', err)
    return NextResponse.json({ error: 'Failed to analyze body composition', details: msg }, { status: 500 })
  }
}
