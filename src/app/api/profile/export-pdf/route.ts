/**
 * Profile Export PDF — Supabase-native
 * GET /api/profile/export-pdf
 *
 * Fetches all user data in parallel from Supabase, then builds and streams a PDF.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createServerClient } from '@/lib/supabase/server'
import { format } from 'date-fns'

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch all relevant data in parallel
    const [
      { data: profile },
      { data: userProfile },
      { data: goals },
      { data: weightsRaw },
      { data: bodyFatRaw },
      { data: recentWorkoutsRaw },
      { data: recentFoodRaw },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').limit(5),
      supabase.from('body_metrics').select('value, unit').eq('user_id', user.id).eq('metric_type', 'weight').order('captured_at', { ascending: false }).limit(1),
      supabase.from('body_metrics').select('value').eq('user_id', user.id).eq('metric_type', 'body_fat').order('captured_at', { ascending: false }).limit(1),
      supabase.from('workouts').select('duration_minutes, calories_burned, started_at').eq('user_id', user.id).gte('started_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      supabase.from('food_logs').select('calories, protein').eq('user_id', user.id).gte('logged_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentWorkouts = (recentWorkoutsRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentFood = (recentFoodRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latestWeight = (weightsRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latestBodyFat = (bodyFatRaw ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeGoals = (goals ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const up = userProfile as any

    // Calculate derived stats
    const totalWorkoutDuration = recentWorkouts.reduce((s, w) => s + (w.duration_minutes ?? 0), 0)
    const totalWorkoutCalories = recentWorkouts.reduce((s, w) => s + (w.calories_burned ?? 0), 0)
    const avgCalories = recentFood.length ? Math.round(recentFood.reduce((s, f) => s + (f.calories ?? 0), 0) / recentFood.length) : 0
    const avgProtein = recentFood.length ? Math.round(recentFood.reduce((s, f) => s + (f.protein ?? 0), 0) / recentFood.length) : 0

    // Calculate streak
    let currentStreak = 0
    const today = new Date(); today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const has = recentWorkouts.some((w) => { const wd = new Date(w.started_at); wd.setHours(0, 0, 0, 0); return wd.getTime() === d.getTime() })
      if (has) currentStreak++
      else if (i > 0) break
    }

    // Build PDF
    const pdfDoc = await PDFDocument.create()
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const page = pdfDoc.addPage([595.28, 841.89])
    const { width, height } = page.getSize()
    const primaryColor = rgb(0.063, 0.725, 0.506)
    const darkColor = rgb(0.1, 0.1, 0.1)
    const grayColor = rgb(0.4, 0.4, 0.4)
    const lightGray = rgb(0.9, 0.9, 0.9)

    let y = height - 60
    page.drawText('COACH SNAPSHOT', { x: 50, y, size: 28, font: helveticaBold, color: darkColor })
    y -= 25
    page.drawText(`Generated on ${format(new Date(), 'MMMM d, yyyy')}`, { x: 50, y, size: 10, font: helvetica, color: grayColor })
    y -= 40

    // Profile section
    page.drawRectangle({ x: 50, y: y - 10, width: width - 100, height: 80, color: lightGray })
    y -= 5
    page.drawText('ATHLETE PROFILE', { x: 60, y, size: 12, font: helveticaBold, color: primaryColor })
    y -= 20
    page.drawText(`Name: ${(profile as any)?.name ?? user.user_metadata?.name ?? 'Not specified'}`, { x: 60, y, size: 11, font: helvetica, color: darkColor })
    y -= 18
    page.drawText(`Email: ${(profile as any)?.email ?? user.email ?? ''}`, { x: 60, y, size: 11, font: helvetica, color: darkColor })
    y -= 18
    page.drawText(`Member since: ${format(new Date((profile as any)?.created_at ?? new Date()), 'MMMM d, yyyy')}`, { x: 60, y, size: 11, font: helvetica, color: darkColor })
    y -= 40

    // Key metrics
    const stats = [
      { label: 'Current Weight', value: latestWeight[0] ? `${latestWeight[0].value} ${latestWeight[0].unit}` : 'Not recorded' },
      { label: 'Body Fat', value: latestBodyFat[0] ? `${latestBodyFat[0].value}%` : 'Not recorded' },
      { label: 'Current Streak', value: `${currentStreak} days` },
      { label: 'Workouts (30d)', value: `${recentWorkouts.length}` },
    ]
    page.drawText('KEY METRICS', { x: 50, y, size: 12, font: helveticaBold, color: primaryColor })
    y -= 20
    const boxWidth = 120, boxHeight = 50
    stats.forEach((stat, i) => {
      const x = 50 + i * (boxWidth + 15)
      page.drawRectangle({ x, y: y - boxHeight, width: boxWidth, height: boxHeight, color: lightGray, borderColor: primaryColor, borderWidth: 1 })
      page.drawText(stat.label, { x: x + 8, y: y - 18, size: 9, font: helvetica, color: grayColor })
      page.drawText(stat.value, { x: x + 8, y: y - 35, size: 12, font: helveticaBold, color: darkColor })
    })
    y -= boxHeight + 30

    // Training summary
    page.drawText('TRAINING SUMMARY (Last 30 Days)', { x: 50, y, size: 12, font: helveticaBold, color: primaryColor })
    y -= 20
    ;[
      [`Total Workouts: ${recentWorkouts.length}`, `Total Duration: ${totalWorkoutDuration} min`],
      [`Calories Burned: ${Math.round(totalWorkoutCalories)}`, `Avg Duration: ${recentWorkouts.length > 0 ? Math.round(totalWorkoutDuration / recentWorkouts.length) : 0} min`],
    ].forEach(row => {
      page.drawText(row[0], { x: 60, y, size: 10, font: helvetica, color: darkColor })
      page.drawText(row[1], { x: 300, y, size: 10, font: helvetica, color: darkColor })
      y -= 18
    })
    y -= 20

    // Nutrition
    page.drawText('NUTRITION SUMMARY (Last 7 Days)', { x: 50, y, size: 12, font: helveticaBold, color: primaryColor })
    y -= 20
    page.drawText(`Avg Daily Calories: ${avgCalories}`, { x: 60, y, size: 10, font: helvetica, color: darkColor })
    page.drawText(`Avg Daily Protein: ${avgProtein}g`, { x: 300, y, size: 10, font: helvetica, color: darkColor })
    y -= 30

    // Goals
    if (activeGoals.length) {
      page.drawText('ACTIVE GOALS', { x: 50, y, size: 12, font: helveticaBold, color: primaryColor })
      y -= 20
      activeGoals.slice(0, 3).forEach(goal => {
        const progress = goal.current_value && goal.target_value ? Math.round((goal.current_value / goal.target_value) * 100) : 0
        page.drawText(`• ${goal.goal_type}: ${goal.current_value ?? 0} / ${goal.target_value ?? '?'} ${goal.unit ?? ''} (${progress}%)`, { x: 60, y, size: 10, font: helvetica, color: darkColor })
        y -= 16
      })
      y -= 20
    }

    // Profile details
    if (up) {
      page.drawText('PROFILE DETAILS', { x: 50, y, size: 12, font: helveticaBold, color: primaryColor })
      y -= 20
      const details = [
        up.height_cm ? `Height: ${up.height_cm} cm` : null,
        up.activity_level ? `Activity Level: ${up.activity_level}` : null,
        up.primary_goal ? `Primary Goal: ${up.primary_goal}` : null,
        up.target_weight_kg ? `Target Weight: ${up.target_weight_kg} kg` : null,
      ].filter(Boolean) as string[]
      details.forEach(d => {
        page.drawText(`• ${d}`, { x: 60, y, size: 10, font: helvetica, color: darkColor })
        y -= 16
      })
    }

    // Footer
    page.drawLine({ start: { x: 50, y: 70 }, end: { x: width - 50, y: 70 }, thickness: 1, color: lightGray })
    page.drawText('Generated by Progress Companion', { x: 50, y: 50, size: 8, font: helvetica, color: grayColor })

    const pdfBytes = await pdfDoc.save()
    const pdfBuffer = Buffer.from(pdfBytes)
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="coach-snapshot-${format(new Date(), 'yyyy-MM-dd')}.pdf"`,
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
