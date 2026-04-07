/**
 * AI Proxy Server
 * Exposes the private AI service (172.25.136.193:8080) publicly
 * This allows Vercel and mobile apps to access the AI service
 */

const PRIVATE_AI_URL = 'http://172.25.136.193:8080/v1';
const PORT = parseInt(process.env.AI_PROXY_PORT || '8787');

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // CORS headers for mobile and web clients
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Chat-Id, X-User-Id, X-Token, X-Z-AI-From',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow /v1/* paths
  if (!url.pathname.startsWith('/v1/')) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const targetUrl = `${PRIVATE_AI_URL}${url.pathname.replace('/v1', '')}${url.search}`;

    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
    };

    // Forward auth headers
    const authHeader = request.headers.get('Authorization');
    if (authHeader) headers['Authorization'] = authHeader;

    const chatId = request.headers.get('X-Chat-Id');
    if (chatId) headers['X-Chat-Id'] = chatId;

    const userId = request.headers.get('X-User-Id');
    if (userId) headers['X-User-Id'] = userId;

    const token = request.headers.get('X-Token');
    if (token) headers['X-Token'] = token;

    headers['X-Z-AI-From'] = 'Z';

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body ? await request.arrayBuffer() : undefined,
    });

    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    };

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[AI Proxy] Error:', error);
    return new Response(JSON.stringify({ error: 'Proxy error' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

console.log(`[AI Proxy] Starting on port ${PORT}`);
console.log(`[AI Proxy] Forwarding to ${PRIVATE_AI_URL}`);

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});
