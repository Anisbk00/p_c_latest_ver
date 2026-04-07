/**
 * Iron Coach Chat API — Comprehensive Implementation
 * 
 * Follows full specification:
 * - Multi-language support (EN, FR, AR)
 * - Conversation storage (ai_conversations, ai_messages)
 * - Training signals for adaptive learning
 * - Recommendations and plans
 * 
 * GET  /api/iron-coach/chat  — list sessions
 * POST /api/iron-coach/chat  — send message
 * 
 * SECURITY: Rate limited to prevent AI endpoint abuse
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { withRateLimit, RATE_LIMITS, rateLimitExceededResponse } from '@/lib/rate-limit';
import {
  generateIronCoachResponse,
  generateStreamingIronCoachResponse,
  recordFeedback,
  type SupportedLocale,
} from '@/lib/ai/comprehensive-ai-service';
import { sanitizeStringPlain } from '@/lib/security-utils';

// ═══════════════════════════════════════════════════════════════
// GET /api/iron-coach/chat - List conversations
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateCheck = withRateLimit(request, RATE_LIMITS.API_READ);
  if (!rateCheck.allowed) {
    return rateCheck.response;
  }

  try {
    const { supabase, user } = await getSupabaseUser();

    // Fetch user's conversations with messages
    const { data: sessions, error } = await supabase
      .from('ai_conversations')
      .select(`
        *,
        ai_messages (
          id,
          role,
          content,
          created_at,
          locale,
          translations,
          confidence
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Format response
    const formattedSessions = (sessions || []).map((session: any) => ({
      id: session.id,
      title: session.title,
      locale: session.locale,
      created_at: session.created_at,
      updated_at: session.updated_at,
      messages: (session.ai_messages || []).map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        translations: msg.translations,
        confidence: msg.confidence,
        created_at: msg.created_at,
      })),
    }));

    return NextResponse.json({ sessions: formattedSessions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[iron-coach GET]', err);
    return NextResponse.json(
      { error: 'Failed to fetch chat sessions', details: msg },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/iron-coach/chat - Send message
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // Rate limiting for AI endpoints
  const rateCheck = withRateLimit(request, RATE_LIMITS.AI_STANDARD);
  if (!rateCheck.allowed) {
    return rateCheck.response;
  }

  try {
    const { supabase, user } = await getSupabaseUser();
    const body = await request.json();

    const {
      message,
      sessionId,
      locale = 'en',
      stream = false,
    } = body as {
      message: string;
      sessionId?: string;
      locale?: SupportedLocale;
      stream?: boolean;
    };

    // SECURITY: Validate message length and sanitize
    if (!message?.trim() || message.length > 4000) {
      return NextResponse.json({ error: 'Message must be 1-4000 characters' }, { status: 400 });
    }
    
    // Sanitize user input
    const sanitizedMessage = sanitizeStringPlain(message, 4000);

    // Validate locale
    const validLocales: SupportedLocale[] = ['en', 'fr', 'ar'];
    const userLocale = validLocales.includes(locale) ? locale : 'en';

    // Get user's preferred language from settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('preferred_language, language')
      .eq('user_id', user.id)
      .single();

    const finalLocale = (settings?.preferred_language || settings?.language || userLocale) as SupportedLocale;

    // ─── Streaming Response ───────────────────────────────────────
    if (stream) {
      const encoder = new TextEncoder();
      const streamGenerator = generateStreamingIronCoachResponse(user.id, sanitizedMessage, {
        conversationId: sessionId,
        locale: finalLocale,
      });

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let result: ChatResponse | undefined;

            for await (const token of streamGenerator) {
              const chunk = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: 'iron-coach',
                choices: [{
                  index: 0,
                  delta: { content: token },
                  finish_reason: null,
                }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }

            // Get final result
            result = await streamGenerator.next().then(r => r.value as ChatResponse | undefined);

            // Send final chunk with metadata
            const finalChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: 'iron-coach',
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop',
              }],
              metadata: result ? {
                messageId: result.messageId,
                conversationId: result.conversationId,
                translations: result.translations,
                confidence: result.confidence,
              } : undefined,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // ─── Non-streaming Response ─────────────────────────────────────
    const response = await generateIronCoachResponse(user.id, sanitizedMessage, {
      conversationId: sessionId,
      locale: finalLocale,
    });

    return NextResponse.json({
      reply: response.content,
      message: response.content,
      messageId: response.messageId,
      sessionId: response.conversationId,
      translations: response.translations,
      confidence: response.confidence,
      locale: finalLocale,
      provenance: {
        source: 'gemini-llm',
        model: 'Iron Coach via Gemini 2.5 Flash',
        timestamp: new Date().toISOString(),
        locale: finalLocale,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[iron-coach POST]', err);
    return NextResponse.json(
      { error: 'Failed to process chat', details: msg },
      { status: 500 }
    );
  }
}

interface ChatResponse {
  messageId: string;
  conversationId: string;
  content: string;
  translations: Record<string, string>;
  confidence: number;
}
