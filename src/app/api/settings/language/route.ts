/**
 * POST /api/settings/language
 *
 * Updates user_settings.language + last_locale_applied_at.
 * Writes a full audit entry to settings_audit.
 * Records a language_changed signal into ai_training_signals.
 *
 * Body: { language: 'en' | 'fr' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { recordSignal } from '@/lib/ai/adaptive-engine';

const ALLOWED: Set<string> = new Set(['en', 'fr']);

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const body = await request.json();
    const { language } = body as { language: string };

    if (!language || !ALLOWED.has(language)) {
      return NextResponse.json(
        { error: `Invalid language. Allowed: en, fr` },
        { status: 400 }
      );
    }

    // Fetch current language for audit diff
    const { data: current } = await supabase
      .from('user_settings')
      .select('language')
      .eq('user_id', user.id)
      .single();

    const prevLanguage = current?.language ?? 'en';

    // No-op if unchanged
    if (prevLanguage === language) {
      return NextResponse.json({ success: true, language, changed: false });
    }

    // Update user_settings
    const { error: updateErr } = await supabase
      .from('user_settings')
      .update({
        language,
        preferred_language: language,
        last_locale_applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateErr) throw updateErr;

    // Update profiles.locale in sync
    await supabase
      .from('profiles')
      .update({ locale: language, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    // Audit trail
    await (supabase as any).from('settings_audit').insert({
      user_id: user.id,
      changed_by: user.id,
      change_type: 'language_change',
      action: 'UPDATE',
      resource: 'user_settings',
      payload: { field: 'language', from: prevLanguage, to: language },
      old_values: { language: prevLanguage },
      new_values: { language },
    });

    // Training signal — non-blocking
    await recordSignal({
      userId: user.id,
      signalType: 'language_changed',
      signalData: { from: prevLanguage, to: language },
      strength: 0.5,
    });

    return NextResponse.json({
      success: true,
      language,
      changed: true,
      previous: prevLanguage,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/settings/language]', err);
    return NextResponse.json({ error: 'Failed to update language', details: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/settings/language',
    body: { language: 'en | fr' },
    effects: [
      'Updates user_settings.language',
      'Updates user_settings.last_locale_applied_at',
      'Updates profiles.locale',
      'Writes settings_audit entry',
      'Records ai_training_signals entry',
    ],
  });
}
