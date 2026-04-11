/**
 * Mobile API Configuration
 * 
 * This module provides API URL resolution for both web and mobile environments.
 * 
 * Web (Development): Uses relative URLs (same server)
 * Mobile (Production): Uses absolute URLs pointing to deployed backend
 */

import { getSession } from '@/lib/supabase/client';
import { getCachedAuthSession } from '@/lib/offline-auth';

/**
 * Check if we're running in a Capacitor native mobile app
 */
export function isMobileApp(): boolean {
  if (typeof window === 'undefined') return false;
  // @ts-expect-error - Capacitor global
  return !!window.Capacitor?.isNativePlatform?.();
}

/**
 * Get the base URL for API calls
 * 
 * - In web browser: Returns '' (relative URLs)
 * - In mobile app: Returns deployed backend URL
 */
export function getApiBaseUrl(): string {
  // Check if we're in a mobile Capacitor environment
  if (isMobileApp()) {
    // Use deployed backend URL for mobile - read from environment
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      console.error('[Mobile API] NEXT_PUBLIC_API_URL not set. Mobile app cannot connect to backend.');
      // Show a persistent error banner so the user knows something is wrong
      if (typeof document !== 'undefined' && !document.getElementById('mobile-api-error')) {
        const banner = document.createElement('div');
        banner.id = 'mobile-api-error';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;text-align:center;padding:12px 16px;font-size:14px;font-weight:500;';
        banner.textContent = '⚠️ Configuration error: API URL not set. Please rebuild with NEXT_PUBLIC_API_URL.';
        document.body.appendChild(banner);
      }
      return '';
    }
    return apiUrl;
  }
  
  // Web: use relative URLs (same origin)
  return '';
}

/**
 * Build full API URL for mobile or web
 * 
 * @example
 * // Web: getApiUrl('/api/profile') → '/api/profile'
 * // Mobile: getApiUrl('/api/profile') → 'https://api.example.com/api/profile'
 */
export function getApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Get the current access token for authentication
 * Tries Supabase session first, then falls back to cached offline session
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    // First try to get the session from Supabase
    const session = await getSession();
    if (session?.access_token) {
      return session.access_token;
    }
    
    // Fall back to cached offline session
    const cachedSession = await getCachedAuthSession();
    if (cachedSession.success && cachedSession.session?.access_token) {
      return cachedSession.session.access_token;
    }
  } catch (error) {
    console.warn('[MobileAPI] Failed to get access token:', error);
  }
  
  return null;
}

/**
 * Fetch wrapper that automatically handles mobile vs web API URLs
 * 
 * On mobile, it also adds the Authorization header with the Supabase access token
 * since cookies may not work for cross-origin requests.
 * 
 * @example
 * const response = await apiFetch('/api/profile', { method: 'GET' });
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = getApiUrl(path);
  const mobile = isMobileApp();
  
  // Setup headers
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  
  // On mobile, add Authorization header with access token
  // This is necessary because cookies may not work for cross-origin requests
  if (mobile) {
    const token = await getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include cookies for auth (works on web)
  });
}

/**
 * GET request helper
 */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'GET' });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * POST request helper
 */
export async function apiPost<T>(path: string, data: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * PUT request helper
 */
export async function apiPut<T>(path: string, data: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * DELETE request helper
 */
export async function apiDelete<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'DELETE' });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// Export constants for direct use
export const API_BASE_URL = typeof window !== 'undefined' 
  ? (isMobileApp() 
      ? (process.env.NEXT_PUBLIC_API_URL || '')
      : '')
  : '';
