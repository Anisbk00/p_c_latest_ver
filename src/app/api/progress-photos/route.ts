/**
 * Progress Photos API — Supabase-native with graceful fallback
 * GET  /api/progress-photos
 * POST /api/progress-photos
 * DELETE /api/progress-photos?id=<id>
 *
 * Uses user_files table with category = 'progress_photo'
 * Storage bucket: 'progress-photos'
 *
 * PRODUCTION SCHEMA (user_files):
 *   id, user_id, bucket, path, filename, mime_type, size_bytes,
 *   category, entity_type, entity_id, metadata (JSONB), created_at, updated_at
 *
 * Weight/bodyFat/notes/muscleMass are stored in metadata JSONB column.
 *
 * Falls back to base64 storage when Supabase storage is not configured
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { XPService } from '@/lib/xp-service'

const BUCKET = 'progress-photos'
const CATEGORY = 'progress_photo'

// Check if Supabase storage is configured
function isStorageConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function getPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('data:')) return path; // base64 data URL
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return path;
  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${cleanBase}/storage/v1/object/public/${BUCKET}/${cleanPath}`;
}

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    let data = await fetchUserFiles(supabase, user.id)

    // Admin fallback if RLS blocks SELECT (photos exist but user client can't see them)
    if ((!data || data.length === 0) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (serviceRoleKey && supabaseUrl) {
          const { createClient } = await import('@supabase/supabase-js');
          const adminClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const adminData = await fetchUserFiles(adminClient, user.id);
          if (adminData && adminData.length > 0) {
            data = adminData;
            console.log('[progress-photos] RLS fallback: fetched via admin client');
          }
        }
      } catch (adminErr) {
        console.warn('[progress-photos] Admin fallback failed:', adminErr);
      }
    }

    // Generate image URLs — use signed URLs for private buckets, public URL for data: prefix
    const photos = await Promise.all((data ?? []).map(async (p) => {
      const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
      return {
        id: p.id,
        capturedAt: p.created_at,
        imageUrl: await resolveImageUrl(supabase, p.path),
        thumbnailUrl: null,
        filename: p.filename,
        mimeType: p.mime_type,
        sizeBytes: p.size_bytes,
        weight: meta.weight ?? null,
        notes: meta.notes ?? null,
        bodyFat: meta.bodyFat ?? null,
        muscleMass: meta.muscleMass ?? null,
        analysisSource: meta.analysisSource ?? null,
        analysisConfidence: meta.analysisConfidence ?? null,
        changeZones: meta.changeZones ?? null,
      };
    }));

    return NextResponse.json({ photos })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch progress photos', details: msg }, { status: 500 })
  }
}

/** Fetch user_files with error handling */
async function fetchUserFiles(client: any, userId: string) {
  const { data, error } = await (client
    .from('user_files') as any)
    .select('*')
    .eq('user_id', userId)
    .eq('category', CATEGORY)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    const errMsg = error.message || '';
    if (errMsg.includes('does not exist')) {
      console.warn('[progress-photos] user_files table does not exist — returning empty list')
      return []
    }
    throw error
  }
  return data
}

/**
 * Resolve image URL — tries signed URL first (works for private buckets),
 * falls back to public URL. Handles data: URLs directly.
 */
async function resolveImageUrl(client: any, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('data:') || path.startsWith('http')) return path;

  // Try signed URL (works for both public and private buckets)
  if (isStorageConfigured() && !path.startsWith('data:')) {
    try {
      const { data: signedData } = await client.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600); // 1 hour expiry
      if (signedData?.signedUrl) return signedData.signedUrl;
    } catch {
      // Signed URL failed, fall through to public URL
    }
  }

  return getPublicUrl(path);
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const contentType = request.headers.get('content-type') || '';

    let filePath: string | null = null;
    let filename = 'photo.jpg';
    let mimeType = 'image/jpeg';
    let sizeBytes = 0;
    // Track metadata for response only (NOT stored in DB — no metadata column)
    let responseData: Record<string, any> = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      filename = file.name;
      mimeType = file.type || 'image/jpeg';
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      sizeBytes = buffer.byteLength;

      // Upload to Supabase storage or fall back to base64
      if (isStorageConfigured()) {
        const storagePath = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

        try {
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, buffer, {
              contentType: mimeType,
              upsert: false
            });

          if (uploadError) {
            console.warn('[progress-photos] Storage upload failed, using base64 fallback:', uploadError.message)
            filePath = `data:${mimeType};base64,${buffer.toString('base64')}`;
          } else {
            filePath = uploadData.path;
          }
        } catch (storageErr) {
          console.warn('[progress-photos] Storage upload failed, using base64 fallback:', storageErr)
          filePath = `data:${mimeType};base64,${buffer.toString('base64')}`;
        }
      } else {
        console.log('[progress-photos] No Supabase storage configured, using base64 fallback')
        filePath = `data:${mimeType};base64,${buffer.toString('base64')}`;
      }

      // Extract response-only metadata (NOT stored in DB)
      const weight = formData.get('weight');
      const notes = formData.get('notes');
      const bodyFat = formData.get('bodyFat');
      const muscleMass = formData.get('muscleMass');

      if (weight) responseData.weight = parseFloat(weight as string);
      if (notes) responseData.notes = notes as string;
      if (bodyFat) {
        try { responseData.bodyFat = JSON.parse(bodyFat as string); } catch { responseData.bodyFat = bodyFat; }
      }
      if (muscleMass) responseData.muscleMass = parseFloat(muscleMass as string);
    } else {
      // JSON body
      const body = await request.json()
      filePath = body.path ?? body.file_url ?? body.imageUrl;
      filename = body.filename ?? 'photo.jpg';
      mimeType = body.mimeType ?? 'image/jpeg';
      sizeBytes = body.sizeBytes ?? 0;
      responseData = body.metadata || {};
    }

    if (!filePath) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // ─── Insert into user_files table ───────────────────────────
    let insertResult: { data: any; error: any };

    // NOTE: metadata column may not exist in production DB.
    // Build payload without metadata first; try with metadata only if column exists.
    const insertPayloadBase: Record<string, any> = {
      user_id: user.id,
      bucket: isStorageConfigured() ? BUCKET : 'local',
      path: filePath,
      filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      category: CATEGORY,
      entity_type: 'progress_photo',
    };

    // Try insert with metadata — fall back to without if column missing
    try {
      const fileMetadata: Record<string, any> = {};
      if (responseData.weight) fileMetadata.weight = responseData.weight;
      if (responseData.notes) fileMetadata.notes = responseData.notes;
      if (responseData.bodyFat) fileMetadata.bodyFat = responseData.bodyFat;
      if (responseData.muscleMass) fileMetadata.muscleMass = responseData.muscleMass;

      const withMeta = { ...insertPayloadBase, metadata: fileMetadata };
      insertResult = await (supabase.from('user_files') as any).insert(withMeta).select().single();

      // If metadata column doesn't exist, retry without it
      if (insertResult.error?.message?.includes("metadata")) {
        console.log('[progress-photos] metadata column missing, inserting without it');
        insertResult = await (supabase.from('user_files') as any).insert(insertPayloadBase).select().single();
      }
    } catch (insertErr) {
      // Column error on catch path — retry without metadata
      try {
        insertResult = await (supabase.from('user_files') as any).insert(insertPayloadBase).select().single();
      } catch (retryErr) {
        insertResult = { data: null, error: retryErr instanceof Error ? retryErr : new Error(String(retryErr)) };
      }
    }

    // If insert failed, try admin client fallback
    if (insertResult.error) {
      const errMsg = insertResult.error.message || String(insertResult.error);

      if (errMsg.includes('row-level security') || errMsg.includes('policy') || errMsg.includes('permission')) {
        console.warn('[progress-photos] RLS denied insert, trying admin client fallback...')
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (serviceRoleKey && supabaseUrl) {
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const adminClient = createClient(supabaseUrl, serviceRoleKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            });
            const adminResult = await (adminClient.from('user_files') as any).insert(insertPayloadBase).select().single();
            if (!adminResult.error) {
              insertResult = adminResult;
            } else {
              throw adminResult.error;
            }
          } catch (adminErr) {
            console.error('[progress-photos] Admin client RLS fallback failed:', adminErr);
            throw adminErr;
          }
        } else {
          throw insertResult.error;
        }
      } else if (errMsg.includes('does not exist')) {
        console.error('[progress-photos] user_files table missing. Run migration SQL in Supabase SQL Editor.');
        return NextResponse.json({
          error: 'Database setup required',
          details: 'The user_files table needs to be created. Run the migration SQL in your Supabase SQL Editor.',
          _needsMigration: true,
        }, { status: 503 });
      } else {
        throw insertResult.error;
      }
    }

    const data = insertResult.data;
    if (!data) {
      throw new Error('Failed to insert progress photo record');
    }

    // Award XP for progress photo using production-ready service
    const xpService = new XPService(supabase);
    xpService.awardXP({
      userId: user.id,
      action: 'progress_photo',
      referenceId: data.id,
      description: 'Uploaded progress photo',
      metadata: {
        file_id: data.id,
        filename: data.filename,
        size_bytes: data.size_bytes,
      },
    }).then(result => {
      if (result.success) {
        console.log(`[Progress Photos API] ✓ Awarded ${result.awarded} XP`);
      } else {
        console.error(`[Progress Photos API] ✗ Failed to award XP: ${result.error}`);
      }
    }).catch(err => {
      console.error('[Progress Photos API] XP service error:', err);
    });
    
    // Check for first photo achievement
    xpService.checkAchievements(user.id).catch(() => {});

    return NextResponse.json({
      photo: {
        id: data.id,
        capturedAt: data.created_at,
        imageUrl: getPublicUrl(data.path),
        filename: data.filename,
        weight: responseData.weight || null,
        notes: responseData.notes || null,
        bodyFat: responseData.bodyFat || null,
        muscleMass: responseData.muscleMass || null,
      }
    }, { status: 201 })
  } catch (err) {
    // Robust error serialization
    let msg: string;
    if (err instanceof Error) {
      msg = err.message;
    } else if (typeof err === 'object' && err !== null) {
      msg = (err as any).message || (err as any).msg || JSON.stringify(err);
    } else {
      msg = String(err);
    }
    console.error('[progress-photos] POST error:', msg, err instanceof Error ? err.stack : '')
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to save progress photo', details: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Photo ID is required' }, { status: 400 })
    }

    const { data: record, error: fetchError } = await (supabase
      .from('user_files') as any)
      .select('path, bucket')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError && fetchError.message?.includes('does not exist')) {
      return NextResponse.json({ success: true })
    }

    if (record?.path && record?.bucket && !record.path.startsWith('data:')) {
      try {
        await supabase.storage.from(record.bucket).remove([record.path])
      } catch {
        // Ignore storage deletion errors
      }
    }

    const { error } = await (supabase
      .from('user_files') as any)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to delete photo', details: msg }, { status: 500 })
  }
}
