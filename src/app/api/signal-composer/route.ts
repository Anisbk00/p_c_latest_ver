import { NextRequest, NextResponse } from "next/server";

// Signal Composer API
// Algorithmic assistant that lists three precise inputs that would most improve insight confidence

interface DataGap {
  type: string;
  description: string;
  confidenceImprovement: number;
  effort: "low" | "medium" | "high";
  action: string;
}

interface UserProfile {
  goals?: Array<{ type: string; current: number; target: number }>;
  measurements?: Array<{ type: string; lastUpdated: Date }>;
  meals?: { loggedToday: boolean; consistency: number };
  workouts?: { loggedThisWeek: boolean; frequency: number };
  progressPhotos?: { lastUploaded: Date; count: number };
}

function analyzeDataGaps(profile: UserProfile): DataGap[] {
  const gaps: DataGap[] = [];

  // Check meal logging consistency
  if (!profile.meals?.loggedToday || (profile.meals?.consistency ?? 0) < 80) {
    gaps.push({
      type: "meal_log",
      description: "Log breakfast consistently",
      confidenceImprovement: 15,
      effort: "low",
      action: "Log your breakfast tomorrow morning"
    });
  }

  // Check progress photos
  const lastPhoto = profile.progressPhotos?.lastUploaded;
  const daysSinceLastPhoto = lastPhoto 
    ? Math.floor((Date.now() - new Date(lastPhoto).getTime()) / (1000 * 60 * 60 * 24))
    : 30;
  
  if (daysSinceLastPhoto > 7) {
    gaps.push({
      type: "progress_photo",
      description: "Add a progress photo this week",
      confidenceImprovement: 12,
      effort: "low",
      action: daysSinceLastPhoto > 14 
        ? "Take a progress photo today" 
        : "Schedule your weekly progress photo"
    });
  }

  // Check measurements
  const hasRecentWeight = profile.measurements?.some(
    m => m.type === "weight" && 
    (Date.now() - new Date(m.lastUpdated).getTime()) < 7 * 24 * 60 * 60 * 1000
  );
  
  if (!hasRecentWeight) {
    gaps.push({
      type: "measurement",
      description: "Log your weight this week",
      confidenceImprovement: 10,
      effort: "low",
      action: "Weigh yourself tomorrow morning"
    });
  }

  // Check food label scans
  gaps.push({
    type: "food_label",
    description: "Scan a food label for verified data",
    confidenceImprovement: 8,
    effort: "low",
    action: "Use the barcode scanner on your next packaged food"
  });

  // Check workout logging
  if (!profile.workouts?.loggedThisWeek) {
    gaps.push({
      type: "workout_log",
      description: "Log your workout sessions",
      confidenceImprovement: 7,
      effort: "low",
      action: "Record your next workout"
    });
  }

  // Check body measurements
  const hasBodyMeasurements = profile.measurements?.some(
    m => ["waist", "hips", "chest"].includes(m.type)
  );
  
  if (!hasBodyMeasurements) {
    gaps.push({
      type: "body_measurements",
      description: "Add circumference measurements",
      confidenceImprovement: 11,
      effort: "medium",
      action: "Measure your waist, hips, and chest this weekend"
    });
  }

  // Sort by confidence improvement and effort
  gaps.sort((a, b) => {
    const effortOrder = { low: 0, medium: 1, high: 2 };
    if (a.confidenceImprovement !== b.confidenceImprovement) {
      return b.confidenceImprovement - a.confidenceImprovement;
    }
    return effortOrder[a.effort] - effortOrder[b.effort];
  });

  return gaps;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userProfile, currentInsightId } = body;

    // Analyze data gaps
    const gaps = analyzeDataGaps(userProfile || {});

    // Get top 3 actions that would most improve confidence
    const topActions = gaps.slice(0, 3).map((gap, index) => ({
      rank: index + 1,
      type: gap.type,
      description: gap.description,
      confidenceImprovement: gap.confidenceImprovement,
      effort: gap.effort,
      action: gap.action,
      rationale: `Adding this data point would improve insight accuracy by ${gap.confidenceImprovement}%`
    }));

    // Calculate total potential improvement
    const totalPotentialImprovement = topActions.reduce(
      (sum, action) => sum + action.confidenceImprovement, 
      0
    );

    const result = {
      success: true,
      signalComposer: {
        targetInsight: currentInsightId || "all",
        recommendedInputs: topActions,
        totalPotentialImprovement,
        currentDataQuality: calculateDataQuality(userProfile),
        lastUpdated: new Date().toISOString()
      },
      provenance: {
        source: "algorithm",
        modelName: "Signal Composer v1",
        method: "Data gap analysis with confidence impact estimation",
        timestamp: new Date().toISOString()
      }
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error("Signal composer error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Signal composition failed" 
      },
      { status: 500 }
    );
  }
}

function calculateDataQuality(profile: UserProfile): { score: number; level: string } {
  let score = 0;
  const maxScore = 100;

  // Check various data points
  if (profile.meals?.loggedToday) score += 15;
  if ((profile.meals?.consistency ?? 0) >= 80) score += 10;
  if (profile.progressPhotos?.count && profile.progressPhotos.count > 0) score += 15;
  if (profile.measurements && profile.measurements.length > 0) score += 15;
  if (profile.workouts?.loggedThisWeek) score += 15;
  if (profile.goals && profile.goals.length > 0) score += 15;
  if (profile.progressPhotos?.lastUploaded) {
    const daysSince = Math.floor(
      (Date.now() - new Date(profile.progressPhotos.lastUploaded).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince <= 7) score += 15;
    else if (daysSince <= 14) score += 10;
    else if (daysSince <= 30) score += 5;
  }

  const level = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "needs_attention";

  return { score: Math.min(score, maxScore), level };
}

export async function GET() {
  return NextResponse.json({
    endpoint: "Signal Composer API",
    description: "Recommends specific data inputs that would most improve insight confidence",
    usage: "POST with { userProfile: object, currentInsightId?: string }",
    inputTypes: [
      "meal_log",
      "progress_photo", 
      "measurement",
      "food_label",
      "workout_log",
      "body_measurements"
    ]
  });
}
