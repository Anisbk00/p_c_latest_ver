/**
 * User Profile Data Access Module
 * 
 * Handles all user profile and settings operations using Supabase.
 * All queries are filtered by user_id for security.
 * 
 * @module lib/data/users
 */

import { getClient } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import type {
  Profile,
  UserSettings,
  Tables,
  InsertTables,
  UpdateTables,
} from '@/lib/supabase/database.types'

// ─── Client-side Operations ─────────────────────────────────────────

/**
 * Get the current user's profile
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    console.error('Error fetching profile:', error.message)
    throw error
  }
  
  return data
}

/**
 * Update the current user's profile
 */
export async function updateProfile(
  userId: string,
  updates: UpdateTables<'profiles'>
): Promise<Profile> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating profile:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create a new user profile
 */
export async function createProfile(
  profile: InsertTables<'profiles'>
): Promise<Profile> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select()
    .single()
  
  if (error) {
    console.error('Error creating profile:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get user settings
 */
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    console.error('Error fetching user settings:', error.message)
    throw error
  }
  
  return data
}

/**
 * Update user settings
 */
export async function updateUserSettings(
  userId: string,
  settings: UpdateTables<'user_settings'>
): Promise<UserSettings> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('user_settings')
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating user settings:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create default settings for a new user
 */
export async function createUserSettings(
  userId: string
): Promise<UserSettings> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('user_settings')
    .insert({
      user_id: userId,
      theme: 'system',
      notifications_enabled: true,
      email_notifications: true,
      push_notifications: false,
      language: 'en',
      units: 'metric',
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating user settings:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get profile with settings in one query
 */
export async function getProfileWithSettings(userId: string): Promise<{
  profile: Profile | null
  settings: UserSettings | null
}> {
  const supabase = getClient()
  
  const [profileResult, settingsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
  ])
  
  return {
    profile: profileResult.error ? null : profileResult.data,
    settings: settingsResult.error ? null : settingsResult.data,
  }
}

// ─── Server-side Operations ─────────────────────────────────────────

/**
 * Server-side: Get user profile
 * Use this in Server Components and API routes
 */
export async function getProfileServer(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching profile (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Update user profile
 */
export async function updateProfileServer(
  userId: string,
  updates: UpdateTables<'profiles'>
): Promise<Profile> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating profile (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Get user settings
 */
export async function getUserSettingsServer(userId: string): Promise<UserSettings | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching user settings (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Update user settings
 */
export async function updateUserSettingsServer(
  userId: string,
  settings: UpdateTables<'user_settings'>
): Promise<UserSettings> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('user_settings')
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating user settings (server):', error.message)
    throw error
  }
  
  return data
}

// ─── Types ─────────────────────────────────────────────────────────

export type ProfileUpdate = UpdateTables<'profiles'>
export type UserSettingsUpdate = UpdateTables<'user_settings'>
export type ProfileInsert = InsertTables<'profiles'>
export type UserSettingsInsert = InsertTables<'user_settings'>
