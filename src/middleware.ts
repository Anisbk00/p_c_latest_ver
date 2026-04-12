import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/auth-middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (logo.svg, manifest.json, sw.js, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.svg|manifest\\.json|sw\\.js|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|mp4|woff|woff2|ttf|eot)$).*)',
  ],
}
