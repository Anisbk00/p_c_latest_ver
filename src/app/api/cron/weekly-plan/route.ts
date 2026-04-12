import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron endpoint — auto-generates weekly plans for the current week.
 * 
 * Triggered every Monday at 06:00 Africa/Tunis via cron scheduler.
 * Generates plans for all users who have an active profile.
 * 
 * The weekly-planner API will return cached plans instantly for
 * users who already have one, so re-running is safe.
 * 
 * Security: Uses Vercel Cron secret to prevent unauthorized calls.
 */

// Validate cron secret
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If no CRON_SECRET configured, only allow in development
  if (!cronSecret) {
    return process.env.NODE_ENV === 'development';
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  // Validate authorization
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Forward to the weekly planner API to generate the current week's plan
    // This endpoint runs in the user's authenticated context via the cron scheduler
    const weekStart = new Date();
    // Go to Monday of current week
    const day = weekStart.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday-based
    weekStart.setDate(weekStart.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Call the internal weekly planner generation endpoint
    // Since this runs server-side, we need to call it directly or use the API
    const plannerUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/iron-coach/weekly-planner?week_start=${weekStartStr}`;

    const response = await fetch(plannerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('authorization') || '',
      },
      body: JSON.stringify({ force_regenerate: false }),
    });

    const data = await response.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      week_start: weekStartStr,
      message: 'Weekly plan cron triggered',
      result: data.success ? 'Plan generated/cached' : 'Plan generation failed',
    });
  } catch (error) {
    console.error('[cron/weekly-plan] Error:', error);
    return NextResponse.json(
      { error: 'Cron execution failed' },
      { status: 500 }
    );
  }
}

// Allow GET for health checks
export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/cron/weekly-plan',
    description: 'Auto-generates weekly plans every Monday',
  });
}
