/**
 * Device Registration API
 * 
 * Registers a mobile device for push notifications.
 * Called by the mobile app when it gets an Expo Push Token.
 * 
 * POST /api/notifications/register-device
 * 
 * @module app/api/notifications/register-device/route
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface RegisterDeviceRequest {
  device_token: string;
  device_type: 'ios' | 'android' | 'web';
  device_name?: string;
  device_id?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════════

function validateExpoToken(token: string): boolean {
  return (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[') ||
    /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i.test(token)
  );
}

function validateAPNsToken(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token);
}

function validateWebPushToken(token: string): boolean {
  try {
    const sub = JSON.parse(token);
    return !!sub.endpoint;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Route Handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const body: RegisterDeviceRequest = await request.json();
    const { device_token, device_type, device_name, device_id } = body;

    if (!device_token || !device_type) {
      return NextResponse.json(
        { error: 'Missing required fields: device_token, device_type', code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    if (!['ios', 'android', 'web'].includes(device_type)) {
      return NextResponse.json(
        { error: 'Invalid device_type. Must be: ios, android, or web', code: 'INVALID_DEVICE_TYPE' },
        { status: 400 }
      );
    }

    // Validate and detect token type
    let tokenType = 'unknown';
    if (device_type === 'ios') {
      if (validateExpoToken(device_token)) {
        tokenType = 'expo';
      } else if (validateAPNsToken(device_token)) {
        tokenType = 'apns';
      }
    } else if (device_type === 'android') {
      tokenType = validateExpoToken(device_token) ? 'expo' : 'other';
    } else if (device_type === 'web') {
      tokenType = validateWebPushToken(device_token) ? 'webpush' : 'unknown';
    }

    // Normalize Expo token format
    let normalizedToken = device_token;
    if (tokenType === 'expo' && !device_token.startsWith('ExponentPushToken[')) {
      if (device_token.startsWith('ExpoPushToken[')) {
        normalizedToken = device_token.replace('ExpoPushToken[', 'ExponentPushToken[');
      } else if (/^[a-z0-9-]{36}$/i.test(device_token)) {
        normalizedToken = `ExponentPushToken[${device_token}]`;
      }
    }

    // Upsert device
    const { data: existingDevice } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', user.id)
      .eq('device_token', normalizedToken)
      .maybeSingle();

    if (existingDevice) {
      await supabase
        .from('user_devices')
        .update({
          last_used_at: new Date().toISOString(),
          device_name: device_name || null,
          push_enabled: true,
        })
        .eq('id', existingDevice.id);

      return NextResponse.json({
        success: true,
        action: 'updated',
        device_id: existingDevice.id,
        token_type: tokenType,
      });
    }

    const { data: newDevice, error: insertError } = await supabase
      .from('user_devices')
      .insert({
        user_id: user.id,
        device_token: normalizedToken,
        device_type,
        device_name: device_name || null,
        device_id: device_id || null,
        push_enabled: true,
        sound_enabled: true,
        badge_enabled: true,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[RegisterDevice] Error:', insertError);
      return NextResponse.json(
        { error: 'Failed to register device', code: 'INSERT_FAILED' },
        { status: 500 }
      );
    }

    // Create default preferences
    await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, notifications_enabled: true }, { onConflict: 'user_id', ignoreDuplicates: true });

    console.log(`[RegisterDevice] ${user.id} - ${device_type} - ${tokenType}`);

    return NextResponse.json({
      success: true,
      action: 'registered',
      device_id: newDevice.id,
      token_type: tokenType,
    });

  } catch (error) {
    console.error('[RegisterDevice] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_token } = await request.json();

    if (!device_token) {
      return NextResponse.json({ error: 'Missing device_token' }, { status: 400 });
    }

    await supabase
      .from('user_devices')
      .delete()
      .eq('user_id', user.id)
      .eq('device_token', device_token);

    return NextResponse.json({ success: true, action: 'unregistered' });

  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
