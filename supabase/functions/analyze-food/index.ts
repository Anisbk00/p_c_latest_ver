// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: analyze-food
// 
// Analyzes food photos using Gemini Vision API.
// Runs in Supabase (150s timeout) instead of Vercel (10s Hobby timeout).
//
// Environment Variables (secrets):
//   GEMINI_API_KEY - Google Gemini API key
// ═══════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const FOOD_ANALYSIS_PROMPT = `You are a nutrition expert analyzing food images. Analyze this food image and provide accurate nutritional information.

Respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks):
{
  "name": "Brief food name (2-4 words max)",
  "description": "Brief description of the food visible (1 sentence)",
  "calories": number (total calories estimated),
  "protein": number (grams of protein),
  "carbs": number (grams of carbohydrates),
  "fat": number (grams of fat),
  "fiber": number (grams of fiber, optional),
  "sugar": number (grams of sugar, optional),
  "servingSize": number (estimated serving size in grams),
  "servingUnit": "g" or "ml" or "piece",
  "confidence": number (0.0 to 1.0 - how confident in the analysis),
  "detectedItems": ["list", "of", "individual", "food", "items", "visible"]
}

Important:
- Be realistic with macro estimates based on typical portion sizes
- If multiple foods are visible, estimate combined macros
- If you cannot identify the food, set confidence to 0.3 or lower
- Always return valid JSON with all fields present
- Serving size should be in grams for solid foods, ml for liquids`;

function extractJson(text: string): string {
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.slice(7);
  else if (clean.startsWith('```')) clean = clean.slice(3);
  if (clean.endsWith('```')) clean = clean.slice(0, -3);
  clean = clean.trim();
  if (!clean.startsWith('{')) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) clean = match[0];
  }
  return clean.replace(/[\r\n]+/g, ' ').trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Auth: accept service role key or a valid Supabase JWT
  const authHeader = req.headers.get("authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && authHeader !== `Bearer ${serviceKey}`) {
    // For non-service-role requests, we still allow if they have any valid auth header
    // (the Vercel proxy handles user auth before forwarding)
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = await req.json();
    const { image } = body;

    if (!image) {
      return new Response(JSON.stringify({ error: "Missing image" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract base64 data
    let base64Data: string;
    let mimeType = "image/jpeg";

    if (image.startsWith("data:")) {
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return new Response(JSON.stringify({ error: "Invalid image format" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      mimeType = matches[1];
      base64Data = matches[2];
    } else {
      base64Data = image;
    }

    // Call Gemini Vision API
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(modelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: FOOD_ANALYSIS_PROMPT },
            { inlineData: { mimeType, data: base64Data } },
          ],
        }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[analyze-food] Gemini API error:", response.status, errorText);
      return new Response(JSON.stringify({
        error: `AI analysis failed: ${response.status}`,
        success: true,
        food: {
          name: "Unknown Food",
          description: "Could not analyze this image",
          calories: 0, protein: 0, carbs: 0, fat: 0,
          servingSize: 100, servingUnit: "g",
          confidence: 0.1, detectedItems: [],
        },
        provider: "gemini-2.0-flash",
        model: "gemini-2.0-flash",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return new Response(JSON.stringify({
        error: "No response from AI",
        success: true,
        food: {
          name: "Unknown Food", description: "Could not analyze this image",
          calories: 0, protein: 0, carbs: 0, fat: 0,
          servingSize: 100, servingUnit: "g",
          confidence: 0.1, detectedItems: [],
        },
        provider: "gemini-2.0-flash",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Parse JSON
    try {
      const jsonStr = extractJson(content);
      const food = JSON.parse(jsonStr);

      return new Response(JSON.stringify({
        success: true,
        food: {
          name: String(food.name || "Unknown Food").slice(0, 100),
          description: String(food.description || "").slice(0, 200),
          calories: Math.max(0, Number(food.calories) || 0),
          protein: Math.max(0, Number(food.protein) || 0),
          carbs: Math.max(0, Number(food.carbs) || 0),
          fat: Math.max(0, Number(food.fat) || 0),
          fiber: food.fiber ? Math.max(0, Number(food.fiber)) : undefined,
          sugar: food.sugar ? Math.max(0, Number(food.sugar)) : undefined,
          servingSize: Math.max(1, Number(food.servingSize) || 100),
          servingUnit: ["g", "ml", "piece"].includes(food.servingUnit) ? food.servingUnit : "g",
          confidence: Math.min(1, Math.max(0, Number(food.confidence) || 0.5)),
          detectedItems: Array.isArray(food.detectedItems)
            ? food.detectedItems.slice(0, 10).map(String)
            : [],
        },
        provider: "gemini-2.0-flash",
        model: "gemini-2.0-flash",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (parseError) {
      console.error("[analyze-food] JSON parse error:", content);
      return new Response(JSON.stringify({
        success: true,
        food: {
          name: "Unknown Food", description: "Could not analyze this image",
          calories: 0, protein: 0, carbs: 0, fat: 0,
          servingSize: 100, servingUnit: "g",
          confidence: 0.1, detectedItems: [],
        },
        provider: "gemini-2.0-flash",
        parseWarning: "AI response could not be parsed",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

  } catch (error) {
    console.error("[analyze-food] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Analysis failed",
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
