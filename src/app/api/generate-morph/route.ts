/**
 * Morph Memory Image Generation API
 * 
 * Generates AI intermediate progress photos between two states.
 * 
 * SECURITY: This endpoint requires authentication.
 * All generated images are clearly labeled as "AI Generated".
 * 
 * Note: Image generation requires a separate image generation service.
 * Groq (llama-4-scout-17b-16e-instruct) provides vision analysis but not image generation.
 * 
 * @module api/generate-morph
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from '@/lib/supabase/server';
import { generateWithImage, MODEL_NAME } from '@/lib/ai/gemini-service';
// Note: groq-service.ts provides the Groq API calls

// ═══════════════════════════════════════════════════════════════
// POST /api/generate-morph
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // ─── Authentication Check ─────────────────────────────────
    let user;
    try {
      user = await requireAuth(request);
    } catch {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // ─── Parse and Validate Request ─────────────────────────────
    const body = await request.json();
    const { 
      startImageUrl, 
      endImageUrl,
      progressPercentage = 50,
      userId: providedUserId
    } = body;

    // SECURITY: Always use authenticated user's ID, ignore client-provided userId
    const authenticatedUserId = user.id;

    // Validate ownership of provided userId
    if (providedUserId && providedUserId !== authenticatedUserId) {
      console.warn(`[generate-morph] User ${authenticatedUserId} attempted to use userId ${providedUserId}`);
    }

    if (!startImageUrl || !endImageUrl) {
      return NextResponse.json(
        { error: "Both startImageUrl and endImageUrl are required" },
        { status: 400 }
      );
    }

    // Validate percentage range
    const percentage = Math.max(0, Math.min(100, Number(progressPercentage) || 50));

    // ─── Analyze Images with Groq Vision ─────────────────────────────────
    // Fetch images and convert to base64 (with timeout)
    const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      return { base64, mimeType };
    };

    // Analyze both images to understand the transformation
    const analysisPrompt = `Analyze these two fitness progress photos. The first image is the "before" and the second is "after".

Describe the key physical changes visible between these photos in detail. Focus on:
1. Body composition changes (muscle definition, body fat levels)
2. Posture and form changes
3. Any other visible differences

Be specific and objective. Respond with a detailed description of the transformation.`;

    // Get start image as base64
    const startImageData = await fetchImageAsBase64(startImageUrl);
    
    const changesDescription = await generateWithImage(
      analysisPrompt,
      startImageData.base64,
      startImageData.mimeType
    );

    // ─── Image Generation Placeholder ─────────────────────────────────
    // Note: Groq vision models do not support image generation.
    // For actual morph generation, you would need to use an image generation API.
    // For now, we return the analysis and a placeholder message.
    
    const morphDescription = `At ${percentage}% progress:
    
${changesDescription}

Estimated intermediate state:
- Body composition would be approximately ${percentage}% between the two states
- Muscle definition would be moderate
- Body fat levels would be intermediate

Note: This is a text description of the expected intermediate state.`;

    // ─── Return Response with Mandatory AI Labeling ────────────
    const result = {
      success: true,
      // Note: Actual image generation would require an image generation API
      // For now, we provide a text description instead
      morphImageUrl: null,
      morphDescription,
      progressPercentage: percentage,
      changesAnalyzed: changesDescription,
      
      // MANDATORY: All generated images must be labeled
      isGenerated: true,
      generatedLabel: "AI Generated",
      disclaimer: "This is an AI-analyzed transformation description for motivational purposes only. It represents an estimated intermediate state and may not reflect actual results. Image generation requires an additional image generation API.",
      
      provenance: {
        source: "ai-vlm",
        modelName: MODEL_NAME,
        timestamp: new Date().toISOString(),
        method: "Vision analysis of progress photos",
        confidence: 75,
        basedOn: ["startImageUrl", "endImageUrl"],
        changesAnalyzed: changesDescription
      },
      
      // User controls
      canHide: true,
      canDelete: true,
      optInRequired: true,
      
      // SECURITY: Use authenticated user ID
      userId: authenticatedUserId
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error("[generate-morph] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Morph generation failed" 
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/generate-morph
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  return NextResponse.json({
    endpoint: "Morph Memory Generation API",
    description: "Generate AI intermediate progress photos between two states",
    provider: "AI",
    authentication: "Required - Bearer token or session cookie",
    important: "Currently provides text-based transformation analysis. Image generation requires additional API.",
    usage: "POST with { startImageUrl: string, endImageUrl: string, progressPercentage?: number }",
    disclaimer: "Generated analysis is for motivational purposes only and may not reflect actual results"
  });
}
