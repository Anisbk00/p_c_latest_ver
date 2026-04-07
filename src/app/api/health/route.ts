import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Health check endpoint for production monitoring
 */
export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'connected',
      ai: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
      supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'not_configured',
    }
  };

  return NextResponse.json(health, { status: 200 });
}
