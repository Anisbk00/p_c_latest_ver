/**
 * Progress Photo by ID — Supabase-native
 * GET    /api/progress-photos/[id]
 * DELETE /api/progress-photos/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, user } = await getSupabaseUser()

    const { data, error } = await supabase.from('user_files').select('*').eq('id', id).eq('user_id', user.id).single()
    if (error || !data) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

    return NextResponse.json({ photo: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch photo', details: msg }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, user } = await getSupabaseUser()

    const { error } = await supabase.from('user_files').delete().eq('id', id).eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to delete photo', details: msg }, { status: 500 })
  }
}
