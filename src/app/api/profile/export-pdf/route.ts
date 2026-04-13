/**
 * Premium Coach Snapshot PDF — Doctor-Level Report
 * GET /api/profile/export-pdf
 *
 * Fetches ALL user health/fitness data from Supabase, then builds
 * a multi-page, professional-grade PDF report.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createServerClient } from '@/lib/supabase/server'
import { format } from 'date-fns'

// ═══════════════════════════════════════════════════════════════
// Color palette — Premium medical/clinical feel
// ═══════════════════════════════════════════════════════════════
const C = {
  primary:    rgb(0.063, 0.725, 0.506),   // emerald-500
  primaryDim: rgb(0.063, 0.725, 0.506, 0.15),
  dark:       rgb(0.08, 0.08, 0.08),
  text:       rgb(0.15, 0.15, 0.15),
  gray:       rgb(0.45, 0.45, 0.45),
  lightGray:  rgb(0.92, 0.92, 0.92),
  veryLight:  rgb(0.97, 0.97, 0.97),
  white:      rgb(1, 1, 1),
  accent:     rgb(0.082, 0.396, 0.753),   // blue-600
  warning:    rgb(0.976, 0.451, 0.086),   // orange-500
  danger:     rgb(0.902, 0.204, 0.204),   // red-500
  purple:     rgb(0.545, 0.361, 0.706),   // purple
}

const PW = 595.28  // A4 width
const PH = 841.89  // A4 height
const ML = 50      // margin left
const MR = 50      // margin right
const CW = PW - ML - MR  // content width

// ═══════════════════════════════════════════════════════════════
// PDF builder helpers
// ═══════════════════════════════════════════════════════════════
function newPage(doc: Awaited<ReturnType<typeof PDFDocument.create>>, fonts: { bold: any; normal: any; italic: any }) {
  const page = doc.addPage([PW, PH])
  return { page, y: PH - 50, fonts }
}

function drawSectionHeader(page: any, y: number, fonts: any, title: string, color = C.primary) {
  // Emerald accent line
  page.drawRectangle({ x: ML, y: y - 3, width: 4, height: 16, color })
  page.drawText(title.toUpperCase(), { x: ML + 12, y, size: 11, font: fonts.bold, color: C.dark })
  return y - 24
}

function drawInfoRow(page: any, y: number, fonts: any, label: string, value: string, labelColor = C.gray) {
  page.drawText(label, { x: ML + 12, y, size: 9, font: fonts.normal, color: labelColor })
  const labelW = fonts.normal.widthOfTextAtSize(label, 9)
  page.drawText(value, { x: ML + 12 + labelW + 6, y, size: 9, font: fonts.normal, color: C.text })
  return y - 16
}

function drawMetricCard(page: any, x: number, y: number, fonts: any, label: string, value: string, accentColor = C.primary) {
  const w = (CW - 15) / 4
  const h = 58
  // Card background
  page.drawRectangle({ x, y: y - h, width: w, height: h, color: C.veryLight, borderColor: C.lightGray, borderWidth: 0.5, borderRadius: 4 })
  // Top accent line
  page.drawRectangle({ x, y: y - 3, width: w, height: 3, color: accentColor })
  // Label
  page.drawText(label, { x: x + 8, y: y - 20, size: 8, font: fonts.normal, color: C.gray, maxWidth: w - 16 })
  // Value
  page.drawText(value, { x: x + 8, y: y - 42, size: 16, font: fonts.bold, color: C.dark })
  return { w, h }
}

function drawProgressBar(page: any, x: number, y: number, w: number, h: number, progress: number, color = C.primary) {
  // Background track
  page.drawRectangle({ x, y: y - h, width: w, height: h, color: C.veryLight, borderColor: C.lightGray, borderWidth: 0.5, borderRadius: 2 })
  // Fill
  const fillW = Math.max(Math.min(w * (progress / 100), w), 0)
  if (fillW > 0) {
    page.drawRectangle({ x, y: y - h, width: fillW, height: h, color, borderRadius: 2 })
  }
  // Percentage text
  page.drawText(`${Math.round(progress)}%`, { x: x + w + 6, y: y - h + 1, size: 8, font: fonts_bold_cache!, color: C.gray })
}

// Cache for bold font used in closures
let fonts_bold_cache: any = null

function drawDataTable(page: any, y: number, fonts: any, headers: string[], rows: string[][], colWidths?: number[]) {
  const totalW = colWidths ? colWidths.reduce((a, b) => a + b, 0) : CW - 24
  const colW = colWidths || headers.map(() => totalW / headers.length)
  
  // Header row
  page.drawRectangle({ x: ML + 12, y: y - 14, width: totalW, height: 18, color: C.veryLight, borderRadius: 2 })
  let x = ML + 12
  headers.forEach((h, i) => {
    page.drawText(h, { x: x + 4, y: y - 8, size: 8, font: fonts.bold, color: C.gray })
    x += colW[i]
  })
  y -= 20

  // Data rows
  rows.forEach((row, ri) => {
    if (y < 80) return // Don't overflow past page
    x = ML + 12
    if (ri % 2 === 0) {
      page.drawRectangle({ x, y: y - 14, width: totalW, height: 16, color: C.veryLight })
    }
    row.forEach((cell, ci) => {
      page.drawText(cell, { x: x + 4, y: y - 8, size: 8, font: fonts.normal, color: C.text })
      x += colW[ci]
    })
    y -= 16
  })
  return y - 10
}

function drawFooter(page: any, pageNum: number, totalPages: number, fonts: any) {
  page.drawLine({ start: { x: ML, y: 55 }, end: { x: PW - MR, y: 55 }, thickness: 0.5, color: C.lightGray })
  page.drawText('Progress Companion — Premium Health Report', { x: ML, y: 40, size: 7, font: fonts.normal, color: C.gray })
  page.drawText(`Confidential — Generated ${format(new Date(), 'MMM d, yyyy HH:mm')}`, { x: ML, y: 30, size: 7, font: fonts.normal, color: C.gray })
  page.drawText(`Page ${pageNum} of ${totalPages}`, { x: PW - MR - 60, y: 40, size: 7, font: fonts.normal, color: C.gray })
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // ═══════════════════════════════════════════════════════════
    // Fetch ALL user data in parallel
    // ═══════════════════════════════════════════════════════════
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()

    const [
      { data: profile },
      { data: userProfile },
      { data: userSettings },
      { data: goals },
      { data: allWeights },
      { data: allBodyFat },
      { data: allMuscleMass },
      { data: allMeasurements },
      { data: recentWorkoutsRaw },
      { data: allWorkoutsRaw },
      { data: recentFoodRaw },
      { data: recentHydrationRaw },
      { data: recentStepsRaw },
      { data: recentSleepRaw },
      { data: targets },
      { data: recentSuppRaw },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').limit(10),
      supabase.from('body_metrics').select('value, unit, captured_at').eq('user_id', user.id).eq('metric_type', 'weight').order('captured_at', { ascending: false }).limit(30),
      supabase.from('body_metrics').select('value, captured_at').eq('user_id', user.id).eq('metric_type', 'body_fat').order('captured_at', { ascending: false }).limit(10),
      supabase.from('body_metrics').select('value, unit, captured_at').eq('user_id', user.id).eq('metric_type', 'muscle_mass').order('captured_at', { ascending: false }).limit(10),
      supabase.from('body_metrics').select('metric_type, value, unit, captured_at').eq('user_id', user.id).in('metric_type', ['waist', 'chest', 'hips', 'biceps', 'thigh', 'neck', 'bmi', 'resting_heart_rate', 'blood_pressure_systolic', 'blood_pressure_diastolic']).order('captured_at', { ascending: false }),
      supabase.from('workouts').select('id, activity_type, workout_type, name, started_at, duration_minutes, calories_burned, avg_heart_rate, max_heart_rate, distance_meters, total_volume, total_reps, total_sets, effort_score, training_load, intensity_factor, rating').eq('user_id', user.id).gte('started_at', thirtyDaysAgo).order('started_at', { ascending: false }).limit(30),
      supabase.from('workouts').select('id, started_at, duration_minutes, calories_burned, activity_type').eq('user_id', user.id).gte('started_at', ninetyDaysAgo).order('started_at', { ascending: false }),
      supabase.from('food_logs').select('food_name, calories, protein, carbs, fat, meal_type, logged_at').eq('user_id', user.id).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }),
      supabase.from('hydration_logs').select('amount_ml, logged_at').eq('user_id', user.id).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }).limit(50),
      supabase.from('steps_logs').select('steps, distance_meters, logged_at').eq('user_id', user.id).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }).limit(50),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('date', sevenDaysAgo).order('date', { ascending: false }).limit(14),
      supabase.from('targets').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('supplement_logs').select('supplement_name, quantity, unit, time_of_day, logged_at').eq('user_id', user.id).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }).limit(50),
    ])

    // Type assertions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = profile as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const up = userProfile as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = userSettings as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeGoals = (goals ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weights = (allWeights ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyFats = (allBodyFat ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const muscleMasses = (allMuscleMass ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const measurements = (allMeasurements ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentWorkouts = (recentWorkoutsRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allWorkouts = (allWorkoutsRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentFood = (recentFoodRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hydration = (recentHydrationRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const steps = (recentStepsRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sleep = (recentSleepRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailyTargets = targets as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supplements = (recentSuppRaw ?? []) as any[]

    // ═══════════════════════════════════════════════════════════
    // Calculate derived metrics
    // ═══════════════════════════════════════════════════════════
    const latestWeight = weights[0]
    const latestBF = bodyFats[0]
    const latestMM = muscleMasses[0]

    // Weight trend (compare oldest vs newest in 30 days)
    const oldestWeight = weights.length > 1 ? weights[weights.length - 1] : null
    const weightChange = (latestWeight && oldestWeight) ? (latestWeight.value - oldestWeight.value).toFixed(1) : null

    // BMI calculation
    const heightM = up?.height_cm ? up.height_cm / 100 : null
    const bmi = (latestWeight?.value && heightM) ? (latestWeight.value / (heightM * heightM)).toFixed(1) : null

    // 30-day workout stats
    const totalWorkoutDuration = recentWorkouts.reduce((s: number, w: any) => s + (w.duration_minutes ?? 0), 0)
    const totalWorkoutCalories = recentWorkouts.reduce((s: number, w: any) => s + (w.calories_burned ?? 0), 0)
    const totalVolume = recentWorkouts.reduce((s: number, w: any) => s + (w.total_volume ?? 0), 0)
    const totalReps = recentWorkouts.reduce((s: number, w: any) => s + (w.total_reps ?? 0), 0)
    const avgHR = recentWorkouts.filter((w: any) => w.avg_heart_rate).reduce((s: number, w: any) => s + w.avg_heart_rate, 0)
    const workoutsWithHR = recentWorkouts.filter((w: any) => w.avg_heart_rate).length
    const avgHeartRate = workoutsWithHR > 0 ? Math.round(avgHR / workoutsWithHR) : null

    // Activity type breakdown
    const activityBreakdown: Record<string, number> = {}
    recentWorkouts.forEach((w: any) => {
      const type = w.activity_type || w.workout_type || 'Other'
      activityBreakdown[type] = (activityBreakdown[type] || 0) + 1
    })

    // Streak calculation
    let currentStreak = 0
    const today = new Date(); today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 60; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const has = allWorkouts.some((w: any) => { const wd = new Date(w.started_at); wd.setHours(0, 0, 0, 0); return wd.getTime() === d.getTime() })
      if (has) currentStreak++
      else if (i > 0) break
    }

    // 90-day total
    const workouts90d = allWorkouts.length
    const totalCal90d = allWorkouts.reduce((s: number, w: any) => s + (w.calories_burned ?? 0), 0)

    // 7-day nutrition averages
    const uniqueFoodDays = [...new Set(recentFood.map((f: any) => f.logged_at?.split('T')[0]))]
    const daysWithFood = uniqueFoodDays.length || 1
    const avgCalories = recentFood.length ? Math.round(recentFood.reduce((s: number, f: any) => s + (f.calories ?? 0), 0) / daysWithFood) : 0
    const avgProtein = recentFood.length ? Math.round(recentFood.reduce((s: number, f: any) => s + (f.protein ?? 0), 0) / daysWithFood) : 0
    const avgCarbs = recentFood.length ? Math.round(recentFood.reduce((s: number, f: any) => s + (f.carbs ?? 0), 0) / daysWithFood) : 0
    const avgFat = recentFood.length ? Math.round(recentFood.reduce((s: number, f: any) => s + (f.fat ?? 0), 0) / daysWithFood) : 0

    // 7-day hydration
    const avgHydration = hydration.length ? Math.round(hydration.reduce((s: number, h: any) => s + (h.amount_ml ?? 0), 0) / daysWithFood) : 0

    // 7-day steps
    const avgSteps = steps.length ? Math.round(steps.reduce((s: number, st: any) => s + (st.steps ?? 0), 0) / (steps.length || 1)) : 0

    // 7-day sleep
    const avgSleepDuration = sleep.length ? Math.round(sleep.reduce((s: number, sl: any) => s + (sl.duration_minutes ?? 0), 0) / sleep.length) : null
    const avgSleepScore = sleep.length ? Math.round(sleep.reduce((s: number, sl: any) => s + (sl.sleep_score ?? 0), 0) / sleep.filter((sl: any) => sl.sleep_score).length) : null

    // Group measurements by type
    const measurementGroups: Record<string, any[]> = {}
    measurements.forEach((m: any) => {
      if (!measurementGroups[m.metric_type]) measurementGroups[m.metric_type] = []
      if (measurementGroups[m.metric_type].length < 3) measurementGroups[m.metric_type].push(m)
    })

    // ═══════════════════════════════════════════════════════════
    // Build PDF
    // ═══════════════════════════════════════════════════════════
    const pdfDoc = await PDFDocument.create()
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
    fonts_bold_cache = fontBold
    const fonts = { normal: fontNormal, bold: fontBold, italic: fontItalic }
    const totalPages = 5 // We'll update this at the end

    // ═══════════════════════════════════════════════════════════
    // PAGE 1 — COVER + ATHLETE PROFILE + KEY METRICS
    // ═══════════════════════════════════════════════════════════
    let { page, y } = newPage(pdfDoc, fonts)

    // Premium header bar
    page.drawRectangle({ x: 0, y: PH - 120, width: PW, height: 120, color: C.dark })
    page.drawText('PROGRESS COMPANION', { x: ML, y: PH - 50, size: 10, font: fontBold, color: rgb(1, 1, 1, 0.5) })
    page.drawText('Premium Health & Fitness Report', { x: ML, y: PH - 80, size: 26, font: fontBold, color: C.white })
    page.drawText(`Prepared for ${(p?.name || user.user_metadata?.name || 'Athlete').toUpperCase()}`, { x: ML, y: PH - 105, size: 10, font: fontNormal, color: rgb(1, 1, 1, 0.7) })
    // Date on the right
    page.drawText(format(new Date(), 'MMMM d, yyyy'), { x: PW - MR - 100, y: PH - 105, size: 10, font: fontNormal, color: rgb(1, 1, 1, 0.5) })
    y = PH - 150

    // Athlete Profile Card
    page.drawRectangle({ x: ML, y: y - 115, width: CW, height: 115, color: C.white, borderColor: C.lightGray, borderWidth: 0.5, borderRadius: 4 })
    y = drawSectionHeader(page, y - 8, fonts, 'Athlete Profile')
    const athleteName = p?.name || user.user_metadata?.name || 'Not specified'
    const athleteEmail = p?.email || user.email || ''
    const memberSince = p?.created_at ? format(new Date(p.created_at), 'MMMM d, yyyy') : 'Unknown'
    y = drawInfoRow(page, y, fonts, 'Name:', athleteName)
    y = drawInfoRow(page, y, fonts, 'Email:', athleteEmail)
    y = drawInfoRow(page, y, fonts, 'Member Since:', memberSince)
    y = drawInfoRow(page, y, fonts, 'Activity Level:', (up?.activity_level || 'Not set').replace(/_/g, ' '))
    y = drawInfoRow(page, y, fonts, 'Fitness Level:', (up?.fitness_level || 'Not set').replace(/_/g, ' '))
    if (up?.primary_goal) y = drawInfoRow(page, y, fonts, 'Primary Goal:', up.primary_goal.replace(/_/g, ' '))
    if (up?.height_cm) y = drawInfoRow(page, y, fonts, 'Height:', `${up.height_cm} cm (${(up.height_cm / 2.54).toFixed(1)} in)`)
    if (up?.target_weight_kg) y = drawInfoRow(page, y, fonts, 'Target Weight:', `${up.target_weight_kg} kg`)
    if (up?.birth_date) {
      const age = Math.floor((Date.now() - new Date(up.birth_date).getTime()) / (365.25 * 86400000))
      y = drawInfoRow(page, y, fonts, 'Age:', `${age} years (${format(new Date(up.birth_date), 'MMM d, yyyy')})`)
    }
    if (up?.biological_sex) y = drawInfoRow(page, y, fonts, 'Sex:', up.biological_sex)
    y -= 15

    // Key Metrics Cards (4 across)
    page.drawText('KEY METRICS AT A GLANCE', { x: ML, y, size: 11, font: fontBold, color: C.dark })
    y -= 10
    const cardY = y
    drawMetricCard(page, ML, cardY, fonts, 'Current Weight', latestWeight ? `${latestWeight.value} ${latestWeight.unit}` : '—')
    drawMetricCard(page, ML + ((CW - 15) / 4) + 5, cardY, fonts, 'Body Fat', latestBF ? `${latestBF.value}%` : '—', C.warning)
    drawMetricCard(page, ML + ((CW - 15) / 2) + 10, cardY, fonts, 'BMI', bmi ? String(bmi) : '—', C.accent)
    drawMetricCard(page, ML + 3 * ((CW - 15) / 4) + 15, cardY, fonts, 'Current Streak', `${currentStreak} days`, C.purple)
    y = cardY - 78

    // Second row of metric cards
    const cardY2 = y
    drawMetricCard(page, ML, cardY2, fonts, 'Workouts (30d)', `${recentWorkouts.length}`, C.primary)
    drawMetricCard(page, ML + ((CW - 15) / 4) + 5, cardY2, fonts, 'Avg Heart Rate', avgHeartRate ? `${avgHeartRate} bpm` : '—', C.danger)
    drawMetricCard(page, ML + ((CW - 15) / 2) + 10, cardY2, fonts, 'Muscle Mass', latestMM ? `${latestMM.value} ${latestMM.unit || 'kg'}` : '—', C.primary)
    drawMetricCard(page, ML + 3 * ((CW - 15) / 4) + 15, cardY2, fonts, 'Workouts (90d)', `${workouts90d}`, C.gray)
    y = cardY2 - 78

    // Weight trend mini-table
    if (weights.length >= 2) {
      y = drawSectionHeader(page, y - 5, fonts, 'Weight History (Recent)')
      const wHeaders = ['Date', 'Weight', 'Change']
      const wRows = weights.slice(0, 8).map((w: any, i: number) => {
        const prev = weights[i + 1]
        const change = prev ? (w.value - prev.value).toFixed(1) : '—'
        return [format(new Date(w.captured_at), 'MMM d'), `${w.value} ${w.unit}`, change !== '—' ? `${change > 0 ? '+' : ''}${change}` : '—']
      })
      y = drawDataTable(page, y, fonts, wHeaders, wRows, [120, 100, 100])
    }

    drawFooter(page, 1, 5, fonts)

    // ═══════════════════════════════════════════════════════════
    // PAGE 2 — TRAINING ANALYSIS
    // ═══════════════════════════════════════════════════════════
    ({ page, y } = newPage(pdfDoc, fonts))

    // Header bar
    page.drawRectangle({ x: 0, y: PH - 45, width: PW, height: 45, color: C.dark })
    page.drawText('TRAINING ANALYSIS', { x: ML, y: PH - 30, size: 18, font: fontBold, color: C.white })
    y = PH - 75

    // Training Overview Cards
    y = drawSectionHeader(page, y, fonts, '30-Day Training Overview')
    const tCardY = y
    drawMetricCard(page, ML, tCardY, fonts, 'Total Workouts', `${recentWorkouts.length}`, C.primary)
    drawMetricCard(page, ML + ((CW - 15) / 4) + 5, tCardY, fonts, 'Total Duration', `${totalWorkoutDuration} min`, C.accent)
    drawMetricCard(page, ML + ((CW - 15) / 2) + 10, tCardY, fonts, 'Calories Burned', `${Math.round(totalWorkoutCalories).toLocaleString()}`, C.warning)
    drawMetricCard(page, ML + 3 * ((CW - 15) / 4) + 15, tCardY, fonts, 'Total Volume', `${totalVolume.toLocaleString()} kg`, C.purple)
    y = tCardY - 78

    // Detailed training stats
    y = drawSectionHeader(page, y, fonts, 'Performance Metrics')
    const trainingStats = [
      ['Avg Workout Duration', `${recentWorkouts.length > 0 ? Math.round(totalWorkoutDuration / recentWorkouts.length) : 0} min`, 'Total Reps', `${totalReps.toLocaleString()}`],
      ['Avg Calories/Workout', `${recentWorkouts.length > 0 ? Math.round(totalWorkoutCalories / recentWorkouts.length) : 0} kcal`, 'Max HR (avg)', avgHeartRate ? `${avgHeartRate} bpm` : '—'],
    ]
    trainingStats.forEach(row => {
      page.drawText(row[0], { x: ML + 12, y, size: 9, font: fontNormal, color: C.gray })
      page.drawText(row[1], { x: ML + 140, y, size: 9, font: fontBold, color: C.text })
      page.drawText(row[2], { x: PW / 2 + 10, y, size: 9, font: fontNormal, color: C.gray })
      page.drawText(row[3], { x: PW / 2 + 130, y, size: 9, font: fontBold, color: C.text })
      y -= 16
    })
    y -= 10

    // Activity Breakdown
    if (Object.keys(activityBreakdown).length > 0) {
      y = drawSectionHeader(page, y, fonts, 'Activity Type Breakdown (30 Days)')
      const sortedActivities = Object.entries(activityBreakdown).sort(([, a], [, b]) => b - a)
      sortedActivities.forEach(([type, count]) => {
        const pct = Math.round((count / recentWorkouts.length) * 100)
        page.drawText(`${type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`, { x: ML + 12, y, size: 9, font: fontNormal, color: C.text })
        page.drawText(`${count} sessions`, { x: ML + 160, y, size: 9, font: fontNormal, color: C.gray })
        drawProgressBar(page, ML + 260, y + 2, 150, 8, pct, C.primary)
        y -= 20
      })
      y -= 5
    }

    // Recent Workouts Table
    if (recentWorkouts.length > 0) {
      y = drawSectionHeader(page, y, fonts, 'Recent Workout Log')
      const wkHeaders = ['Date', 'Activity', 'Duration', 'Calories', 'HR', 'Vol']
      const wkRows = recentWorkouts.slice(0, 12).map((w: any) => [
        format(new Date(w.started_at), 'MMM d'),
        `${(w.activity_type || w.workout_type || '—').replace(/_/g, ' ').substring(0, 12)}`,
        `${w.duration_minutes ?? '—'} min`,
        `${w.calories_burned ?? '—'}`,
        `${w.avg_heart_rate ? w.avg_heart_rate + ' bpm' : '—'}`,
        `${w.total_volume ?? '—'}`,
      ])
      y = drawDataTable(page, y, fonts, wkHeaders, wkRows, [70, 100, 75, 65, 70, 60])
    }

    // 90-day summary
    y = drawSectionHeader(page, y, fonts, '90-Day Summary')
    y = drawInfoRow(page, y, fonts, 'Total Workouts:', `${workouts90d}`)
    y = drawInfoRow(page, y, fonts, 'Total Calories Burned:', `${Math.round(totalCal90d).toLocaleString()} kcal`)
    y = drawInfoRow(page, y, fonts, 'Avg Workouts/Week:', `${(workouts90d / 12.86).toFixed(1)}`)

    drawFooter(page, 2, 5, fonts)

    // ═══════════════════════════════════════════════════════════
    // PAGE 3 — NUTRITION & HYDRATION
    // ═══════════════════════════════════════════════════════════
    ({ page, y } = newPage(pdfDoc, fonts))
    page.drawRectangle({ x: 0, y: PH - 45, width: PW, height: 45, color: C.dark })
    page.drawText('NUTRITION & HYDRATION', { x: ML, y: PH - 30, size: 18, font: fontBold, color: C.white })
    y = PH - 75

    // Daily targets vs averages
    y = drawSectionHeader(page, y, fonts, '7-Day Nutrition Averages vs. Daily Targets')
    const nCardY = y
    drawMetricCard(page, ML, nCardY, fonts, 'Avg Calories', `${avgCalories} kcal`, C.primary)
    drawMetricCard(page, ML + ((CW - 15) / 4) + 5, nCardY, fonts, 'Target Calories', dailyTargets?.calories ? `${dailyTargets.calories} kcal` : '—', C.gray)
    drawMetricCard(page, ML + ((CW - 15) / 2) + 10, nCardY, fonts, 'Avg Protein', `${avgProtein}g`, C.accent)
    drawMetricCard(page, ML + 3 * ((CW - 15) / 4) + 15, nCardY, fonts, 'Target Protein', dailyTargets?.protein ? `${dailyTargets.protein}g` : '—', C.gray)
    y = nCardY - 78

    // Macro detail
    y = drawSectionHeader(page, y, fonts, 'Macronutrient Breakdown (Daily Averages)')
    const macros = [
      ['Calories', `${avgCalories} kcal`, dailyTargets?.calories ? Math.round((avgCalories / dailyTargets.calories) * 100) : 0],
      ['Protein', `${avgProtein}g`, dailyTargets?.protein ? Math.round((avgProtein / dailyTargets.protein) * 100) : 0],
      ['Carbohydrates', `${avgCarbs}g`, dailyTargets?.carbs ? Math.round((avgCarbs / dailyTargets.carbs) * 100) : 0],
      ['Fats', `${avgFat}g`, dailyTargets?.fat ? Math.round((avgFat / dailyTargets.fat) * 100) : 0],
    ]
    macros.forEach(([name, val, pct]) => {
      page.drawText(name, { x: ML + 12, y, size: 9, font: fontNormal, color: C.text, maxWidth: 100 })
      page.drawText(val, { x: ML + 120, y, size: 9, font: fontBold, color: C.dark })
      const color = (pct as number) >= 80 && (pct as number) <= 120 ? C.primary : (pct as number) > 120 ? C.warning : C.danger
      drawProgressBar(page, ML + 200, y + 2, 200, 8, pct as number, color)
      y -= 22
    })
    y -= 5

    // Hydration
    y = drawSectionHeader(page, y, fonts, 'Hydration (7-Day Average)')
    const hydPct = dailyTargets?.water_ml ? Math.round((avgHydration / dailyTargets.water_ml) * 100) : 0
    y = drawInfoRow(page, y, fonts, 'Avg Daily Intake:', `${avgHydration} ml`)
    if (dailyTargets?.water_ml) y = drawInfoRow(page, y, fonts, 'Daily Target:', `${dailyTargets.water_ml} ml`)
    drawProgressBar(page, ML + 12, y + 2, 300, 10, hydPct, hydPct >= 80 ? C.primary : C.warning)
    y -= 25

    // Steps
    y = drawSectionHeader(page, y, fonts, 'Daily Steps (7-Day Average)')
    const stepsPct = dailyTargets?.steps ? Math.round((avgSteps / dailyTargets.steps) * 100) : 0
    y = drawInfoRow(page, y, fonts, 'Avg Daily Steps:', `${avgSteps.toLocaleString()}`)
    if (dailyTargets?.steps) y = drawInfoRow(page, y, fonts, 'Daily Target:', `${dailyTargets.steps.toLocaleString()}`)
    drawProgressBar(page, ML + 12, y + 2, 300, 10, stepsPct, stepsPct >= 80 ? C.primary : C.warning)
    y -= 25

    // Recent Food Log
    if (recentFood.length > 0) {
      y = drawSectionHeader(page, y, fonts, 'Recent Food Log (Last 7 Days)')
      const fHeaders = ['Date', 'Food', 'Cal', 'Protein', 'Carbs', 'Fat']
      const fRows = recentFood.slice(0, 15).map((f: any) => [
        format(new Date(f.logged_at), 'MMM d'),
        `${(f.food_name || '—').substring(0, 20)}`,
        `${f.calories ?? 0}`,
        `${f.protein ?? 0}g`,
        `${f.carbs ?? 0}g`,
        `${f.fat ?? 0}g`,
      ])
      y = drawDataTable(page, y, fonts, fHeaders, fRows, [60, 140, 50, 60, 55, 45])
    }

    // Supplements
    if (supplements.length > 0) {
      y = drawSectionHeader(page, y, fonts, 'Recent Supplement Log')
      const suppNames = [...new Set(supplements.map((s: any) => s.supplement_name))]
      suppNames.forEach(name => {
        const count = supplements.filter((s: any) => s.supplement_name === name).length
        y = drawInfoRow(page, y, fonts, `• ${name}:`, `${count}x this week`)
      })
    }

    drawFooter(page, 3, 5, fonts)

    // ═══════════════════════════════════════════════════════════
    // PAGE 4 — BODY COMPOSITION & SLEEP
    // ═══════════════════════════════════════════════════════════
    ({ page, y } = newPage(pdfDoc, fonts))
    page.drawRectangle({ x: 0, y: PH - 45, width: PW, height: 45, color: C.dark })
    page.drawText('BODY COMPOSITION & RECOVERY', { x: ML, y: PH - 30, size: 18, font: fontBold, color: C.white })
    y = PH - 75

    // Body Composition
    y = drawSectionHeader(page, y, fonts, 'Body Composition Summary')
    const bcCardY = y
    drawMetricCard(page, ML, bcCardY, fonts, 'Weight', latestWeight ? `${latestWeight.value} ${latestWeight.unit}` : '—', C.primary)
    drawMetricCard(page, ML + ((CW - 15) / 4) + 5, bcCardY, fonts, 'Body Fat', latestBF ? `${latestBF.value}%` : '—', C.warning)
    drawMetricCard(page, ML + ((CW - 15) / 2) + 10, bcCardY, fonts, 'Muscle Mass', latestMM ? `${latestMM.value} ${latestMM.unit || 'kg'}` : '—', C.accent)
    drawMetricCard(page, ML + 3 * ((CW - 15) / 4) + 15, bcCardY, fonts, 'BMI', bmi ? String(bmi) : '—', bmi && Number(bmi) > 25 ? C.warning : C.primary)
    y = bcCardY - 78

    // Weight change indicator
    if (weightChange !== null) {
      const isLoss = Number(weightChange) < 0
      y = drawInfoRow(page, y, fonts, 'Weight Change (30d):', `${Number(weightChange) > 0 ? '+' : ''}${weightChange} ${latestWeight?.unit || 'kg'}`, isLoss ? C.primary : C.warning)
    }

    // Body fat trend
    if (bodyFats.length >= 2) {
      const bfChange = bodyFats[0].value - bodyFats[bodyFats.length - 1].value
      y = drawInfoRow(page, y, fonts, 'Body Fat Change:', `${bfChange > 0 ? '+' : ''}${bfChange.toFixed(1)}%`, bfChange <= 0 ? C.primary : C.warning)
    }

    // Body composition history table
    if (weights.length >= 2 || bodyFats.length >= 2) {
      y = drawSectionHeader(page, y, fonts, 'Body Composition History')
      const bcHeaders = ['Date', 'Weight', 'Body Fat', 'Muscle Mass']
      const dates = [...new Set([
        ...weights.map((w: any) => w.captured_at?.split('T')[0]),
        ...bodyFats.map((b: any) => b.captured_at?.split('T')[0]),
        ...muscleMasses.map((m: any) => m.captured_at?.split('T')[0]),
      ])].sort().reverse().slice(0, 8)

      const bcRows = dates.map(date => [
        format(new Date(date), 'MMM d'),
        weights.find((w: any) => w.captured_at?.split('T')[0] === date) ? `${weights.find((w: any) => w.captured_at?.split('T')[0] === date).value}` : '—',
        bodyFats.find((b: any) => b.captured_at?.split('T')[0] === date) ? `${bodyFats.find((b: any) => b.captured_at?.split('T')[0] === date).value}%` : '—',
        muscleMasses.find((m: any) => m.captured_at?.split('T')[0] === date) ? `${muscleMasses.find((m: any) => m.captured_at?.split('T')[0] === date).value}` : '—',
      ])
      y = drawDataTable(page, y, fonts, bcHeaders, bcRows, [80, 100, 80, 80])
    }
    y -= 5

    // Body Measurements
    if (Object.keys(measurementGroups).length > 0) {
      y = drawSectionHeader(page, y, fonts, 'Body Measurements')
      Object.entries(measurementGroups).forEach(([type, readings]) => {
        if (readings.length > 0) {
          const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const latest = readings[0]
          y = drawInfoRow(page, y, fonts, `${label}:`, `${latest.value} ${latest.unit || ''}`)
        }
      })
    }
    y -= 10

    // Sleep Analysis
    y = drawSectionHeader(page, y, fonts, 'Sleep Analysis (7-Day Average)')
    const sCardY = y
    drawMetricCard(page, ML, sCardY, fonts, 'Avg Sleep', avgSleepDuration ? `${Math.floor(avgSleepDuration / 60)}h ${avgSleepDuration % 60}m` : '—', C.purple)
    drawMetricCard(page, ML + ((CW - 15) / 4) + 5, sCardY, fonts, 'Sleep Score', avgSleepScore ? `${avgSleepScore}/100` : '—', avgSleepScore && avgSleepScore >= 70 ? C.primary : C.warning)
    drawMetricCard(page, ML + ((CW - 15) / 2) + 10, sCardY, fonts, 'Nights Logged', `${sleep.length}`, C.gray)
    drawMetricCard(page, ML + 3 * ((CW - 15) / 4) + 15, sCardY, fonts, 'Sleep Quality', avgSleepScore ? (avgSleepScore >= 85 ? 'Excellent' : avgSleepScore >= 70 ? 'Good' : avgSleepScore >= 50 ? 'Fair' : 'Poor') : '—', avgSleepScore && avgSleepScore >= 70 ? C.primary : C.warning)
    y = sCardY - 78

    // Sleep log table
    if (sleep.length > 0) {
      y = drawSectionHeader(page, y, fonts, 'Sleep Log')
      const slHeaders = ['Date', 'Duration', 'Score', 'Deep', 'REM']
      const slRows = sleep.slice(0, 7).map((s: any) => [
        format(new Date(s.date), 'MMM d'),
        s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m` : '—',
        s.sleep_score ? `${s.sleep_score}/100` : '—',
        s.deep_sleep_minutes ? `${Math.round(s.deep_sleep_minutes)}m` : '—',
        s.rem_sleep_minutes ? `${Math.round(s.rem_sleep_minutes)}m` : '—',
      ])
      y = drawDataTable(page, y, fonts, slHeaders, slRows, [80, 90, 70, 70, 70])
    }

    drawFooter(page, 4, 5, fonts)

    // ═══════════════════════════════════════════════════════════
    // PAGE 5 — GOALS, DIETARY INFO & DISCLAIMER
    // ═══════════════════════════════════════════════════════════
    ({ page, y } = newPage(pdfDoc, fonts))
    page.drawRectangle({ x: 0, y: PH - 45, width: PW, height: 45, color: C.dark })
    page.drawText('GOALS & RECOMMENDATIONS', { x: ML, y: PH - 30, size: 18, font: fontBold, color: C.white })
    y = PH - 75

    // Active Goals with progress bars
    if (activeGoals.length > 0) {
      y = drawSectionHeader(page, y, fonts, 'Active Goals')
      activeGoals.slice(0, 8).forEach((goal: any) => {
        if (y < 120) return
        const goalLabel = goal.goal_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Goal'
        const current = goal.current_value ?? 0
        const target = goal.target_value ?? '?'
        const unit = goal.unit || ''
        const progress = goal.current_value && goal.target_value ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100) : 0

        page.drawText(`${goalLabel}`, { x: ML + 12, y, size: 10, font: fontBold, color: C.text })
        page.drawText(`${current} / ${target} ${unit}`, { x: ML + 12 + 200, y, size: 9, font: fontNormal, color: C.gray })
        y -= 18
        drawProgressBar(page, ML + 12, y + 2, CW - 80, 10, progress, progress >= 75 ? C.primary : progress >= 50 ? C.accent : C.warning)
        y -= 25
      })
      y -= 5
    } else {
      y = drawSectionHeader(page, y, fonts, 'Active Goals')
      y = drawInfoRow(page, y, fonts, 'No active goals set.', 'Go to your profile to set goals.')
      y -= 5
    }

    // Dietary Information
    if (up?.dietary_restrictions || up?.allergies) {
      y = drawSectionHeader(page, y, fonts, 'Dietary Information')
      if (up.dietary_restrictions) {
        const restrictions = Array.isArray(up.dietary_restrictions) ? up.dietary_restrictions : (typeof up.dietary_restrictions === 'object' ? Object.values(up.dietary_restrictions) : [up.dietary_restrictions])
        restrictions.forEach((r: any) => {
          y = drawInfoRow(page, y, fonts, '• Restriction:', String(r))
        })
      }
      if (up.allergies) {
        const allergies = Array.isArray(up.allergies) ? up.allergies : (typeof up.allergies === 'object' ? Object.values(up.allergies) : [up.allergies])
        allergies.forEach((a: any) => {
          y = drawInfoRow(page, y, fonts, '• Allergy:', String(a))
        })
      }
      y -= 5
    }

    // AI Insights
    y = drawSectionHeader(page, y, fonts, 'Report Summary')
    const insights: string[] = []
    if (avgCalories > 0 && dailyTargets?.calories) {
      const calDiff = avgCalories - dailyTargets.calories
      if (Math.abs(calDiff) > 200) {
        insights.push(`${calDiff > 0 ? 'Exceeding' : 'Below'} calorie target by ${Math.abs(calDiff)} kcal/day avg`)
      } else {
        insights.push('Calorie intake is well-aligned with daily target')
      }
    }
    if (avgProtein > 0 && dailyTargets?.protein) {
      const proPct = Math.round((avgProtein / dailyTargets.protein) * 100)
      insights.push(`Protein target achievement: ${proPct}% of daily goal`)
    }
    if (currentStreak >= 7) {
      insights.push(`Strong consistency: ${currentStreak}-day workout streak`)
    }
    if (avgSleepScore && avgSleepScore < 60) {
      insights.push('Sleep quality needs improvement — aim for 7-9 hours')
    }
    if (avgHydration > 0 && dailyTargets?.water_ml && avgHydration < dailyTargets.water_ml * 0.8) {
      insights.push('Hydration is below target — increase water intake')
    }
    if (insights.length === 0) {
      insights.push('Keep tracking consistently for personalized insights')
    }

    insights.forEach(insight => {
      if (y < 100) return
      page.drawText('•', { x: ML + 12, y, size: 9, font: fontBold, color: C.primary })
      page.drawText(insight, { x: ML + 24, y, size: 9, font: fontNormal, color: C.text, maxWidth: CW - 50 })
      y -= 18
    })
    y -= 15

    // Medical Disclaimer
    page.drawRectangle({ x: ML, y: y - 80, width: CW, height: 80, color: C.veryLight, borderColor: C.lightGray, borderWidth: 0.5, borderRadius: 4 })
    y -= 10
    page.drawText('MEDICAL DISCLAIMER', { x: ML + 12, y, size: 9, font: fontBold, color: C.danger })
    y -= 14
    page.drawText(
      'This report is generated by Progress Companion for informational purposes only. It does not constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional before making changes to your diet, exercise routine, or health regimen. Data accuracy depends on user input and device measurements.',
      { x: ML + 12, y, size: 7, font: fontItalic, color: C.gray, maxWidth: CW - 30 }
    )
    y -= 45
    page.drawText('Data sourced from self-reported entries, connected devices, and AI-estimated metrics.', { x: ML + 12, y, size: 7, font: fontItalic, color: C.gray, maxWidth: CW - 30 })

    // Confidential footer
    y -= 30
    page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.5, color: C.lightGray })
    y -= 15
    page.drawText('CONFIDENTIAL', { x: ML, y, size: 8, font: fontBold, color: C.gray })
    y -= 12
    page.drawText(`This report was prepared exclusively for ${athleteName}. Unauthorized distribution is prohibited.`, { x: ML, y, size: 7, font: fontNormal, color: C.gray, maxWidth: CW - 24 })
    y -= 12
    page.drawText(`Report ID: PC-${user.id.substring(0, 8)}-${format(new Date(), 'yyyyMMdd-HHmm')}`, { x: ML, y, size: 7, font: fontNormal, color: C.gray })

    drawFooter(page, 5, 5, fonts)

    // ═══════════════════════════════════════════════════════════
    // Save and return
    // ═══════════════════════════════════════════════════════════
    const pdfBytes = await pdfDoc.save()
    const pdfBuffer = Buffer.from(pdfBytes)
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="progress-report-${format(new Date(), 'yyyy-MM-dd')}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    console.error('[export-pdf]', err)
    return NextResponse.json({ error: 'Failed to generate PDF', details: msg }, { status: 500 })
  }
}
