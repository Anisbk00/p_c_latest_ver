/**
 * Supabase Storage Utilities
 * 
 * Secure file upload and signed URL generation.
 * All operations are user-scoped with proper access control.
 * 
 * @module lib/supabase/storage
 */

import { getClient } from './client'
import { createClient } from './server'
import type { Database } from './database.types'

type BucketName = 'progress-photos' | 'food-images' | 'workout-media'

interface UploadResult {
  path: string
  fullPath: string
  publicUrl?: string
  error: string | null
}

interface SignedUrlResult {
  signedUrl: string
  expiresAt: Date
  error: string | null
}

/**
 * Upload a file to a private bucket
 * Files are stored in user-specific folders: userId/filename
 */
export async function uploadFile(
  bucket: BucketName,
  file: File | Blob,
  filename: string,
  options?: {
    upsert?: boolean
    cacheControl?: string
  }
): Promise<UploadResult> {
  const supabase = getClient()
  
  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return { path: '', fullPath: '', error: 'Not authenticated' }
  }
  
  // Create user-scoped path
  const filePath = `${user.id}/${filename}`
  
  // Upload file
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      upsert: options?.upsert ?? false,
      cacheControl: options?.cacheControl ?? '3600',
      contentType: file.type,
    })
  
  if (error) {
    return { path: '', fullPath: '', error: error.message }
  }
  
  // Record file in database
  await supabase.from('user_files').insert({
    user_id: user.id,
    bucket,
    path: data.path,
    filename,
    mime_type: file.type,
    size_bytes: file.size,
    category: getCategoryFromBucket(bucket),
  })
  
  return {
    path: data.path,
    fullPath: `${bucket}/${data.path}`,
    error: null,
  }
}

/**
 * Generate a signed URL for private file access
 * URLs expire after specified duration
 */
export async function getSignedUrl(
  bucket: BucketName,
  path: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<SignedUrlResult> {
  const supabase = getClient()
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
  
  if (error) {
    return {
      signedUrl: '',
      expiresAt: new Date(),
      error: error.message,
    }
  }
  
  return {
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    error: null,
  }
}

/**
 * Generate multiple signed URLs at once
 */
export async function getSignedUrls(
  bucket: BucketName,
  paths: string[],
  expiresIn: number = 3600
): Promise<{ urls: Map<string, string>; errors: string[] }> {
  const supabase = getClient()
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn)
  
  const urls = new Map<string, string>()
  const errors: string[] = []
  
  if (error) {
    errors.push(error.message)
    return { urls, errors }
  }
  
  data.forEach((item, index) => {
    if (item.error) {
      errors.push(`${paths[index]}: ${item.error}`)
    } else {
      urls.set(paths[index], item.signedUrl)
    }
  })
  
  return { urls, errors }
}

/**
 * Delete a file from storage
 * Also removes the database record
 */
export async function deleteFile(
  bucket: BucketName,
  path: string
): Promise<{ error: string | null }> {
  const supabase = getClient()
  
  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove([path])
  
  if (storageError) {
    return { error: storageError.message }
  }
  
  // Delete database record
  const { error: dbError } = await supabase
    .from('user_files')
    .delete()
    .eq('bucket', bucket)
    .eq('path', path)
  
  if (dbError) {
    return { error: dbError.message }
  }
  
  return { error: null }
}

/**
 * Delete multiple files at once
 */
export async function deleteFiles(
  bucket: BucketName,
  paths: string[]
): Promise<{ errors: string[] }> {
  const supabase = getClient()
  
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove(paths)
  
  if (storageError) {
    return { errors: [storageError.message] }
  }
  
  const { error: dbError } = await supabase
    .from('user_files')
    .delete()
    .eq('bucket', bucket)
    .in('path', paths)
  
  if (dbError) {
    return { errors: [dbError.message] }
  }
  
  return { errors: [] }
}

/**
 * List files in a bucket for current user
 */
export async function listUserFiles(
  bucket: BucketName,
  options?: {
    limit?: number
    offset?: number
    sortBy?: { column: string; order: 'asc' | 'desc' }
  }
): Promise<{ files: Array<{ name: string; id: string; size: number; created_at: string }>; error: string | null }> {
  const supabase = getClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return { files: [], error: 'Not authenticated' }
  }
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(user.id, {
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      sortBy: options?.sortBy ?? { column: 'created_at', order: 'desc' },
    })
  
  if (error) {
    return { files: [], error: error.message }
  }
  
  return { files: data, error: null }
}

/**
 * Check if a file exists
 */
export async function fileExists(
  bucket: BucketName,
  path: string
): Promise<boolean> {
  const supabase = getClient()
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .list('', {
      search: path,
    })
  
  return !error && data.length > 0
}

/**
 * Get file metadata from database
 */
export async function getFileMetadata(
  bucket: BucketName,
  path: string
): Promise<Database['public']['Tables']['user_files']['Row'] | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('user_files')
    .select('*')
    .eq('bucket', bucket)
    .eq('path', path)
    .single()
  
  if (error) {
    return null
  }
  
  return data
}

// ─── Helper Functions ───────────────────────────────────────────────────

function getCategoryFromBucket(bucket: BucketName): string {
  switch (bucket) {
    case 'progress-photos':
      return 'progress_photo'
    case 'food-images':
      return 'nutrition'
    case 'workout-media':
      return 'fitness'
    default:
      return 'general'
  }
}

/**
 * Generate unique filename with timestamp
 */
export function generateFilename(originalName: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = originalName.split('.').pop() || 'jpg'
  return `${timestamp}_${random}.${ext}`
}

/**
 * Validate file before upload
 */
export function validateFile(
  file: File,
  bucket: BucketName
): { valid: boolean; error?: string } {
  // Define limits per bucket
  const limits: Record<BucketName, { maxSize: number; allowedTypes: string[] }> = {
    'progress-photos': {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    'food-images': {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    'workout-media': {
      maxSize: 50 * 1024 * 1024, // 50MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'],
    },
  }
  
  const limit = limits[bucket]
  
  if (file.size > limit.maxSize) {
    return {
      valid: false,
      error: `File size exceeds ${limit.maxSize / (1024 * 1024)}MB limit`,
    }
  }
  
  if (!limit.allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} not allowed`,
    }
  }
  
  return { valid: true }
}
