/**
 * Planner AI Service — Standalone Bun service for Iron Coach weekly planner
 *
 * Bypasses Vercel's 10s function timeout by running as a long-lived process.
 * Accepts prompt payloads and calls Groq API with a model fallback chain.
 */

const PORT = 3040;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";

const MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama3-8b-8192",
] as const;

const MAX_TOKENS = 4000;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 120_000; // 120 seconds per model attempt

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip common markdown code-fence wrappers from the response text.
 * Handles ```json … ``` and bare ``` … ``` fences.
 */
function cleanMarkdownFences(text: string): string {
  let cleaned = text.trim();

  // Remove opening fence with optional language tag
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, "");
  // Remove closing fence
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, "");

  return cleaned.trim();
}

/**
 * Attempt a single Groq API call with the given model.
 * Returns the raw content string on success or throws on failure.
 */
async function callGroq(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; model: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  console.log(`[planner-ai] Calling model: ${model}`);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text().catch(() => "no body");
      console.error(
        `[planner-ai] Model ${model} returned ${status}: ${body}`,
      );

      // Throw structured errors so callers can decide on retries
      const err = new Error(
        `Groq API error (${status}): ${body.slice(0, 300)}`,
      );
      (err as any).status = status;
      throw err;
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      model: string;
    };

    const rawContent = data.choices?.[0]?.message?.content ?? "";
    console.log(
      `[planner-ai] Success from model ${data.model} — ${rawContent.length} chars`,
    );

    return {
      content: cleanMarkdownFences(rawContent),
      model: data.model,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

async function handleGenerate(req: Request): Promise<Response> {
  // --- Validate request ---
  if (req.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed. Use POST." },
      { status: 405 },
    );
  }

  let body: { system_prompt?: string; user_prompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const { system_prompt, user_prompt } = body;

  if (!system_prompt || !user_prompt) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: system_prompt and user_prompt.",
      },
      { status: 400 },
    );
  }

  if (!GROQ_API_KEY) {
    console.error("[planner-ai] GROQ_API_KEY is not set!");
    return Response.json(
      { success: false, error: "Server misconfigured: GROQ_API_KEY missing." },
      { status: 500 },
    );
  }

  // --- Try each model in the fallback chain ---
  let lastError = "";

  for (const model of MODELS) {
    try {
      const result = await callGroq(model, system_prompt, user_prompt);
      return Response.json({
        success: true,
        content: result.content,
        model: result.model,
      });
    } catch (err: any) {
      lastError = err.message ?? String(err);
      const status = (err as any).status;

      console.warn(
        `[planner-ai] Model ${model} failed (status=${status ?? "unknown"}). Trying next...`,
      );

      // Only fall through on rate-limit (429) or bad-request (400) / decommissioned model.
      // For other server errors (500, 502, 503) also retry with next model.
      // AbortError (timeout) also falls through.
      continue;
    }
  }

  // All models exhausted
  console.error(
    `[planner-ai] All models failed. Last error: ${lastError}`,
  );
  return Response.json(
    { success: false, error: `All models failed. Last error: ${lastError}` },
    { status: 502 },
  );
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function handleHealth(): Response {
  return Response.json({
    status: "ok",
    service: "planner-ai",
    port: PORT,
    models: [...MODELS],
    groq_key_set: GROQ_API_KEY.length > 0,
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Bun server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS — allow all origins
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    console.log(`[planner-ai] ${req.method} ${path}`);

    // Routes
    if (path === "/health" && req.method === "GET") {
      return handleHealth();
    }

    if (path === "/generate") {
      const resp = handleGenerate(req);
      // Attach CORS headers
      return resp.then((r) => {
        const headers = new Headers(r.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(r.body, { status: r.status, headers });
      });
    }

    return Response.json(
      { success: false, error: `Not found: ${path}` },
      { status: 404 },
    );
  },
});

console.log(`[planner-ai] 🚀 Planner AI service running on port ${PORT}`);
console.log(`[planner-ai]   POST /generate  — generate a plan`);
console.log(`[planner-ai]   GET  /health    — health check`);
console.log(
  `[planner-ai]   Models: ${MODELS.join(" → ")}`,
);
