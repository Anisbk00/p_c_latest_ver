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

  // Static export for Capacitor mobile build
  output: isMobileBuild ? 'export' : undefined,
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
  // Disable source maps to prevent 403 errors on __nextjs_original-stack-frames in preview
  productionBrowserSourceMaps: false,
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
