/**
 * Routes API — Supabase-native
 * GET  /api/routes
 * POST /api/routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ routes: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch routes', details: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const body = await request.json()

    const { data, error } = await supabase.from('routes').insert({
      user_id: user.id,
      name: body.name ?? 'Route',
      distance_meters: body.distanceMeters ?? body.distance_meters ?? null,
      elevation_gain: body.elevationGain ?? body.elevation_gain ?? null,
      coordinates: body.coordinates ?? null,
      notes: body.notes ?? null,
    }).select().single()

    if (error) throw error

    return NextResponse.json({ route: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to save route', details: msg }, { status: 500 })
  }
}
