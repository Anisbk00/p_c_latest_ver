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
  };

  return NextResponse.json(health, { status: 200 });
}
