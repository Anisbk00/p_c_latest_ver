import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser } from "@/lib/supabase/supabase-data";
import { XPService, XP_REWARDS, type XPAction } from "@/lib/xp-service";
import { checkRateLimit } from "@/lib/rate-limit";

// Rate limit for XP awards: max 50 per hour per user
const XP_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 50 };

// POST - Award XP for an action (with rate limiting and validation)
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();

    // Rate limiting - prevent XP spam (user ID-based)
    const rateLimitKey = `xp_award:${user.id}`;
    const rateCheck = checkRateLimit(rateLimitKey, XP_RATE_LIMIT);
    
    if (!rateCheck.success) {
      console.warn(`[XP API] Rate limited user ${user.id} - ${rateCheck.remaining} awards remaining`);
      return NextResponse.json(
        { error: "Too many XP requests. Please try again later.", retryAfter: Math.ceil(rateCheck.retryAfter / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfter / 1000)) } }
      );
    }

    const body = await request.json();
    const { action, referenceId, description } = body as {
      action: XPAction;
      referenceId?: string;
      description?: string;
    };

    // Validate action
    if (!action || !(action in XP_REWARDS)) {
      return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
    }

    // Use centralized XP service
    const xpService = new XPService(supabase);
    const result = await xpService.awardXP({
      userId: user.id,
      action,
      referenceId,
      description,
    });

    if (!result.success) {
      console.error("[XP API] Error awarding XP:", result.error);
      return NextResponse.json({ error: result.error || "Failed to award XP" }, { status: 500 });
    }

    // Check achievements and streaks after XP award
    xpService.checkAchievements(user.id).catch(() => {});

    return NextResponse.json({
      success: true,
      xp: result.xp,
      level: result.level,
      leveledUp: result.leveledUp,
      awarded: result.awarded,
      action,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error("[XP API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET - Get user's XP stats and recent transactions (with validation)
export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();

    // Get current XP and level from profiles table with validation
    const { data: profile, error: profileError } = await (supabase
      .from("profiles") as any)
      .select("xp, level")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[XP API] Error fetching profile:", profileError);
    }

    // Validate and sanitize XP data
    const rawXp = profile?.xp;
    const rawLevel = profile?.level;
    
    // Ensure XP is a valid non-negative integer
    const xp = typeof rawXp === 'number' && rawXp >= 0 ? Math.floor(rawXp) : 0;
    
    // Recalculate expected level from XP (validation)
    const expectedLevel = Math.floor(xp / 100) + 1;
    const storedLevel = typeof rawLevel === 'number' && rawLevel >= 1 ? Math.floor(rawLevel) : 1;
    
    // Use expected level if stored level is inconsistent
    const level = storedLevel !== expectedLevel ? expectedLevel : storedLevel;
    
    // Log inconsistency for debugging
    if (storedLevel !== expectedLevel) {
      console.warn(`[XP API] Level mismatch for user ${user.id}: stored=${storedLevel}, expected=${expectedLevel}, xp=${xp}`);
    }
    
    const xpForCurrentLevel = (level - 1) * 100;
    const xpProgress = xp - xpForCurrentLevel;
    const xpToNextLevel = 100;
    const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpToNextLevel) * 100));

    // Get recent transactions (last 20) with pagination support
    let transactions: any[] = [];
    try {
      const { data: txData } = await (supabase
        .from("xp_transactions") as any)
        .select("id, amount, action_type, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      transactions = txData || [];
    } catch {
      // xp_transactions table may not exist yet — non-fatal
    }

    return NextResponse.json({
      xp,
      level,
      xpProgress,
      xpNeeded: xpToNextLevel,
      xpToNextLevel,
      progressPercent,
      transactions,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error("[XP API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
