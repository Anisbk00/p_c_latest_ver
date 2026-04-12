import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Health check endpoint for production monitoring
 * SECURITY: Does not expose sensitive env details, only connectivity status
 */
export async function GET() {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const keyExists = !!GROQ_API_KEY;
  const keyPrefix = keyExists ? GROQ_API_KEY!.slice(0, 8) + '...' : 'NOT SET';
  
  // Test Groq API connectivity with a minimal request
  let groqStatus: 'ok' | 'error' | 'not_configured' = 'not_configured';
  let groqError = '';
  
  if (keyExists) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5,
          stream: false,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (resp.ok) {
        groqStatus = 'ok';
      } else {
        groqStatus = 'error';
        const errBody = await resp.text().catch(() => '');
        groqError = `HTTP ${resp.status}: ${errBody.substring(0, 200)}`;
      }
    } catch (err) {
      groqStatus = 'error';
      groqError = err instanceof Error ? err.message : String(err);
    }
  }
  
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: {
      groq: {
        configured: keyExists,
        key_preview: keyPrefix,
        status: groqStatus,
        error: groqError || undefined,
      },
    },
  }, { status: 200 });
}
