/**
 * Mark All Notifications as Read API Route
 * 
 * POST: Mark all notifications as read for the authenticated user
 * 
 * @module app/api/notifications/mark-read/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import NotificationService from '@/lib/notifications/notification-service';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await NotificationService.markAllAsRead(user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error in POST /api/notifications/mark-read:', error);
    return NextResponse.json(
      { error: 'Failed to mark all as read' },
      { status: 500 }
    );
  }
}
