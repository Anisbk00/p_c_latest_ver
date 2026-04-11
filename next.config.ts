import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const isMobileBuild = process.env.NEXT_PUBLIC_MOBILE_BUILD === 'true';

const nextConfig: NextConfig = {
  typescript: {
    // NOTE: ignoreBuildErrors is temporary while ~250 type errors are progressively fixed.
    // CI pipeline runs `tsc --noEmit` to track errors. Once count reaches 0, set this to false.
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '*.space.z.ai',
  ],

  // Fix turbopack workspace root issue
  turbopack: {
    root: process.cwd(),
  },

  // Standalone output for production builds; static export for Capacitor mobile build
  output: isMobileBuild ? 'export' : 'standalone',
  trailingSlash: isMobileBuild ? true : undefined,
  images: isMobileBuild ? {
    unoptimized: true,
  } : undefined,

  env: {
    // For mobile builds, use the deployed backend API
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
    NEXT_PUBLIC_MOBILE_BUILD: process.env.NEXT_PUBLIC_MOBILE_BUILD || 'false',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  serverExternalPackages: ['@supabase/ssr'],

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'framer-motion',
    ],
  },
  // Disable source maps to prevent 403 errors on __nextjs_original-stack-frames in preview
  productionBrowserSourceMaps: false,

  // ═══════════════════════════════════════════════════════════════
  // SECURITY HEADERS — Applied to all responses
  // ═══════════════════════════════════════════════════════════════
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Content Security Policy — defense against XSS, clickjacking, code injection
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.sentry-cdn.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.sentry.io https://api.groq.com https://groq.com https://o4509828950638592.ingest.us.sentry.io",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "media-src 'self' blob:",
            ].join('; '),
          },
          // Strict Transport Security — enforce HTTPS for 1 year
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Referrer Policy — limit referrer info on cross-origin navigation
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions Policy — restrict browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(self https://*.supabase.co), microphone=(self https://*.supabase.co), geolocation=(self), notifications=(self)',
          },
          // X-Frame-Options — prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // X-Content-Type-Options — prevent MIME sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // X-XSS-Protection — legacy XSS filter (still useful for older browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
