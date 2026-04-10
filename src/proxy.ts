/**
 * Next.js Proxy (Middleware in Next.js 16)
 *
 * Handles session refresh and auth state management for web mode.
 * For mobile builds (static export), this is not used.
 *
 * @module proxy
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Proxy] Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env');
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  //
  // getUser() automatically refreshes the access_token if expired using
  // the refresh_token cookie. This is the server-side token refresh mechanism.
  // The refreshed cookies are propagated via supabaseResponse.

  let user: { id: string } | null = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    // getUser() can throw if cookies are malformed — treat as unauthenticated
  }

  // ── CSRF: seed double-submit cookie from client header ───────
  // The client generates a token in sessionStorage and sends it as
  // X-CSRF-Token. We mirror it into a csrf-token cookie so the
  // double-submit pattern works: header value must match cookie value.
  const csrfHeader = request.headers.get('X-CSRF-Token')
  if (csrfHeader && /^[a-f0-9]{64}$/i.test(csrfHeader)) {
    supabaseResponse.cookies.set('csrf-token', csrfHeader, {
      path: '/',
      httpOnly: false, // Client needs to read it to send as header
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
    })
  }

  // Protected routes - redirect to home if not authenticated
  // Allow: / (auth screen), /auth/* (callbacks), /api/* (returns 401 itself)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/api') &&
    request.nextUrl.pathname !== '/'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in the NextResponse.next({ request }) method call
  // 2. Copy any cookies from the supabaseResponse to your new response

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff|woff2)).*)',
  ],
}
