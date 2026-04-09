"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  Camera,
  Scale,
  Utensils,
  Target,
  Sparkles,
  Shield,
  Check,
  SkipForward,
  Upload,
  Watch,
  Bell,
  MessageCircle,
  Info,
  User,
  Ruler,
  Calendar,
  Heart,
  Flame,
  TrendingUp,
  Activity,
  Zap,
  Lock,
  Eye,
  EyeOff,
  Brain,
  Coffee,
  Salad,
  Pizza,
  Soup,
  Cookie,
  Apple,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProvenanceTag } from "@/components/fitness/provenance-tag";
import { ConfidenceBadge } from "@/components/fitness/confidence-badge";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/mobile-api";

// ============================================
// Types
// ============================================

export type FitnessGoal = "fat_loss" | "recomposition" | "muscle_gain" | "performance" | "maintenance";
export type SensitivityLevel = "conservative" | "moderate" | "aggressive";
export type CoachingTone = "strict" | "analytical" | "supportive" | "minimal";

export interface OnboardingData {
  // Screen 0 - Welcome (no data, just shown)
  
  // Screen 1 - Core Identity
  displayName: string | null;
  birthYear: number | null;
  sexAtBirth: "male" | "female" | "other" | null;
  heightCm: number | null;
  
  // Screen 2 - Primary Goal
  primaryGoal: FitnessGoal | null;
  targetWeight: number | null;
  sensitivityLevel: SensitivityLevel;
  
  // Screen 3 - Baseline
  currentWeight: number | null;
  hasProgressPhoto: boolean;
  progressPhotoUrl: string | null;
  progressPhotoId: string | null;
  progressPhotoAnalysis: Record<string, unknown> | null;
  
  // Screen 4 - Food Preferences
  cuisines: string[];
  dietaryTags: string[];
  allergies: string[];
  staples: string[];
  addLocalFavoritesLater: boolean;
  
  // Screen 5 - Behavior Settings
  enableMealScanner: boolean;
  connectWearable: boolean;
  enablePhotoReminders: boolean;
  coachingTone: CoachingTone;
  
  // Privacy consent
  hasConsent: boolean;
  enableMorphFeatures: boolean;
  
  // Metadata
  skippedFields: string[];
  completedAt: Date | null;
  firstAction: "photo" | "meal" | null;
}

export interface OnboardingFlowProps {
  onComplete?: (data: OnboardingData) => void;
  onSkip?: () => void;
  forceShow?: boolean;
}

const defaultOnboardingData: OnboardingData = {
  displayName: null,
  birthYear: null,
  sexAtBirth: null,
  heightCm: null,
  primaryGoal: null,
  targetWeight: null,
  sensitivityLevel: "moderate",
  currentWeight: null,
  hasProgressPhoto: false,
  progressPhotoUrl: null,
  progressPhotoId: null,
  progressPhotoAnalysis: null,
  cuisines: [],
  dietaryTags: [],
  allergies: [],
  staples: [],
  addLocalFavoritesLater: true,
  enableMealScanner: true,
  connectWearable: false,
  enablePhotoReminders: true,
  coachingTone: "analytical",
  hasConsent: false,
  enableMorphFeatures: true,
  skippedFields: [],
  completedAt: null,
  firstAction: null,
};

const ONBOARDING_STORAGE_KEY = "progress-companion-onboarding";

// ============================================
// Utility Functions
// ============================================

function saveToLocalStorage(data: OnboardingData): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(data));
  }
}

function loadFromLocalStorage(): OnboardingData | null {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function clearLocalStorage(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  }
}

function validateBirthYear(year: number): { valid: boolean; message?: string } {
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  
  if (year < 1920) {
    return { valid: false, message: "Please enter a valid birth year" };
  }
  if (age < 13) {
    return { valid: false, message: "You must be at least 13 years old" };
  }
  if (age > 120) {
    return { valid: false, message: "Please enter a valid birth year" };
  }
  return { valid: true };
}

function validateHeight(cm: number): { valid: boolean; message?: string } {
  if (cm < 100) {
    return { valid: false, message: "Height seems too short. Please check the value." };
  }
  if (cm > 250) {
    return { valid: false, message: "Height seems too tall. Please check the value." };
  }
  return { valid: true };
}

function validateWeight(kg: number): { valid: boolean; message?: string } {
  if (kg < 30) {
    return { valid: false, message: "Weight seems too low. Please check the value." };
  }
  if (kg > 300) {
    return { valid: false, message: "Weight seems too high. Please check the value." };
  }
  return { valid: true };
}

// ============================================
// Constants
// ============================================

const CUISINE_OPTIONS = [
  { id: "mediterranean", label: "Mediterranean", icon: Salad },
  { id: "asian", label: "Asian", icon: Soup },
  { id: "american", label: "American", icon: Pizza },
  { id: "mexican", label: "Mexican", icon: Flame },
  { id: "indian", label: "Indian", icon: Soup },
  { id: "middle_eastern", label: "Middle Eastern", icon: Coffee },
];

const DIETARY_TAGS = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "keto", label: "Keto" },
  { id: "low_carb", label: "Low Carb" },
  { id: "high_protein", label: "High Protein" },
  { id: "paleo", label: "Paleo" },
];

const ALLERGY_OPTIONS = [
  { id: "gluten", label: "Gluten" },
  { id: "dairy", label: "Dairy" },
  { id: "nuts", label: "Nuts" },
  { id: "soy", label: "Soy" },
  { id: "eggs", label: "Eggs" },
  { id: "shellfish", label: "Shellfish" },
];

const STAPLE_OPTIONS = [
  { id: "rice", label: "Rice", icon: Cookie },
  { id: "pasta", label: "Pasta", icon: Pizza },
  { id: "bread", label: "Bread", icon: Cookie },
  { id: "oats", label: "Oats", icon: Apple },
  { id: "potatoes", label: "Potatoes", icon: Apple },
  { id: "chicken", label: "Chicken", icon: Utensils },
];

const GOAL_CONFIG: Record<FitnessGoal, { label: string; description: string; icon: React.ElementType; gradient: string }> = {
  fat_loss: { 
    label: "Fat Loss", 
    description: "Reduce body fat while preserving muscle",
    icon: Flame,
    gradient: "from-orange-500/20 to-red-500/20"
  },
  recomposition: { 
    label: "Recomposition", 
    description: "Build muscle while losing fat",
    icon: Activity,
    gradient: "from-purple-500/20 to-pink-500/20"
  },
  muscle_gain: { 
    label: "Muscle Gain", 
    description: "Build muscle mass and strength",
    icon: TrendingUp,
    gradient: "from-blue-500/20 to-cyan-500/20"
  },
  performance: { 
    label: "Performance", 
    description: "Optimize athletic performance",
    icon: Zap,
    gradient: "from-amber-500/20 to-yellow-500/20"
  },
  maintenance: { 
    label: "Maintenance", 
    description: "Maintain current physique",
    icon: Target,
    gradient: "from-emerald-500/20 to-teal-500/20"
  },
};

const COACHING_TONE_CONFIG: Record<CoachingTone, { label: string; description: string; preview: string }> = {
  strict: {
    label: "Strict",
    description: "Direct, no-nonsense approach",
    preview: "You missed protein by 15g. Fix it tomorrow."
  },
  analytical: {
    label: "Analytical",
    description: "Data-driven insights",
    preview: "Your protein was 15g below target. This may slow muscle synthesis by ~8%."
  },
  supportive: {
    label: "Supportive",
    description: "Encouraging and positive",
    preview: "Great effort today! Tomorrow let's try to hit that protein goal together."
  },
  minimal: {
    label: "Minimal",
    description: "Only essential updates",
    preview: "Protein: 135/150g"
  },
};

// ============================================
// Screen Components
// ============================================

// Screen 0 - Welcome
function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center"
    >
      {/* Logo Animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="relative mb-8"
      >
        <div className="w-24 h-24 rounded-3xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/30">
          <Activity className="w-12 h-12 text-white" />
        </div>
        <motion.div
          className="absolute -inset-4 rounded-4xl border-2 border-emerald-500/20"
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-3xl font-bold mb-3 tracking-tight"
      >
        Progress Companion
      </motion.h1>

      {/* Purpose Line */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-lg text-muted-foreground mb-8 max-w-xs"
      >
        Show what changed, why, and next step.
      </motion.p>

      {/* Privacy Note */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-2 text-sm text-muted-foreground mb-12"
      >
        <Lock className="w-4 h-4" />
        <span>Privacy-first. Data stays private unless you share.</span>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-xs"
      >
        <Button
          onClick={onNext}
          className="w-full h-14 rounded-2xl text-lg font-semibold bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25"
        >
          Get started
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
      </motion.div>
    </motion.div>
  );
}

// Screen 1 - Core Identity
function CoreIdentityScreen({
  data,
  onUpdate,
  onNext,
  onSkip,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const currentYear = new Date().getFullYear();

  const handleContinue = () => {
    const newErrors: Record<string, string> = {};
    
    // Validate height if provided
    if (data.heightCm !== null) {
      const heightValidation = validateHeight(data.heightCm);
      if (!heightValidation.valid) {
        newErrors.heightCm = heightValidation.message!;
      }
    }
    
    // Validate birth year if provided
    if (data.birthYear !== null) {
      const yearValidation = validateBirthYear(data.birthYear);
      if (!yearValidation.valid) {
        newErrors.birthYear = yearValidation.message!;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Track skipped fields
    const skipped: string[] = [];
    if (!data.displayName) skipped.push("displayName");
    if (!data.birthYear) skipped.push("birthYear");
    if (!data.sexAtBirth) skipped.push("sexAtBirth");
    if (!data.heightCm) skipped.push("heightCm");
    
    onUpdate({ skippedFields: [...data.skippedFields, ...skipped] });
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col min-h-[70vh] px-6 py-4"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Let&apos;s get to know you</h2>
        <p className="text-muted-foreground">This helps personalize your experience.</p>
      </div>

      {/* Form */}
      <div className="space-y-5 flex-1">
        {/* Display Name */}
        <div className="space-y-2">
          <Label htmlFor="displayName" className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            Display Name
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </Label>
          <Input
            id="displayName"
            placeholder="How should we call you?"
            value={data.displayName || ""}
            onChange={(e) => onUpdate({ displayName: e.target.value || null })}
            className="h-12 rounded-xl"
          />
        </div>

        {/* Birth Year */}
        <div className="space-y-2">
          <Label htmlFor="birthYear" className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            Birth Year
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </Label>
          <Input
            id="birthYear"
            type="number"
            placeholder={`e.g., ${currentYear - 25}`}
            value={data.birthYear || ""}
            onChange={(e) => onUpdate({ birthYear: e.target.value ? parseInt(e.target.value) : null })}
            className={cn("h-12 rounded-xl", errors.birthYear && "border-red-500")}
          />
          {errors.birthYear && (
            <p className="text-sm text-red-500">{errors.birthYear}</p>
          )}
        </div>

        {/* Sex at Birth */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-muted-foreground" />
            Sex at Birth
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {["male", "female", "other"].map((sex) => (
              <button
                key={sex}
                onClick={() => onUpdate({ sexAtBirth: sex as typeof data.sexAtBirth })}
                className={cn(
                  "h-12 rounded-xl font-medium transition-all capitalize",
                  data.sexAtBirth === sex
                    ? "bg-emerald-500 text-white"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {sex}
              </button>
            ))}
          </div>
        </div>

        {/* Height */}
        <div className="space-y-2">
          <Label htmlFor="height" className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-muted-foreground" />
            Height (cm)
          </Label>
          <Input
            id="height"
            type="number"
            placeholder="e.g., 175"
            value={data.heightCm || ""}
            onChange={(e) => onUpdate({ heightCm: e.target.value ? parseFloat(e.target.value) : null })}
            className={cn("h-12 rounded-xl", errors.heightCm && "border-red-500")}
          />
          {errors.heightCm && (
            <p className="text-sm text-red-500">{errors.heightCm}</p>
          )}
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="w-3 h-3" />
            Height used for body-composition estimates.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-6">
        <Button
          onClick={handleContinue}
          className="w-full h-14 rounded-2xl text-lg font-semibold bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
        >
          Continue
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full text-muted-foreground"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          Skip for now
        </Button>
      </div>
    </motion.div>
  );
}

// Screen 2 - Primary Goal
function PrimaryGoalScreen({
  data,
  onUpdate,
  onNext,
  onSkip,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [targetSlider, setTargetSlider] = useState(data.targetWeight || 70);

  const handleContinue = () => {
    // Track skipped fields
    const skipped: string[] = [];
    if (!data.primaryGoal) skipped.push("primaryGoal");
    
    onUpdate({ 
      skippedFields: [...data.skippedFields, ...skipped],
      targetWeight: targetSlider 
    });
    onNext();
  };

  const getGoalMicrocopy = () => {
    if (!data.primaryGoal) return null;
    
    const goalConfig = GOAL_CONFIG[data.primaryGoal];
    const weeks = data.sensitivityLevel === "conservative" ? 20 : 
                  data.sensitivityLevel === "aggressive" ? 12 : 16;
    
    return `Selected: ${goalConfig.label} — Target: ${data.primaryGoal === "fat_loss" ? "−" : "+"}${targetSlider} kg in ${weeks} weeks (${data.sensitivityLevel}).`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col min-h-[70vh] px-6 py-4"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">What&apos;s your primary goal?</h2>
        <p className="text-muted-foreground">We&apos;ll tailor recommendations based on your goal.</p>
      </div>

      {/* Goal Selection */}
      <div className="space-y-3 flex-1">
        <div className="grid gap-3">
          {(Object.keys(GOAL_CONFIG) as FitnessGoal[]).map((goal) => {
            const config = GOAL_CONFIG[goal];
            const Icon = config.icon;
            const isSelected = data.primaryGoal === goal;
            
            return (
              <motion.button
                key={goal}
                whileTap={{ scale: 0.98 }}
                onClick={() => onUpdate({ primaryGoal: goal })}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl transition-all text-left",
                  isSelected
                    ? `bg-linear-to-r ${config.gradient} border-2 border-emerald-500`
                    : "bg-muted/50 border-2 border-transparent hover:bg-muted"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  isSelected ? "bg-emerald-500 text-white" : "bg-muted"
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{config.label}</p>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                </div>
                {isSelected && (
                  <Check className="w-5 h-5 text-emerald-500" />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Target Weight Slider */}
        {data.primaryGoal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-2xl bg-muted/50"
          >
            <Label className="mb-4 block">
              Target Change: {data.primaryGoal === "fat_loss" ? "−" : "+"}{targetSlider} kg
            </Label>
            <Slider
              value={[targetSlider]}
              onValueChange={(v) => setTargetSlider(v[0])}
              min={1}
              max={20}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1 kg</span>
              <span>20 kg</span>
            </div>
          </motion.div>
        )}

        {/* Sensitivity Selector */}
        {data.primaryGoal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4"
          >
            <Label className="mb-3 block">Approach</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["conservative", "moderate", "aggressive"] as SensitivityLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => onUpdate({ sensitivityLevel: level })}
                  className={cn(
                    "h-12 rounded-xl font-medium capitalize transition-all",
                    data.sensitivityLevel === level
                      ? "bg-emerald-500 text-white"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Microcopy */}
        {data.primaryGoal && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-muted-foreground mt-4 flex items-center gap-2"
          >
            <Target className="w-4 h-4 text-emerald-500" />
            {getGoalMicrocopy()}
          </motion.p>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-6">
        <Button
          onClick={handleContinue}
          className="w-full h-14 rounded-2xl text-lg font-semibold bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
        >
          Set goal
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full text-muted-foreground"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          Skip for now
        </Button>
      </div>
    </motion.div>
  );
}

// Screen 3 - Baseline & First Data
function BaselineScreen({
  data,
  onUpdate,
  onNext,
  onSkip,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleWeightChange = (value: string) => {
    const weight = value ? parseFloat(value) : null;
    if (weight !== null) {
      const validation = validateWeight(weight);
      if (!validation.valid) {
        setErrors({ ...errors, weight: validation.message! });
      } else {
        const newErrors = { ...errors };
        delete newErrors.weight;
        setErrors(newErrors);
      }
    }
    onUpdate({ currentWeight: weight });
  };

  const handlePhotoUpload = () => {
    // Trigger file input click
    const fileInput = document.getElementById('progress-photo-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handlePhotoFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedTypes.includes(file.type)) {
      console.error('Invalid file type');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      console.error('File too large');
      return;
    }

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('photoType', 'progress');
      formData.append('capturedAt', new Date().toISOString());
      formData.append('lighting', 'moderate');
      formData.append('pose', 'front');
      formData.append('clothing', 'light');

      // Upload to API
      const response = await apiFetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      // Update state with uploaded photo info
      onUpdate({ 
        hasProgressPhoto: true, 
        progressPhotoUrl: result.photo?.imageUrl || result.imageUrl,
        progressPhotoId: result.photo?.id || result.photoId,
        progressPhotoAnalysis: result.analysis || null,
      });
    } catch (error) {
      console.error('Photo upload failed:', error);
      // Still mark as uploaded for now (development fallback)
      onUpdate({ 
        hasProgressPhoto: true, 
        progressPhotoUrl: "#uploaded" 
      });
    }
  };

  const handleContinue = () => {
    // Track skipped fields
    const skipped: string[] = [];
    if (!data.currentWeight) skipped.push("currentWeight");
    if (!data.hasProgressPhoto) skipped.push("progressPhoto");
    
    onUpdate({ skippedFields: [...data.skippedFields, ...skipped] });
    onNext();
  };

  const hasAnyData = data.currentWeight !== null || data.hasProgressPhoto;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col min-h-[70vh] px-6 py-4"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Let&apos;s establish your baseline</h2>
        <p className="text-muted-foreground">Add your first data to start tracking progress.</p>
      </div>

      {/* Two Primary Actions */}
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Log Weight */}
          <Card className={cn(
            "relative overflow-hidden transition-all",
            data.currentWeight && "border-emerald-500 border-2"
          )}>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center mb-3",
                data.currentWeight ? "bg-emerald-500 text-white" : "bg-muted"
              )}>
                <Scale className="w-7 h-7" />
              </div>
              <p className="font-semibold mb-2">Log Weight</p>
              <Input
                type="number"
                placeholder="kg"
                value={data.currentWeight || ""}
                onChange={(e) => handleWeightChange(e.target.value)}
                className={cn(
                  "h-10 text-center rounded-xl",
                  errors.weight && "border-red-500"
                )}
              />
              {errors.weight && (
                <p className="text-xs text-red-500 mt-1">{errors.weight}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Weight (kg). Used for trend insights.
              </p>
              {data.currentWeight && (
                <Badge variant="secondary" className="mt-2 bg-emerald-100 text-emerald-700">
                  <Check className="w-3 h-3 mr-1" />
                  Logged
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Upload Photo */}
          <Card className={cn(
            "relative overflow-hidden transition-all",
            data.hasProgressPhoto && "border-emerald-500 border-2"
          )}>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center mb-3",
                data.hasProgressPhoto ? "bg-emerald-500 text-white" : "bg-muted"
              )}>
                <Camera className="w-7 h-7" />
              </div>
              <p className="font-semibold mb-2">Progress Photo</p>
              <Button
                variant="outline"
                onClick={handlePhotoUpload}
                className="h-10 rounded-xl"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
              {/* Hidden file input for photo upload */}
              <input
                id="progress-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={handlePhotoFileSelect}
                aria-label="Upload progress photo"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Stand 1.5m back, minimal bulky clothing. Front pose.
              </p>
              {data.hasProgressPhoto && (
                <Badge variant="secondary" className="mt-2 bg-emerald-100 text-emerald-700">
                  <Check className="w-3 h-3 mr-1" />
                  Uploaded
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Provenance UI for any inferred value */}
        {data.currentWeight && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-muted/50 flex items-center gap-2"
          >
            <ProvenanceTag
              source="manual"
              timestamp={new Date()}
              rationale="User-entered weight for baseline"
            />
            <span className="text-sm text-muted-foreground">
              Baseline weight recorded
            </span>
          </motion.div>
        )}

        {/* Skip Warning */}
        {!hasAnyData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
          >
            <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Add a weight or photo to activate full insights.
            </p>
          </motion.div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-6">
        <Button
          onClick={handleContinue}
          className="w-full h-14 rounded-2xl text-lg font-semibold bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
        >
          Continue
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full text-muted-foreground"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          Skip for now
        </Button>
      </div>
    </motion.div>
  );
}

// Screen 4 - Food & Preferences
function FoodPreferencesScreen({
  data,
  onUpdate,
  onNext,
  onSkip,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const toggleItem = (field: "cuisines" | "dietaryTags" | "allergies" | "staples", item: string) => {
    const current = data[field];
    const updated = current.includes(item)
      ? current.filter((i) => i !== item)
      : [...current, item];
    onUpdate({ [field]: updated });
  };

  const handleContinue = () => {
    onUpdate({ skippedFields: [...data.skippedFields] });
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col min-h-[70vh] px-6 py-4"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Food preferences</h2>
        <p className="text-muted-foreground">This helps cultural swaps and food suggestions.</p>
      </div>

      {/* Preferences */}
      <div className="flex-1 space-y-6 overflow-y-auto pb-4">
        {/* Cuisines */}
        <div>
          <Label className="mb-3 block">Favorite Cuisines</Label>
          <div className="grid grid-cols-2 gap-2">
            {CUISINE_OPTIONS.map((cuisine) => {
              const Icon = cuisine.icon;
              const isSelected = data.cuisines.includes(cuisine.id);
              return (
                <button
                  key={cuisine.id}
                  onClick={() => toggleItem("cuisines", cuisine.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl transition-all text-left",
                    isSelected
                      ? "bg-emerald-500/20 border-2 border-emerald-500"
                      : "bg-muted/50 border-2 border-transparent"
                  )}
                >
                  <Icon className={cn(
                    "w-4 h-4",
                    isSelected ? "text-emerald-500" : "text-muted-foreground"
                  )} />
                  <span className="text-sm font-medium">{cuisine.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dietary Tags */}
        <div>
          <Label className="mb-3 block">Dietary Preferences</Label>
          <div className="flex flex-wrap gap-2">
            {DIETARY_TAGS.map((tag) => {
              const isSelected = data.dietaryTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleItem("dietaryTags", tag.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    isSelected
                      ? "bg-emerald-500 text-white"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Allergies */}
        <div>
          <Label className="mb-3 block">Allergies & Intolerances</Label>
          <div className="flex flex-wrap gap-2">
            {ALLERGY_OPTIONS.map((allergy) => {
              const isSelected = data.allergies.includes(allergy.id);
              return (
                <button
                  key={allergy.id}
                  onClick={() => toggleItem("allergies", allergy.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    isSelected
                      ? "bg-red-500 text-white"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {allergy.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Staples */}
        <div>
          <Label className="mb-3 block">Common Staples</Label>
          <div className="flex flex-wrap gap-2">
            {STAPLE_OPTIONS.map((staple) => {
              const Icon = staple.icon;
              const isSelected = data.staples.includes(staple.id);
              return (
                <button
                  key={staple.id}
                  onClick={() => toggleItem("staples", staple.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                    isSelected
                      ? "bg-amber-500 text-white"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {staple.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Local Favorites Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
          <div>
            <p className="font-medium">Add local favorites later</p>
            <p className="text-sm text-muted-foreground">We&apos;ll suggest based on your location</p>
          </div>
          <Switch
            checked={data.addLocalFavoritesLater}
            onCheckedChange={(checked) => onUpdate({ addLocalFavoritesLater: checked })}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-4">
        <Button
          onClick={handleContinue}
          className="w-full h-14 rounded-2xl text-lg font-semibold bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
        >
          Continue
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full text-muted-foreground"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          Skip for now
        </Button>
      </div>
    </motion.div>
  );
}

// Screen 5 - Behavior & Integration Preferences
function BehaviorSettingsScreen({
  data,
  onUpdate,
  onNext,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
}) {
  const [selectedTone, setSelectedTone] = useState<CoachingTone>(data.coachingTone);

  const handleFinish = () => {
    onUpdate({ coachingTone: selectedTone });
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col min-h-[70vh] px-6 py-4"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Final touches</h2>
        <p className="text-muted-foreground">Configure your experience preferences.</p>
      </div>

      {/* Settings */}
      <div className="flex-1 space-y-6">
        {/* Toggles */}
        <div className="space-y-4">
          {/* Meal Camera Scanner */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Camera className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium">Enable meal camera scanner</p>
                <p className="text-sm text-muted-foreground">Scan food to log instantly</p>
              </div>
            </div>
            <Switch
              checked={data.enableMealScanner}
              onCheckedChange={(checked) => onUpdate({ enableMealScanner: checked })}
            />
          </div>

          {/* Connect Wearable */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Watch className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Connect wearable</p>
                <p className="text-sm text-muted-foreground">Sync activity automatically</p>
              </div>
            </div>
            <Switch
              checked={data.connectWearable}
              onCheckedChange={(checked) => onUpdate({ connectWearable: checked })}
            />
          </div>

          {/* Photo Reminders */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Bell className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="font-medium">Enable weekly photo reminders</p>
                <p className="text-sm text-muted-foreground">Stay consistent with progress photos</p>
              </div>
            </div>
            <Switch
              checked={data.enablePhotoReminders}
              onCheckedChange={(checked) => onUpdate({ enablePhotoReminders: checked })}
            />
          </div>
        </div>

        {/* Coaching Tone */}
        <div>
          <Label className="mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            Coaching Tone
          </Label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(Object.keys(COACHING_TONE_CONFIG) as CoachingTone[]).map((tone) => {
              const config = COACHING_TONE_CONFIG[tone];
              const isSelected = selectedTone === tone;
              
              return (
                <button
                  key={tone}
                  onClick={() => setSelectedTone(tone)}
                  className={cn(
                    "p-3 rounded-xl transition-all text-left",
                    isSelected
                      ? "bg-emerald-500/20 border-2 border-emerald-500"
                      : "bg-muted/50 border-2 border-transparent"
                  )}
                >
                  <p className="font-medium capitalize">{config.label}</p>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </button>
              );
            })}
          </div>

          {/* Tone Preview */}
          <div className="p-4 rounded-xl bg-linear-to-br from-slate-800 to-slate-900 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">Preview</span>
            </div>
            <p className="text-sm">{COACHING_TONE_CONFIG[selectedTone].preview}</p>
          </div>
          
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Info className="w-3 h-3" />
            You can change tone anytime in Profile.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-6">
        <Button
          onClick={handleFinish}
          className="w-full h-14 rounded-2xl text-lg font-semibold bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
        >
          Finish and open Home
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
      </div>
    </motion.div>
  );
}

// Privacy Consent Modal
function PrivacyConsentModal({
  open,
  onAgree,
  onNotNow,
}: {
  open: boolean;
  onAgree: () => void;
  onNotNow: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="rounded-3xl max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="w-5 h-5 text-emerald-500" />
            Privacy & Generated Content
          </DialogTitle>
          <DialogDescription className="text-left pt-2">
            Please review and accept our content policy to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Consent Items */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Eye className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-sm">
                Generated images are illustrative and opt-in.
              </p>
            </div>
            
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <EyeOff className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-sm">
                We label generated items and exclude them from exports by default.
              </p>
            </div>
          </div>

          {/* Provenance Note */}
          <p className="text-xs text-muted-foreground text-center">
            You can change data sharing and export settings later.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={onAgree}
            className="w-full h-12 rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
          >
            I agree
          </Button>
          <Button
            variant="outline"
            onClick={onNotNow}
            className="w-full h-12 rounded-xl"
          >
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Post-Onboarding Immediate Tasks
function PostOnboardingPrompt({
  onPhotoUpload,
  onMealLog,
  onSkip,
}: {
  onPhotoUpload: () => void;
  onMealLog: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-4 bottom-24 z-50"
    >
      <Card className="rounded-3xl shadow-2xl border-0 bg-linear-to-br from-slate-900 to-slate-800 text-white overflow-hidden">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold">You&apos;re all set!</p>
              <p className="text-sm text-slate-400">Do one now to get started</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={onPhotoUpload}
              variant="outline"
              className="h-16 rounded-2xl bg-white/10 border-white/20 hover:bg-white/20 text-white flex-col"
            >
              <Camera className="w-5 h-5 mb-1" />
              Upload Photo
            </Button>
            <Button
              onClick={onMealLog}
              variant="outline"
              className="h-16 rounded-2xl bg-white/10 border-white/20 hover:bg-white/20 text-white flex-col"
            >
              <Utensils className="w-5 h-5 mb-1" />
              Log Meal
            </Button>
          </div>

          {/* Skip */}
          <button
            onClick={onSkip}
            className="w-full mt-4 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Skip for now
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Page Indicator
function PageIndicator({ 
  current, 
  total,
  onDotClick,
}: { 
  current: number; 
  total: number;
  onDotClick?: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onDotClick?.(i)}
          className={cn(
            "transition-all rounded-full",
            current === i
              ? "w-6 h-2 bg-emerald-500"
              : "w-2 h-2 bg-muted hover:bg-muted-foreground/50"
          )}
          aria-label={`Go to screen ${i + 1}`}
        />
      ))}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function OnboardingFlow({
  onComplete,
  onSkip,
  forceShow = false,
}: OnboardingFlowProps) {
  const [currentScreen, setCurrentScreen] = useState(0);
  const [data, setData] = useState<OnboardingData>(defaultOnboardingData);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showPostOnboarding, setShowPostOnboarding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [direction, setDirection] = useState(0);

  const totalScreens = 6;

  // Load saved data on mount - using a ref to track if we've loaded
  const loadedRef = React.useRef(false);
  
  React.useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    
    const saved = loadFromLocalStorage();
    if (saved && !forceShow) {
      if (saved.completedAt) {
        // Use requestAnimationFrame to defer state update
        requestAnimationFrame(() => {
          setIsCompleted(true);
        });
      } else {
        requestAnimationFrame(() => {
          setData(saved);
        });
      }
    }
  }, [forceShow]);

  // Save data whenever it changes
  useEffect(() => {
    saveToLocalStorage(data);
  }, [data]);

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleNext = useCallback(() => {
    if (currentScreen < totalScreens - 1) {
      setDirection(1);
      setCurrentScreen((prev) => prev + 1);
    } else {
      // Show consent modal after last screen
      setShowConsentModal(true);
    }
  }, [currentScreen]);

  const handleBack = useCallback(() => {
    if (currentScreen > 0) {
      setDirection(-1);
      setCurrentScreen((prev) => prev - 1);
    }
  }, [currentScreen]);

  const handleSkip = useCallback(() => {
    if (currentScreen === 0) {
      onSkip?.();
    } else {
      handleNext();
    }
  }, [currentScreen, handleNext, onSkip]);

  const handleConsentAgree = useCallback(() => {
    const completedData: OnboardingData = {
      ...data,
      hasConsent: true,
      enableMorphFeatures: true,
      completedAt: new Date(),
    };
    setData(completedData);
    setShowConsentModal(false);
    setShowPostOnboarding(true);
  }, [data]);

  const handleConsentNotNow = useCallback(() => {
    const completedData: OnboardingData = {
      ...data,
      hasConsent: true,
      enableMorphFeatures: false,
      completedAt: new Date(),
    };
    setData(completedData);
    setShowConsentModal(false);
    setShowPostOnboarding(true);
  }, [data]);

  const handlePostOnboardingAction = useCallback((action: "photo" | "meal") => {
    const completedData: OnboardingData = {
      ...data,
      firstAction: action,
    };
    setData(completedData);
    saveToLocalStorage(completedData);
    setShowPostOnboarding(false);
    setIsCompleted(true);
    onComplete?.(completedData);
  }, [data, onComplete]);

  const handlePostOnboardingSkip = useCallback(() => {
    setShowPostOnboarding(false);
    setIsCompleted(true);
    onComplete?.(data);
  }, [data, onComplete]);

  const handleDotClick = useCallback((index: number) => {
    if (index < currentScreen) {
      setDirection(-1);
      setCurrentScreen(index);
    } else if (index > currentScreen) {
      setDirection(1);
      setCurrentScreen(index);
    }
  }, [currentScreen]);

  // Swipe handling
  const handleDragEnd = useCallback((_: never, info: PanInfo) => {
    if (info.offset.x < -100) {
      handleNext();
    } else if (info.offset.x > 100) {
      handleBack();
    }
  }, [handleNext, handleBack]);

  // Reset onboarding (for testing)
  const handleReset = useCallback(() => {
    clearLocalStorage();
    setCurrentScreen(0);
    setData(defaultOnboardingData);
    setIsCompleted(false);
    setShowPostOnboarding(false);
  }, []);

  // If already completed, don't show
  if (isCompleted && !forceShow) {
    return null;
  }

  const screenVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <div className="fixed inset-0 bg-background z-50 ios-safe-area flex flex-col">
      {/* iOS Status Bar Spacer */}
      <div className="h-[env(safe-area-inset-top,20px)] bg-background shrink-0" />

      {/* Back Button (except on first screen) */}
      {currentScreen > 0 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleBack}
          className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-muted/50 backdrop-blur-xl flex items-center justify-center touch-manipulation"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>
      )}

      {/* Skip Button (except on last screen) */}
      {currentScreen < totalScreens - 1 && currentScreen > 0 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full bg-muted/50 backdrop-blur-xl text-sm font-medium touch-manipulation"
        >
          Skip
        </motion.button>
      )}

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {currentScreen === 0 && (
            <motion.div
              key="screen-0"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", duration: 0.3 }}
              className="h-full"
            >
              <WelcomeScreen onNext={handleNext} />
            </motion.div>
          )}
          
          {currentScreen === 1 && (
            <motion.div
              key="screen-1"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", duration: 0.3 }}
              className="h-full overflow-y-auto"
            >
              <CoreIdentityScreen
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
                onSkip={handleSkip}
              />
            </motion.div>
          )}
          
          {currentScreen === 2 && (
            <motion.div
              key="screen-2"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", duration: 0.3 }}
              className="h-full overflow-y-auto"
            >
              <PrimaryGoalScreen
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
                onSkip={handleSkip}
              />
            </motion.div>
          )}
          
          {currentScreen === 3 && (
            <motion.div
              key="screen-3"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", duration: 0.3 }}
              className="h-full overflow-y-auto"
            >
              <BaselineScreen
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
                onSkip={handleSkip}
              />
            </motion.div>
          )}
          
          {currentScreen === 4 && (
            <motion.div
              key="screen-4"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", duration: 0.3 }}
              className="h-full overflow-y-auto"
            >
              <FoodPreferencesScreen
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
                onSkip={handleSkip}
              />
            </motion.div>
          )}
          
          {currentScreen === 5 && (
            <motion.div
              key="screen-5"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", duration: 0.3 }}
              className="h-full overflow-y-auto"
            >
              <BehaviorSettingsScreen
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Page Indicator */}
      <div className="pb-4">
        <PageIndicator 
          current={currentScreen} 
          total={totalScreens}
          onDotClick={handleDotClick}
        />
      </div>

      {/* Privacy Consent Modal */}
      <PrivacyConsentModal
        open={showConsentModal}
        onAgree={handleConsentAgree}
        onNotNow={handleConsentNotNow}
      />

      {/* Post-Onboarding Prompt */}
      {showPostOnboarding && (
        <PostOnboardingPrompt
          onPhotoUpload={() => handlePostOnboardingAction("photo")}
          onMealLog={() => handlePostOnboardingAction("meal")}
          onSkip={handlePostOnboardingSkip}
        />
      )}
    </div>
  );
}

export default OnboardingFlow;
