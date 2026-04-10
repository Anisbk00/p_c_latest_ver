/**
 * Iron Coach Tools API
 * 
 * Exposes deterministic calculation tools for validated numeric outputs.
 * All responses include provenance with formula used and confidence scores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { 
  executeTool, 
  calcCalories, 
  calcTDEE, 
  calcMacros, 
  calcPace, 
  summarizeNutrition 
} from '@/lib/iron-coach/tools';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { tool, params } = body;

    if (!tool) {
      return NextResponse.json({ error: 'Tool name required' }, { status: 400 });
    }

    // Execute the requested tool
    const result = await executeTool(tool, params);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Tool execution error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Tool execution failed',
        provenance: {
          tool: 'unknown',
          formula: 'error',
          calculatedAt: new Date().toISOString(),
          modelVersion: 'iron-coach-tools-v1.0',
          deterministic: false
        }
      }, 
      { status: 500 }
    );
  }
}

// GET: List available tools
export async function GET() {
  return NextResponse.json({
    tools: [
      {
        name: 'calc_calories',
        description: 'Calculate calories burned during activity',
        params: {
          weightKg: 'number (required)',
          durationMin: 'number (required)',
          activityType: 'string (optional)',
          met: 'number (optional)',
          avgHr: 'number (optional)'
        }
      },
      {
        name: 'calc_tdee',
        description: 'Calculate Total Daily Energy Expenditure',
        params: {
          weightKg: 'number (required)',
          heightCm: 'number (optional)',
          age: 'number (optional)',
          biologicalSex: 'string (optional)',
          activityLevel: 'string (optional)'
        }
      },
      {
        name: 'calc_macros',
        description: 'Calculate macronutrient targets',
        params: {
          targetCalories: 'number (required)',
          goal: 'string (optional): fat_loss, muscle_gain, maintenance, recomposition',
          bodyweightKg: 'number (optional)'
        }
      },
      {
        name: 'calc_pace',
        description: 'Calculate running/cycling pace',
        params: {
          distanceKm: 'number (required)',
          durationMin: 'number (required)'
        }
      },
      {
        name: 'summarize_nutrition',
        description: 'Summarize nutrition data from entries',
        params: {
          entries: 'Array<{ calories, protein, carbs, fat }>'
        }
      }
    ]
  });
}
