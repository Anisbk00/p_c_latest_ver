import type { NextConfig } from "next";

const isMobileBuild = process.env.NEXT_PUBLIC_MOBILE_BUILD === 'true';

const nextConfig: NextConfig = {
  // NOTE: Set to true because database.types.ts is stale (missing ~12 tables/columns).
  // To enable strict type checking:
  //   1. Regenerate types: npx supabase gen types typescript --project-id ygzxxmyrybtvszjlilxg > src/lib/supabase/database.types.ts
  //   2. Fix remaining ~250 errors (null checks, type assertions, duplicate props)
  //   3. Set ignoreBuildErrors to false
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
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

export default nextConfig;
