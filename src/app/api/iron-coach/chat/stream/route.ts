import { NextRequest } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { buildContextPrompt, buildIronCoachContext } from '@/lib/iron-coach/hybrid/context'
import { routeIronCoachRequest } from '@/lib/iron-coach/hybrid/router'
import { streamCloudPrompt } from '@/lib/iron-coach/hybrid/cloud'
import { ensureAIConversation, saveAIMessage, updateAIConversationTouch } from '@/lib/iron-coach/hybrid/ai-store'
import type { IronCoachModelSource, IronCoachStreamChunk } from '@/lib/iron-coach/hybrid/types'

async function ensureSession(
  supabase: Awaited<ReturnType<typeof getSupabaseUser>>['supabase'],
  userId: string,
  sessionId: string | null | undefined,
  titleSeed: string,
): Promise<string> {
  const sb = supabase as any
  if (sessionId) return sessionId

  const { data: session, error: sessionErr } = await sb
    .from('chat_sessions')
    .insert({ user_id: userId, title: titleSeed.slice(0, 60) || 'Chat' })
    .select()
    .single()

  if (sessionErr || !session) throw sessionErr || new Error('Failed to create session')
  return session.id
}

function encodeChunk(chunk: IronCoachStreamChunk): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(chunk)}\n`)
}

function wrapAssistantContent(text: string, source: IronCoachModelSource, reason?: string): string {
  return JSON.stringify({
    text,
    source,
    reason,
    timestamp: new Date().toISOString(),
  })
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || 'Internal server error'
  }

  if (typeof error === 'string') {
    return error || 'Internal server error'
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const direct = record.message ?? record.error ?? record.details ?? record.hint
    const code = typeof record.code === 'string' ? record.code : ''

    if (typeof direct === 'string' && direct.trim()) {
      return code ? `${direct} (${code})` : direct
    }

    if (direct && typeof direct === 'object') {
      const nested = direct as Record<string, unknown>
      const nestedMessage = nested.message ?? nested.error ?? nested.details ?? nested.hint
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return code ? `${nestedMessage} (${code})` : nestedMessage
      }
    }

    if (code) return `Request failed (${code})`
  }

  return 'Internal server error'
}

function normalizeError(error: unknown): { status: number; message: string } {
  const message = extractErrorMessage(error)
  if (message === 'UNAUTHORIZED') {
    return { status: 401, message: 'Unauthorized' }
  }
  return { status: 500, message: message || 'Internal server error' }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const sb = supabase as any
    const body = await request.json()

    const {
      message,
      sessionId,
      aiConversationId,
      localModelReady = false,
      supportsLocalInference = false,
      forceCloud = false,
      forceLocal = false,
      isOnline = true,
      locale = 'en',
    } = body as {
      message: string
      sessionId?: string
      aiConversationId?: string
      localModelReady?: boolean
      supportsLocalInference?: boolean
      forceCloud?: boolean
      forceLocal?: boolean
      isOnline?: boolean
      locale?: string
    }

    if (!message?.trim()) {
      return new Response(`${JSON.stringify({ type: 'error', error: 'Message is required' })}\n`, {
        status: 400,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      })
    }

    const currentSessionId = await ensureSession(supabase, user.id, sessionId, message)
    let currentAIConversationId: string | null = null

    try {
      currentAIConversationId = await ensureAIConversation(user.id, aiConversationId, message)
    } catch {
      currentAIConversationId = null
    }

    await sb.from('chat_messages').insert({
      session_id: currentSessionId,
      role: 'user',
      content: message,
    })

    if (currentAIConversationId) {
      await saveAIMessage({
        conversationId: currentAIConversationId,
        userId: user.id,
        role: 'user',
        content: message,
      }).catch(() => undefined)
    }

    const decision = routeIronCoachRequest({
      question: message,
      isOnline,
      forceCloud,
      forceLocal,
      device: {
        supportsLocalInference,
        modelReady: localModelReady,
      },
    })

    if (decision.source === 'local_model') {
      return new Response(
        `${JSON.stringify({
          type: 'meta',
          source: 'local_model',
          reason: decision.reason,
          aiConversationId: currentAIConversationId,
        })}\n`,
        {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        }
      )
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let finalText = ''
        let context: any = null;
        let tokensSent = false;

        try {
          // Build context
          let prompt;
          try {
            console.log('[iron-coach/stream] Building context for user:', user.id);
            context = await buildIronCoachContext(user.id, message)
            prompt = buildContextPrompt(context, message, locale)
            console.log('[iron-coach/stream] Context built, prompt length:', prompt.length);
          } catch (ctxError) {
            console.error('[iron-coach/stream] Context build error:', ctxError)
            prompt = `You are Iron Coach, an aggressive no-nonsense fitness and nutrition coach. Be direct and helpful. Respond to: ${message}`
          }

          controller.enqueue(encodeChunk({
            type: 'meta',
            source: 'cloud_model',
            reason: decision.reason,
            aiConversationId: currentAIConversationId || undefined,
          }))

          console.log('[iron-coach/stream] Starting AI stream...');
          
          // Track if onToken is called
          const onToken = (token: string) => {
            tokensSent = true;
            controller.enqueue(encodeChunk({ type: 'token', token }));
          };
          
          try {
            finalText = await streamCloudPrompt({
              prompt,
              signal: request.signal,
              locale,
              userQuestion: message,
              onToken,
            })
          } catch (streamError) {
            console.error('[iron-coach/stream] streamCloudPrompt error:', streamError);
            // Send error as tokens so user sees it
            const errorMsg = streamError instanceof Error ? streamError.message : 'AI temporarily unavailable';
            const fallback = `⚠️ ${errorMsg}. Please try again in a moment.`;
            for (const ch of fallback) {
              controller.enqueue(encodeChunk({ type: 'token', token: ch }));
            }
            finalText = fallback;
            tokensSent = true;
          }
          
          console.log('[iron-coach/stream] AI stream complete, response length:', finalText?.length || 0, 'tokensSent:', tokensSent);

          // CRITICAL: If no tokens were sent but we have text, stream it now
          if (!tokensSent && finalText && finalText.trim()) {
            console.log('[iron-coach/stream] No tokens sent, streaming finalText directly');
            for (const ch of finalText) {
              controller.enqueue(encodeChunk({ type: 'token', token: ch }));
            }
            tokensSent = true;
          }
          
          // If still no tokens, send a fallback message
          if (!tokensSent) {
            console.log('[iron-coach/stream] Still no tokens, sending fallback');
            const fallbackMsg = "💪 Iron Coach is taking a quick breather. Try again in a few seconds!";
            for (const ch of fallbackMsg) {
              controller.enqueue(encodeChunk({ type: 'token', token: ch }));
            }
            finalText = fallbackMsg;
          }

          await sb.from('chat_messages').insert({
            session_id: currentSessionId,
            role: 'assistant',
            content: wrapAssistantContent(finalText, 'cloud_model', decision.reason),
          })

          if (currentAIConversationId) {
            await saveAIMessage({
              conversationId: currentAIConversationId,
              userId: user.id,
              role: 'assistant',
              content: finalText,
              source: 'cloud_model',
              routingReason: decision.reason,
              confidence: 0.82,
              retrievalMetadata: {
                retrievalCount: context?.retrievalContext?.length ?? 0,
                ragCount: context?.ragSnippets?.length ?? 0,
                memoryCount: context?.memoryContext?.length ?? 0,
                transport: 'stream',
              },
            }).catch(() => undefined)

            await updateAIConversationTouch(currentAIConversationId, 'cloud_model').catch(() => undefined)
          }

          await sb
            .from('chat_sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', currentSessionId)

          controller.enqueue(encodeChunk({ type: 'done', source: 'cloud_model' }))
          controller.close()
        } catch (error) {
          console.error('[iron-coach/stream] Stream error:', error);
          controller.enqueue(encodeChunk({ type: 'error', error: extractErrorMessage(error) }))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    const normalized = normalizeError(error)
    return new Response(`${JSON.stringify({ type: 'error', error: normalized.message })}\n`, {
      status: normalized.status,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    })
  }
}
