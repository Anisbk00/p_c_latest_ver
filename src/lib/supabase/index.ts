/**
 * Supabase Module Index
 * 
 * Central export point for all Supabase-related utilities.
 * 
 * IMPORTANT: Server-side only credentials (SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL)
 * are NOT exported from this file. Import them directly from './server-config'
 * in server-side code only.
 * 
 * IMPORTANT: Server-side functions (createServerClient, createAdminClient, getServerUser, requireAuth)
 * are NOT exported from this file to prevent client bundle contamination.
 * Import them directly from './server' in server-side code only.
 * 
 * @module lib/supabase
 */

// Supabase configuration constants (client-safe)
export { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

// Client-side instance
export { getClient, getCurrentUser, getSession, onAuthStateChange } from './client'

// NOTE: Server-side functions removed from re-exports to prevent client bundle contamination.
// Import directly from './server' in server-side code:
// import { createServerClient, createAdminClient, getServerUser, requireAuth } from '@/lib/supabase/server'

// Auth context and hooks
export { SupabaseAuthProvider, useSupabaseAuth, useAuth } from './auth-context'

// Storage utilities
export {
  uploadFile,
  getSignedUrl,
  getSignedUrls,
  deleteFile,
  deleteFiles,
  listUserFiles,
  fileExists,
  getFileMetadata,
  generateFilename,
  validateFile,
} from './storage'

// Types
export type {
  Database,
  Tables,
  InsertTables,
  UpdateTables,
  Profile,
  UserSettings,
  BodyMetric,
  Food,
  FoodLog,
  Workout,
  SleepLog,
  AIInsight,
  Goal,
  UserFile,
} from './database.types'

export type { Json } from './database.types'
