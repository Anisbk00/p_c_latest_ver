/**
 * LLM Server - Qwen3-VL-2B-Instruct-GGUF
 * 
 * Provides an OpenAI-compatible API for:
 * - Text chat completions
 * - Vision (image) completions
 * 
 * Port: 3031
 */

import { serve } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';

// Model configuration
const PORT = 3031;
const MODELS_DIR = join(import.meta.dir, 'models');
const MODEL_PATH = join(MODELS_DIR, 'Qwen3VL-2B-Instruct-Q4_K_M.gguf');
const MMPROJ_PATH = join(MODELS_DIR, 'mmproj-Qwen3VL-2B-Instruct-F16.gguf');

// Check if models exist
if (!existsSync(MODEL_PATH)) {
  console.error(`❌ Model not found: ${MODEL_PATH}`);
  console.error(`Run: bun run download-model`);
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        LLM Server - Qwen3-VL-2B-Instruct-GGUF             ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log(`\n📁 Model: ${MODEL_PATH}`);
console.log(`📁 MMProj: ${MMPROJ_PATH} (${existsSync(MMPROJ_PATH) ? '✅' : '❌'})`);
console.log(`🌐 Port: ${PORT}`);

// Lazy-load node-llama-cpp
let llamaModel: any = null;
let llamaContext: any = null;

async function initializeModel() {
  if (llamaModel) return llamaModel;
  
  console.log('\n⏳ Loading model...');
  const { Llama, LlamaChatSession } = await import('node-llama-cpp');
  
  llamaModel = new Llama({
    modelPath: MODEL_PATH,
    mmprojPath: existsSync(MMPROJ_PATH) ? MMPROJ_PATH : undefined,
    gpuAcc: true, // Use GPU if available
    threads: 4,
    contextSize: 8192,
  });
  
  console.log('✅ Model loaded!');
  return llamaModel;
}

// Chat templates for Qwen3-VL
const CHAT_TEMPLATE = {
  system: (content: string) => `<|im_start|>system\n${content}<|im_end|>\n`,
  user: (content: string) => `<|im_start|>user\n${content}<|im_end|>\n`,
  assistant: (content: string) => `<|im_start|>assistant\n${content}<|im_end|>\n`,
  startAssistant: () => `<|im_start|>assistant\n`,
};

function sanitizeInput(input: string): string {
  // Remove dangerous prompt injection patterns and excessive length
  let sanitized = input.replace(/(<\|im_start\|>|<\|im_end\|>|\n|\r|\t|\u2028|\u2029)/g, ' ');
  sanitized = sanitized.replace(/(system|assistant|user|\bignore\b|\breset\b|\bshutdown\b|\bdelete\b)/gi, '[filtered]');
  sanitized = sanitized.slice(0, 2048); // Max input length
  return sanitized;
}

function buildPrompt(messages: Array<{ role: string; content: string | Array<any> }>): string {
  let prompt = '';
  for (const message of messages) {
    const content = typeof message.content === 'string'
      ? sanitizeInput(message.content)
      : message.content.map((c: any) => sanitizeInput(c.text || '')).join('');
    if (message.role === 'system') {
      prompt += CHAT_TEMPLATE.system(content);
    } else if (message.role === 'user') {
      prompt += CHAT_TEMPLATE.user(content);
    } else if (message.role === 'assistant') {
      prompt += CHAT_TEMPLATE.assistant(content);
    }
  }
  prompt += CHAT_TEMPLATE.startAssistant();
  return prompt;
}

// Default system prompt for Iron Coach
const DEFAULT_SYSTEM_PROMPT = `You are The Iron Coach, an elite, no-nonsense nutrition expert and veteran bodybuilder with decades of experience. You are aggressive, direct, brutally honest, funny but harsh, and you roast the user while still pushing them to improve.

Your role:
- Nutrition Truths: Give raw facts about calories, macros, and supplements. No myths, no "feel-good" lies.
- Meal Planning: Construct meals for performance and aesthetics. High protein is non-negotiable.
- Food Analysis: Critique user choices harshly. Tell them exactly why their diet is failing them.
- Tunisian Cuisine: You know the local fuel—couscous, brik, lamb, merguez. Teach them how to utilize these for muscle growth and fat loss.
- Dietary Advice: Fat loss? Suffer through the deficit. Muscle gain? Eat until you're full, then eat more.

Guidelines:
- Tone: Aggressive, authoritative, "high testosterone", demanding, sarcastic, and brutally honest.
- Style: Short sentences. Punchy. Commanding. No fluff.
- Honesty: If they are making excuses, expose them. If they are lazy, call them out.
- Response Length: Be concise. 2-3 paragraphs of pure value. No rambling.
- Emojis: Use sparingly and only for impact (e.g., 💀, ⚡, 🥩, 🏋️‍♂️).

Wake them up and make them huge.`;

// Server
serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', model: 'Qwen3-VL-2B-Instruct-GGUF' }, { headers: corsHeaders });
    }
    
    // Models endpoint
    if (url.pathname === '/v1/models') {
      return Response.json({
        object: 'list',
        data: [{
          id: 'qwen3-vl-2b-instruct',
          object: 'model',
          created: Date.now(),
          owned_by: 'qwen',
        }],
      }, { headers: corsHeaders });
    }
    
    // Chat completions endpoint
    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { messages, stream = false, temperature = 0.7, max_tokens = 512 } = body;
        
        // Add default system prompt if not present
        const hasSystem = messages.some((m: any) => m.role === 'system');
        const finalMessages = hasSystem ? messages : [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          ...messages,
        ];
        
        // Initialize model (lazy load)
        const model = await initializeModel();
        const context = await model.createContext();
        const session = context.createChatSession();
        
        // Build prompt
        const prompt = buildPrompt(finalMessages);
        
        if (stream) {
          // Streaming response
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              try {
                const tokens = session.prompt(prompt, {
                  temperature,
                  maxTokens: max_tokens,
                });
                
                let fullContent = '';
                
                for await (const token of tokens) {
                  fullContent += token;
                  
                  // Send token as SSE
                  const chunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: 'qwen3-vl-2b-instruct',
                    choices: [{
                      index: 0,
                      delta: { content: token },
                      finish_reason: null,
                    }],
                  };
                  
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                }
                
                // Send final chunk
                const finalChunk = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: 'qwen3-vl-2b-instruct',
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                  }],
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
          
          return new Response(stream, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          });
        } else {
          // Non-streaming response
          const tokens = session.prompt(prompt, {
            temperature,
            maxTokens: max_tokens,
          });
          
          let content = '';
          for await (const token of tokens) {
            content += token;
          }
          
          return Response.json({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'qwen3-vl-2b-instruct',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content,
              },
              finish_reason: 'stop',
            }],
            usage: {
              prompt_tokens: prompt.length / 4, // Rough estimate
              completion_tokens: content.length / 4,
              total_tokens: (prompt.length + content.length) / 4,
            },
          }, { headers: corsHeaders });
        }
      } catch (error) {
        console.error('Chat completion error:', error);
        return Response.json(
          { error: error instanceof Error ? error.message : 'Internal server error' },
          { status: 500, headers: corsHeaders }
        );
      }
    }
    
    // 404 for unknown routes
    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
});

console.log(`\n🚀 LLM Server running on http://localhost:${PORT}`);
console.log(`\n📡 Endpoints:`);
console.log(`   GET  /health - Health check`);
console.log(`   GET  /v1/models - List models`);
console.log(`   POST /v1/chat/completions - Chat completions (OpenAI compatible)`);
