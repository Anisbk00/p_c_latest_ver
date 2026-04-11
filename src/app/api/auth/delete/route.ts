/**
 * Account Deletion API Route
 * 
 * Permanently deletes a user account including:
 * - All user data (profiles, settings, workouts, etc.)
 * - All storage files (progress photos, avatars)
 * - Supabase Auth user record
 * - All sessions are revoked
 * 
 * SECURITY: This is a destructive, irreversible operation.
 * Requires authentication, password confirmation, and uses service role key.
 * 
 * P0 FIX: Added password re-entry requirement before deletion
 * 
 * @module api/auth/delete
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  withDistributedRateLimit,
  DISTRIBUTED_RATE_LIMITS,
} from '@/lib/distributed-rate-limit'
import { logger } from '@/lib/logger'

// Tables to clear user data from before deleting auth user
const USER_DATA_TABLES = [
  'food_logs',
  'workouts',
  'body_metrics',
  'goals',
  'user_settings',
  'user_files',
  'sleep_logs',
  'ai_insights',
  'progress_photos',
  'supplement_logs',
  'profiles',
  'user_profiles',
  'notification_preferences',
  'settings_audit',
]

// Storage buckets to clean up user files from
const STORAGE_BUCKETS = [
  'progress-photos',
  'food-images',
  'avatars',
]

// ═══════════════════════════════════════════════════════════════
// DELETE /api/auth/delete
// ═══════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  const startTime = Date.now()
  
  // Rate limit check — destructive operation needs protection
  const rateCheck = await withDistributedRateLimit(request, DISTRIBUTED_RATE_LIMITS.AUTH_STRICT);
  if (!rateCheck.allowed) return rateCheck.response;

  try {
    // ─── Authenticate User ─────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // ─── P0 FIX: Require Password Confirmation ─────────────────
    // Parse body for password confirmation
    let body: { password?: string; confirmPhrase?: string } = {}
    try {
      body = await request.json()
    } catch {
      // Body might be empty for legacy calls
    }
    
    const { password, confirmPhrase } = body
    
    // Require password for email/password users
    if (user.app_metadata?.provider === 'email' || !user.app_metadata?.provider) {
      if (!password) {
        return NextResponse.json(
          { 
            error: 'Password confirmation required', 
            code: 'PASSWORD_REQUIRED',
            message: 'Please provide your password to confirm account deletion'
          },
          { status: 400 }
        )
      }
      
      // Verify password by attempting sign-in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password,
      })
      
      if (verifyError) {
        return NextResponse.json(
          { 
            error: 'Invalid password', 
            code: 'INVALID_PASSWORD',
            message: 'The password you entered is incorrect'
          },
          { status: 401 }
        )
      }
    }
    
    // Require confirmation phrase "DELETE MY ACCOUNT"
    if (confirmPhrase !== 'DELETE MY ACCOUNT') {
      return NextResponse.json(
        { 
          error: 'Confirmation required', 
          code: 'CONFIRMATION_REQUIRED',
          message: 'Please type "DELETE MY ACCOUNT" to confirm'
        },
        { status: 400 }
      )
    }

    const userId = user.id
    const userEmail = user.email

    logger.info('Account deletion confirmed', { userId })
    
    // ─── Audit Log: Record Deletion Request ────────────────────
    const adminClient = createAdminClient()
    try {
      await adminClient.from('audit_logs').insert({
        user_id: userId,
        action: 'account_deletion',
        details: { email: userEmail, timestamp: new Date().toISOString() },
      })
    } catch {
      // Audit log failure shouldn't block deletion
    }

    // ─── Step 0: Clean Up Storage Files ────────────────────────
    // Delete all user files from storage buckets
    let storageFilesDeleted = 0
    
    for (const bucket of STORAGE_BUCKETS) {
      try {
        // List all files in user's folder
        const { data: files, error: listError } = await adminClient.storage
          .from(bucket)
          .list(userId)
        
        if (!listError && files && files.length > 0) {
          // Delete all files in user's folder
          const filePaths = files.map(file => `${userId}/${file.name}`)
          const { error: deleteError } = await adminClient.storage
            .from(bucket)
            .remove(filePaths)
          
          if (!deleteError) {
            storageFilesDeleted += files.length
          }
        }
      } catch (err) {
        // Bucket might not exist or be empty
        logger.warn('Storage cleanup warning', { bucket, error: err })
      }
    }
    
    logger.info('Storage files deleted', { count: storageFilesDeleted })

    // ─── Step 1: Delete All User Data ─────────────────────────
    const deletionResults: Record<string, number> = {}
    
    for (const table of USER_DATA_TABLES) {
      try {
        const { data, error } = await adminClient
          .from(table)
          .delete()
          .eq('user_id', userId)
          .or(`id.eq.${userId}`) // For profiles table which uses id, not user_id
          .select('id')
        
        if (!error) {
          deletionResults[table] = data?.length || 0
        }
      } catch {
        // Table might not exist or have different structure
        deletionResults[table] = 0
      }
    }

    logger.info('User data deleted', deletionResults)

    // ─── Step 2: Revoke All Sessions ───────────────────────────
    try {
      const { error: signOutError } = await adminClient.auth.admin.signOut(userId, 'global')
      
      if (signOutError) {
        logger.warn('Failed to revoke sessions', signOutError.message)
      }
    } catch (err) {
      logger.warn('Session revocation error', err)
    }

    // ─── Step 3: Delete Auth User ─────────────────────────────
    // This is the critical step that prevents re-signin
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    
    if (deleteError) {
      logger.error('Failed to delete auth user', deleteError.message)
      
      return NextResponse.json(
        { error: 'Failed to delete account. Please try again or contact support.' },
        { status: 500 }
      )
    }

    logger.info('Account deleted successfully', { userId, duration: Date.now() - startTime })

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    })

  } catch (error) {
    logger.error('Account deletion error', error instanceof Error ? error.message : error)
    
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
