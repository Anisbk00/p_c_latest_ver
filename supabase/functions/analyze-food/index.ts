// ═══════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: analyze-food
//
// Analyzes food photos using Groq Vision API (meta-llama/llama-4-scout-17b-16e-instruct).
// Groq provides <3s inference via LPU architecture.
//
// Environment Variables (set in Supabase Dashboard → Settings → Edge Functions → Secrets):
//   GROQ_API_KEY - Groq API key
//   SUPABASE_SERVICE_ROLE_KEY - For authorization (auto-injected)
// ═══════════════════════════════════════════════════════════════════════════════

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

const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

Deno.serve(async (req: Request) => {
  // Handle CORS
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

  // Authorization - only accept service role key
  const authHeader = req.headers.get("authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check Groq API key
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY not configured in edge function" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { image } = body;

    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid image field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse image data
    let base64Data: string;
    let mimeType: string = "image/jpeg";

    if (image.startsWith("data:")) {
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return new Response(
          JSON.stringify({ error: "Invalid image data URL format" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      mimeType = matches[1];
      base64Data = matches[2];
    } else {
      // Fetch from URL
      const imgResponse = await fetch(image, { signal: AbortSignal.timeout(10000) });
      if (!imgResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch image: ${imgResponse.status}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const arrayBuffer = await imgResponse.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      base64Data = btoa(binary);
      mimeType = imgResponse.headers.get("content-type") || "image/jpeg";
    }

    console.log(`[analyze-food] Image received: ${mimeType}, base64 length: ${base64Data.length}`);

    // Call Groq Vision API with 30s timeout (Groq is typically <3s)
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const groqPayload = {
      model: GROQ_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: FOOD_ANALYSIS_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.35,
      max_tokens: 2048,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify(groqPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!groqResponse.ok) {
        const errorData = await groqResponse.text();
        console.error("[analyze-food] Groq error:", groqResponse.status, errorData);
        return new Response(
          JSON.stringify({
            error: `Groq API error: ${groqResponse.status}`,
            details: errorData.substring(0, 500),
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const groqResult = await groqResponse.json();
      const textContent = groqResult.choices?.[0]?.message?.content;

      if (!textContent) {
        console.error("[analyze-food] No content in Groq response:", JSON.stringify(groqResult).substring(0, 500));
        return new Response(
          JSON.stringify({ error: "No analysis result from AI" }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      // Parse JSON from response
      let cleanContent = textContent.trim();
      if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
      else if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
      if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);
      cleanContent = cleanContent.trim();

      if (!cleanContent.startsWith("{")) {
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) cleanContent = jsonMatch[0];
      }

      cleanContent = cleanContent.replace(/[\r\n]+/g, " ").trim();

      const food = JSON.parse(cleanContent);

      console.log(`[analyze-food] Success: ${food.name} (${food.calories} kcal, confidence: ${food.confidence})`);

      return new Response(
        JSON.stringify({
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
          provider: "groq",
          model: GROQ_VISION_MODEL,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error("[analyze-food] Error:", error);

    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response(
        JSON.stringify({ error: "Image analysis timed out. Please try a clearer or simpler photo." }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to analyze food photo",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
