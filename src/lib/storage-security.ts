/**
 * Storage Security Utilities
 * 
 * Secure file storage handling:
 * - Signed URL generation with expiration
 * - Bucket access control
 * - File type validation
 * - Size limits
 * 
 * @module lib/storage-security
 */

import { createClient } from '@/lib/supabase/server'
import { getServiceRoleKey } from '@/lib/supabase/server-config'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/** Storage bucket names */
export const STORAGE_BUCKETS = {
  AVATARS: 'avatars',
  PROGRESS_PHOTOS: 'progress-photos',
  FOOD_PHOTOS: 'food-photos',
  DOCUMENTS: 'documents',
} as const

/** Default URL expiration time in seconds */
const DEFAULT_URL_EXPIRATION = 3600 // 1 hour

/** Maximum file sizes by bucket (in bytes) */
const MAX_FILE_SIZES: Record<string, number> = {
  [STORAGE_BUCKETS.AVATARS]: 5 * 1024 * 1024, // 5MB
  [STORAGE_BUCKETS.PROGRESS_PHOTOS]: 10 * 1024 * 1024, // 10MB
  [STORAGE_BUCKETS.FOOD_PHOTOS]: 5 * 1024 * 1024, // 5MB
  [STORAGE_BUCKETS.DOCUMENTS]: 20 * 1024 * 1024, // 20MB
}

/** Allowed MIME types by bucket */
const ALLOWED_MIME_TYPES: Record<string, Set<string>> = {
  [STORAGE_BUCKETS.AVATARS]: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  [STORAGE_BUCKETS.PROGRESS_PHOTOS]: new Set(['image/jpeg', 'image/png', 'image/webp']),
  [STORAGE_BUCKETS.FOOD_PHOTOS]: new Set(['image/jpeg', 'image/png', 'image/webp']),
  [STORAGE_BUCKETS.DOCUMENTS]: new Set(['application/pdf', 'image/jpeg', 'image/png']),
}

// ═══════════════════════════════════════════════════════════════
// FILE VALIDATION
// ═══════════════════════════════════════════════════════════════

export interface FileValidation {
  valid: boolean
  error?: string
}

/**
 * Validate file before upload
 */
export function validateFile(
  bucket: string,
  file: { type: string; size: number; name: string }
): FileValidation {
  // Check bucket exists
  if (!Object.values(STORAGE_BUCKETS).includes(bucket as any)) {
    return { valid: false, error: 'Invalid storage bucket' }
  }
  
  // Check file size
  const maxSize = MAX_FILE_SIZES[bucket] || 5 * 1024 * 1024 // Default 5MB
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: `File size exceeds maximum of ${Math.round(maxSize / 1024 / 1024)}MB` 
    }
  }
  
  // Check MIME type
  const allowedTypes = ALLOWED_MIME_TYPES[bucket]
  if (allowedTypes && !allowedTypes.has(file.type)) {
    return { 
      valid: false, 
      error: `File type ${file.type} not allowed for this bucket` 
    }
  }
  
  // Check file extension
  const extension = file.name.split('.').pop()?.toLowerCase()
  const allowedExtensions: Record<string, Set<string>> = {
    [STORAGE_BUCKETS.AVATARS]: new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']),
    [STORAGE_BUCKETS.PROGRESS_PHOTOS]: new Set(['jpg', 'jpeg', 'png', 'webp']),
    [STORAGE_BUCKETS.FOOD_PHOTOS]: new Set(['jpg', 'jpeg', 'png', 'webp']),
    [STORAGE_BUCKETS.DOCUMENTS]: new Set(['pdf', 'jpg', 'jpeg', 'png']),
  }
  
  if (extension && allowedExtensions[bucket] && !allowedExtensions[bucket].has(extension)) {
    return { 
      valid: false, 
      error: `File extension .${extension} not allowed` 
    }
  }
  
  return { valid: true }
}

// ═══════════════════════════════════════════════════════════════
// SIGNED URL GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a signed URL for file download
 * URL expires after specified time for security
 */
export async function generateSignedDownloadUrl(
  bucket: string,
  path: string,
  expirationSeconds: number = DEFAULT_URL_EXPIRATION
): Promise<{ url: string | null; error?: string }> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expirationSeconds)
    
    if (error) {
      logger.error('Failed to generate signed URL', error, { bucket, path })
      return { url: null, error: 'Failed to generate download URL' }
    }
    
    return { url: data.signedUrl }
  } catch (error) {
    logger.error('Signed URL generation error', error)
    return { url: null, error: 'Internal error generating URL' }
  }
}

/**
 * Generate a signed URL for file upload
 * Returns URL and token for direct upload
 */
export async function generateSignedUploadUrl(
  bucket: string,
  path: string
): Promise<{ url: string | null; token?: string; error?: string }> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path)
    
    if (error) {
      logger.error('Failed to generate upload URL', error, { bucket, path })
      return { url: null, error: 'Failed to generate upload URL' }
    }
    
    return { 
      url: data.signedUrl,
      token: data.token,
    }
  } catch (error) {
    logger.error('Upload URL generation error', error)
    return { url: null, error: 'Internal error generating upload URL' }
  }
}

// ═══════════════════════════════════════════════════════════════
// PATH CONSTRUCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Construct a secure storage path
 * Format: userId/folder/filename
 */
export function constructSecurePath(
  userId: string,
  folder: string,
  filename: string
): string {
  // Sanitize filename to prevent path traversal
  const sanitizedFilename = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 100) // Limit length
  
  // Sanitize folder
  const sanitizedFolder = folder
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 50)
  
  return `${userId}/${sanitizedFolder}/${Date.now()}_${sanitizedFilename}`
}

/**
 * Validate path ownership (user can only access their own files)
 */
export function validatePathOwnership(
  path: string,
  userId: string
): { valid: boolean; error?: string } {
  const pathParts = path.split('/')
  const pathUserId = pathParts[0]
  
  if (pathUserId !== userId) {
    return { valid: false, error: 'Access denied: path does not belong to user' }
  }
  
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('//') || path.includes('\\')) {
    return { valid: false, error: 'Invalid path format' }
  }
  
  return { valid: true }
}

// ═══════════════════════════════════════════════════════════════
// BUCKET MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Create user folder in bucket if it doesn't exist
 * This is done by uploading a .keep file
 */
export async function ensureUserFolder(
  bucket: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    // Check if folder exists by trying to list files
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: 1 })
    
    if (error && error.message !== 'The resource was not found') {
      // Folder doesn't exist, create it
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(`${userId}/.keep`, new Blob([''], { type: 'text/plain' }), {
          upsert: true,
        })
      
      if (uploadError) {
        logger.error('Failed to create user folder', uploadError, { bucket, userId })
        return { success: false, error: 'Failed to create storage folder' }
      }
    }
    
    return { success: true }
  } catch (error) {
    logger.error('User folder creation error', error)
    return { success: false, error: 'Internal error creating folder' }
  }
}

/**
 * Delete all files in a user's folder (for account deletion)
 */
export async function deleteUserFolder(
  bucket: string,
  userId: string
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    const supabase = await createClient()
    
    // List all files in user's folder
    const { data: files, error: listError } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: 1000 })
    
    if (listError) {
      return { success: false, deletedCount: 0, error: 'Failed to list files' }
    }
    
    if (!files || files.length === 0) {
      return { success: true, deletedCount: 0 }
    }
    
    // Delete all files
    const pathsToDelete = files.map(file => `${userId}/${file.name}`)
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove(pathsToDelete)
    
    if (deleteError) {
      logger.error('Failed to delete files', deleteError, { bucket, userId })
      return { success: false, deletedCount: 0, error: 'Failed to delete files' }
    }
    
    return { success: true, deletedCount: files.length }
  } catch (error) {
    logger.error('Folder deletion error', error)
    return { success: false, deletedCount: 0, error: 'Internal error deleting folder' }
  }
}
