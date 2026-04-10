/**
 * User Avatar API — Supabase-native
 * POST /api/user/avatar — upload new avatar
 * PATCH /api/user/avatar — update avatar URL
 * 
 * P1 FIX: Added MIME type validation and file size limits
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { createAdminClient } from '@/lib/supabase/server'

// P1 FIX: Allowed MIME types for avatar uploads
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB limit

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser()
    const body = await request.json().catch(() => ({}))
    
    const { image } = body
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 })
    }

    // P1 FIX: Extract and validate MIME type from data URI
    let mimeType = 'image/png' // default
    let base64Data = image
    
    if (image.startsWith('data:')) {
      const mimeMatch = image.match(/^data:(image\/[^;]+);base64,/)
      if (!mimeMatch) {
        return NextResponse.json({ 
          error: 'Invalid image format', 
          message: 'Image must be a valid data URI with base64 encoding' 
        }, { status: 400 })
      }
      mimeType = mimeMatch[1]
      base64Data = image.replace(/^data:image\/[^;]+;base64,/, '')
    }
    
    // P1 FIX: Validate MIME type against allowlist
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ 
        error: 'Invalid image type', 
        message: `Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        received: mimeType
      }, { status: 400 })
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64')
    
    // P2 FIX: Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: 'File too large', 
        message: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        received: `${(buffer.length / 1024 / 1024).toFixed(2)}MB`
      }, { status: 400 })
    }
    
    // Determine file extension from MIME type
    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }
    const ext = extMap[mimeType] || 'png'
    
    // Use folder structure for RLS: {user_id}/filename.ext
    const filename = `${user.id}/${Date.now()}.${ext}`
    
    // Use admin client for storage upload (bypasses RLS, we've already verified user)
    const adminClient = createAdminClient()
    
    const { error: uploadError } = await adminClient.storage
      .from('avatars')
      .upload(filename, buffer, {
        contentType: mimeType,
        upsert: true
      })

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    const { data: { publicUrl } } = adminClient.storage
      .from('avatars')
      .getPublicUrl(filename)

    // Update profile with avatar URL
    const { data, error } = await adminClient
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      user: { avatarUrl: data.avatar_url } 
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('Avatar upload error:', err)
    return NextResponse.json({ error: 'Failed to upload avatar', details: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser()
    const body = await request.json()

    const avatarUrl = body.avatarUrl ?? body.avatar_url ?? body.url
    if (!avatarUrl) {
      return NextResponse.json({ error: 'Missing avatarUrl' }, { status: 400 })
    }

    // Validate avatar URL scheme — only allow HTTP(S)
    if (typeof avatarUrl !== 'string') {
      return NextResponse.json({ error: 'Invalid avatarUrl: must be a string' }, { status: 400 })
    }
    const allowedUrlPattern = /^https?:\/\//;
    if (!allowedUrlPattern.test(avatarUrl)) {
      return NextResponse.json({ error: 'Invalid avatar URL. Only HTTP(S) URLs are allowed.' }, { status: 400 })
    }
    if (avatarUrl.length > 512) {
      return NextResponse.json({ error: 'Avatar URL too long. Maximum 512 characters.' }, { status: 400 })
    }

    // Use admin client to update profile
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, avatarUrl: data.avatar_url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to update avatar', details: msg }, { status: 500 })
  }
}
