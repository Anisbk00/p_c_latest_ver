/**
 * Avatar Upload API
 * 
 * Handles avatar photo upload during setup.
 * Uses Supabase private bucket with signed URLs.
 * 
 * POST /api/setup/avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: NextRequest) {
  try {
    // Authenticate with Supabase
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 10MB' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}_${random}.${ext}`;
    const filePath = `${user.id}/${filename}`;

    // Upload to Supabase storage (progress-photos bucket for avatars too)
    const adminClient = createAdminClient();
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from('progress-photos')
      .upload(filePath, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload avatar' },
        { status: 500 }
      );
    }

    // Generate signed URL (valid for 7 days)
    const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
      .from('progress-photos')
      .createSignedUrl(uploadData.path, 60 * 60 * 24 * 7);

    if (signedUrlError) {
      console.error('Signed URL error:', signedUrlError);
      return NextResponse.json(
        { error: 'Failed to generate avatar URL' },
        { status: 500 }
      );
    }

    // Update user's avatar URL in profile
    await supabase
      .from('profiles')
      .update({ avatar_url: uploadData.path })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      avatar: {
        fileId: uploadData.path,
        signedUrl: signedUrlData.signedUrl,
        filename,
      },
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload avatar' },
      { status: 500 }
    );
  }
}
