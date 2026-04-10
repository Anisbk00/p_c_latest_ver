/**
 * Supplement Log API — Supabase-native
 * GET  /api/supplement-log
 * POST /api/supplement-log
 * PUT  /api/supplement-log
 * DELETE /api/supplement-log
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { 
  getSupplementLogs, 
  addSupplementLog, 
  updateSupplementLog, 
  deleteSupplementLog 
} from '@/lib/supabase/data-service'
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') ?? undefined
    const startDate = searchParams.get('startDate') ?? undefined
    const endDate = searchParams.get('endDate') ?? undefined

    const entries = await getSupplementLogs(user.id, date, startDate, endDate)
    return NextResponse.json({ entries })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch supplement log', details: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser()
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { SupplementLogCreateSchema } = await import('@/lib/validation')
    const parseResult = SupplementLogCreateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten()
      }, { status: 400 })
    }
    body = parseResult.data
    // Sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    // Map body to expected Insert type
    const entryData = {
      supplement_id: body.supplementId || null,
      supplement_name: body.supplementName || body.name || null,
      quantity: body.quantity ?? body.servingSize ?? 1,
      unit: body.unit ?? body.servingUnit ?? 'serving',
      protein: body.protein ?? 0,
      calories: body.calories ?? 0,
      carbs: body.carbs ?? 0,
      fat: body.fat ?? 0,
      logged_at: body.loggedAt || new Date().toISOString(),
      notes: body.notes ?? null,
      time_of_day: body.timeOfDay ?? null
    }
    const result = await addSupplementLog(user.id, entryData);
    if (!result) throw new Error('Failed to create supplement log')
    return NextResponse.json({ entry: result }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to log supplement', details: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser()
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    // Map body to expected Update type — only include fields that are provided
    const mappedUpdates: Record<string, unknown> = {}
    if (updateData.supplementId !== undefined) mappedUpdates.supplement_id = updateData.supplementId
    if (updateData.name !== undefined || updateData.supplementName !== undefined) mappedUpdates.supplement_name = updateData.name ?? updateData.supplementName
    if (updateData.quantity !== undefined) mappedUpdates.quantity = updateData.quantity
    if (updateData.unit !== undefined) mappedUpdates.unit = updateData.unit
    if (updateData.calories !== undefined) mappedUpdates.calories = updateData.calories
    if (updateData.protein !== undefined) mappedUpdates.protein = updateData.protein
    if (updateData.carbs !== undefined) mappedUpdates.carbs = updateData.carbs
    if (updateData.fat !== undefined) mappedUpdates.fat = updateData.fat
    if (updateData.loggedAt !== undefined) mappedUpdates.logged_at = updateData.loggedAt
    if (updateData.notes !== undefined) mappedUpdates.notes = updateData.notes
    if (updateData.timeOfDay !== undefined) mappedUpdates.time_of_day = updateData.timeOfDay

    const entry = await updateSupplementLog(user.id, id, mappedUpdates)
    if (!entry) throw new Error('Failed to update supplement log')

    return NextResponse.json({ entry })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to update supplement', details: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const success = await deleteSupplementLog(user.id, id)
    if (!success) throw new Error('Failed to delete supplement log')

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to delete supplement', details: msg }, { status: 500 })
  }
}
