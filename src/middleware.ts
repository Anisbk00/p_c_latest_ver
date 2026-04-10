import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

/**
 * Next.js Middleware — Supabase session refresh & route protection
 *
 * - Refreshes the Supabase auth session on every request that carries cookies.
 * - Skips auth checks for static assets, public auth routes, and API routes
 *   (API routes handle their own auth via `requireAuth`).
 * - Redirects unauthenticated users accessing protected app routes to `/`.
 */

// ── Public paths that never require auth ──────────────────────────
const PUBLIC_PATHS = ['/auth/callback']

// ── Prefixes that bypass auth (session may still be refreshed) ───
const API_PREFIX = '/api'

// ── Matcher: run on every request except truly static assets ──────
// Next.js internal static files and common asset extensions are
// excluded here at the edge so the function body never fires.
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - Any file ending in common asset extensions
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. Fast exits: no Supabase interaction needed ──────────────

  // Auth callback — Supabase handles its own token exchange; pass through.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // API health endpoints — no session required, no redirect.
  if (pathname.startsWith('/api/health')) {
    return NextResponse.next()
  }

  // ── 2. Refresh the Supabase session ────────────────────────────
  // Every remaining request gets a session refresh so the cookie stays
  // valid. We build the response via setAll so cookies are propagated.

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // IMPORTANT: Do not insert logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── 3. CSRF: seed double-submit cookie from client header ───────
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

  // ── 4. API routes: refresh cookie but never block ──────────────
  // API handlers use `requireAuth()` on their own when needed.
  if (pathname.startsWith(API_PREFIX)) {
    return supabaseResponse
  }

  // ── 5. Protected app routes: enforce auth ──────────────────────
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: Always return the supabaseResponse so cookies propagate.
  return supabaseResponse
}
