/**
 * Single Notification API Route
 * 
 * Handle actions on individual notifications
 * 
 * @module app/api/notifications/[id]/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import NotificationService from '@/lib/notifications/notification-service';

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/notifications/[id] - Update notification status
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    // SECURITY FIX: Verify user owns this notification before acting
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('id', id)
      .single();
    
    if (fetchError || !notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    
    if (notification.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'open':
        await NotificationService.markAsOpened(id);
        break;
      case 'action':
        await NotificationService.markAsActioned(id);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error in PATCH /api/notifications/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/notifications/[id] - Handle notification action with deep link
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    // SECURITY FIX: Verify user owns this notification before acting
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('user_id, deep_link')
      .eq('id', id)
      .single();
    
    if (fetchError || !notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    
    if (notification.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Mark as actioned and return the deep link
    await NotificationService.markAsActioned(id);

    return NextResponse.json({ 
      success: true, 
      deepLink: notification?.deep_link 
    });
  } catch (error) {
    console.error('[API] Error in POST /api/notifications/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to process notification action' },
      { status: 500 }
    );
  }
}
