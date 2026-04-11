import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Health check endpoint for production monitoring
 * SECURITY: Does not expose internal environment details
 */
export async function GET() {
  return NextResponse.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { status: 200 }
  );
}
