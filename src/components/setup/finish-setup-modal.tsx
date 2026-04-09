'use client';

import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  X,
  Sparkles,
  Check,
  ChevronRight,
  Loader2,
  Upload,
  Info,
  Clock,
  Target,
  Activity,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/mobile-api';
import { useSupabaseAuth } from '@/lib/supabase/auth-context';
import { useApp } from '@/contexts/app-context';
import {
  type PrimaryGoal,
  type ActivityLevel,
  type CoachingTone,
  type UnitSystem,
  getGoalLabel,
  getActivityLabel,
  getToneLabel,
  getTonePreview,
  detectTimezone,
  detectUnitSystem,
} from '@/lib/human-state-engine';
import { SetupSuccessAnimation } from './setup-success-animation';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface AISuggestion {
  value: string;
  confidence: number;
  rationale: string;
}

interface SetupSuggestions {
  goalSuggestion: AISuggestion;
  activitySuggestion: AISuggestion;
  toneSuggestion: AISuggestion;
  suggestedExperiment: {
    title: string;
    description: string;
    duration: number;
    category: string;
  } | null;
}

interface SetupFormData {
  avatarFile: File | null;
  avatarPreview: string | null;
  primaryGoal: PrimaryGoal | null;
  activityLevel: ActivityLevel | null;
  unitSystem: UnitSystem;
  coachingTone: CoachingTone;
  timezone: string;
  acceptExperiment: boolean;
  currentWeightKg: string;
}

const DEFAULT_FORM_DATA: SetupFormData = {
  avatarFile: null,
  avatarPreview: null,
  primaryGoal: null,
  activityLevel: null,
  unitSystem: 'metric',
  coachingTone: 'supportive',
  timezone: 'UTC',
  acceptExperiment: true,
  currentWeightKg: '',
};

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const GOALS: { value: PrimaryGoal; label: string; description: string }[] = [
  { value: 'fat_loss', label: 'Fat Loss', description: 'Reduce body fat while preserving muscle' },
  { value: 'recomposition', label: 'Recomposition', description: 'Build muscle while losing fat' },
  { value: 'muscle_gain', label: 'Muscle Gain', description: 'Build strength and size' },
  { value: 'performance', label: 'Performance', description: 'Optimize athletic performance' },
  { value: 'maintenance', label: 'Maintenance', description: 'Maintain current physique' },
];

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little to no exercise' },
  { value: 'light', label: 'Light', description: 'Light exercise 1-3 days/week' },
  { value: 'moderate', label: 'Moderate', description: 'Moderate exercise 3-5 days/week' },
  { value: 'active', label: 'Active', description: 'Hard exercise 6-7 days/week' },
  { value: 'very_active', label: 'Very Active', description: 'Intense exercise or physical job' },
];

const COACHING_TONES: { value: CoachingTone; label: string; preview: string }[] = [
  { value: 'analytical', label: 'Analytical', preview: 'Data-driven insights with detailed metrics' },
  { value: 'supportive', label: 'Supportive', preview: 'Encouraging guidance with positive reinforcement' },
  { value: 'strict', label: 'Strict', preview: 'Direct feedback with accountability focus' },
  { value: 'minimal', label: 'Minimal', preview: 'Brief, essential updates only' },
];

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

function ChipButton({
  selected,
  suggested,
  confidence,
  onClick,
  children,
  disabled,
  className,
}: {
  selected: boolean;
  suggested?: boolean;
  confidence?: number;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative w-full py-1.5 px-2 rounded-lg border-2 text-center transition-all',
        'hover:border-primary/50 active:scale-[0.98]',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border/50 bg-card/50',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {suggested && confidence && (
        <div className="absolute -top-1 right-0.5 flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-primary/20 border border-primary/30">
          <Sparkles className="w-2 h-2 text-primary" />
          <span className="text-[8px] font-medium text-primary">
            {confidence}%
          </span>
        </div>
      )}
      {children}
    </button>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="p-1 rounded-full hover:bg-muted/50 transition-colors"
        aria-label="Show information tooltip"
      >
        <Info className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 p-2 rounded-lg bg-popover border shadow-lg text-xs text-muted-foreground w-48 text-center"
        >
          {text}
        </motion.div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

interface FinishSetupModalProps {
  isOpen: boolean;
  onClose: (completed: boolean) => void;
  showSkip?: boolean;
}

export function FinishSetupModal({
  isOpen,
  onClose,
  showSkip = true,
}: FinishSetupModalProps) {
  const { user } = useSupabaseAuth();
  const { refreshAll } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [formData, setFormData] = useState<SetupFormData>(DEFAULT_FORM_DATA);
  const [suggestions, setSuggestions] = useState<SetupSuggestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'form' | 'success' | 'complete'>('form');
  const [isClosing, setIsClosing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Detect timezone and unit system on mount
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      timezone: detectTimezone(),
      unitSystem: detectUnitSystem(),
    }));
  }, []);

  // Fetch suggestions when modal opens
  useEffect(() => {
    if (isOpen && user) {
      fetchSuggestions();
    }
  }, [isOpen, user]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStage('form');
      setIsClosing(false);
      setError(null);
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  }, [isOpen]);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    try {
      // Supabase uses cookies for auth - no Authorization header needed
      const response = await apiFetch('/api/setup/suggestions');
      
      if (response.ok) {
        const data = await response.json();
        const sugs = data?.suggestions;
        
        if (sugs) {
          setSuggestions(sugs);
          console.log('[Setup] Applying suggestions safely', sugs);
          
          setFormData(prev => ({
            ...prev,
            primaryGoal: (sugs.goalSuggestion?.value as PrimaryGoal) || prev.primaryGoal,
            activityLevel: (sugs.activitySuggestion?.value as ActivityLevel) || prev.activityLevel,
            coachingTone: (sugs.toneSuggestion?.value as CoachingTone) || prev.coachingTone,
          }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Avatar handling
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Invalid file type. Please use JPEG, PNG, or WebP.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File too large. Maximum size is 10MB.');
        return;
      }

      // Create preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFormData(prev => ({
          ...prev,
          avatarFile: file,
          avatarPreview: ev.target?.result as string,
        }));
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const removeAvatar = () => {
    setFormData(prev => ({
      ...prev,
      avatarFile: null,
      avatarPreview: null,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Form validation
  const parsedCurrentWeightKg = Number(formData.currentWeightKg);
  const hasValidCurrentWeight = Number.isFinite(parsedCurrentWeightKg) && parsedCurrentWeightKg > 0;
  const isValid = formData.primaryGoal && formData.activityLevel && hasValidCurrentWeight;

  // Submit
  const handleSubmit = async () => {
    if (!isValid || !user) return;
    
    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);
    
    try {
      let avatarFileId: string | undefined;
      
      // Upload avatar if provided
      if (formData.avatarFile) {
        setUploadProgress(10);
        const avatarFormData = new FormData();
        avatarFormData.append('file', formData.avatarFile);
        
        // Supabase uses cookies for auth - no Authorization header needed
        const uploadResponse = await apiFetch('/api/setup/avatar', {
          method: 'POST',
          body: avatarFormData,
        });
        
        setUploadProgress(30);
        
        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          avatarFileId = uploadData.avatar.fileId;
        }
      }
      
      setUploadProgress(40);
      
      // Submit setup data - Supabase uses cookies for auth
      const response = await apiFetch('/api/setup/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          avatarFileId,
          primaryGoal: formData.primaryGoal,
          activityLevel: formData.activityLevel,
          currentWeight: parsedCurrentWeightKg,
          weightUnit: 'kg',
          unitSystem: formData.unitSystem,
          coachingTone: formData.coachingTone,
          timezone: formData.timezone,
          acceptSuggestedExperiment: formData.acceptExperiment && suggestions?.suggestedExperiment,
          suggestedExperiment: formData.acceptExperiment ? suggestions?.suggestedExperiment : undefined,
        }),
      });
      
      setUploadProgress(80);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete setup');
      }
      
      setUploadProgress(100);
      
      // Show success animation
      setStage('success');
      
      // Refresh app data (don't wait, let it happen in background)
      refreshAll().catch(err => console.error('Refresh error:', err));
      
      // Transition to complete after animation (reduced time)
      setTimeout(() => {
        setStage('complete');
        setIsClosing(true);
        // Call onClose to trigger parent state update
        onClose(true);
      }, 1500);
      
    } catch (err) {
      console.error('Setup error:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete setup');
      setStage('form');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  // Skip
  const handleSkip = async () => {
    if (!user) return;
    
    try {
      // Supabase uses cookies for auth - no Authorization header needed
      await apiFetch('/api/setup/complete', {
        method: 'PATCH',
      });
    } catch (err) {
      console.error('Skip error:', err);
    }
    
    onClose(false);
  };

  // Animation variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 },
  };

  // Don't render if closing or not open
  if (!isOpen || isClosing) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={backdropVariants}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isSubmitting && showSkip && onClose(false)}
          />
          
          {/* Modal */}
          <motion.div
            className={cn(
              'relative w-full max-w-lg bg-background rounded-t-3xl sm:rounded-3xl',
              'border border-border/50 shadow-2xl',
              'max-h-[90vh] overflow-hidden flex flex-col'
            )}
            variants={modalVariants}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-0">
              <div>
                <h2 id="setup-title" className="text-xl font-semibold">
                  Almost there
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Personalize your experience
                </p>
              </div>
              {showSkip && !isSubmitting && (
                <button
                  onClick={handleSkip}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                </div>
              )}

              {/* Form */}
              {!isLoading && stage === 'form' && (
                <>
                  {/* Avatar */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="relative group"
                      aria-label="Upload avatar"
                    >
                      <div className={cn(
                        'w-20 h-20 rounded-full bg-linear-to-br from-emerald-400 to-teal-500',
                        'flex items-center justify-center overflow-hidden',
                        'ring-2 ring-background shadow-lg',
                        formData.avatarPreview && 'ring-emerald-500'
                      )}>
                        {formData.avatarPreview ? (
                          <img
                            src={formData.avatarPreview}
                            alt="Avatar preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="w-8 h-8 text-white" />
                        )}
                      </div>
                      <div className={cn(
                        'absolute inset-0 rounded-full bg-black/50',
                        'flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
                        'cursor-pointer'
                      )}>
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarSelect}
                      className="hidden"
                      aria-label="Upload avatar image"
                    />
                    {formData.avatarPreview && (
                      <button
                        onClick={removeAvatar}
                        className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Remove
                      </button>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground text-center">
                      A quick progress photo helps our AI calibrate insights
                      <br />
                      <span className="text-[10px]">Private by default</span>
                    </p>
                  </div>

                  {/* Primary Goal */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-emerald-500" />
                      <label className="text-sm font-medium">Primary Goal</label>
                      <span className="text-xs text-red-500">*</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {GOALS.map((goal) => (
                        <ChipButton
                          key={goal.value}
                          selected={formData.primaryGoal === goal.value}
                          suggested={suggestions?.goalSuggestion?.value === goal.value}
                          confidence={suggestions?.goalSuggestion?.confidence}
                          onClick={() => setFormData(prev => ({ ...prev, primaryGoal: goal.value }))}
                        >
                          <p className="text-xs font-medium">{goal.label}</p>
                        </ChipButton>
                      ))}
                    </div>
                  </div>

                  {/* Activity Level */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      <label className="text-sm font-medium">Activity Level</label>
                      <span className="text-xs text-red-500">*</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {ACTIVITY_LEVELS.map((level) => (
                        <ChipButton
                          key={level.value}
                          selected={formData.activityLevel === level.value}
                          suggested={suggestions?.activitySuggestion?.value === level.value}
                          confidence={suggestions?.activitySuggestion?.confidence}
                          onClick={() => setFormData(prev => ({ ...prev, activityLevel: level.value }))}
                        >
                          <p className="text-[11px] font-medium">{level.label}</p>
                        </ChipButton>
                      ))}
                    </div>
                  </div>

                  {/* Current Weight */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      <label htmlFor="setup-current-weight" className="text-sm font-medium">Current Weight (kg)</label>
                      <span className="text-xs text-red-500">*</span>
                    </div>
                    <Input
                      id="setup-current-weight"
                      type="number"
                      min="1"
                      step="0.1"
                      value={formData.currentWeightKg}
                      onChange={(e) => setFormData(prev => ({ ...prev, currentWeightKg: e.target.value }))}
                      placeholder="e.g. 72.5"
                      className={cn('h-10', !hasValidCurrentWeight && formData.currentWeightKg !== '' && 'border-red-500')}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Required to personalize your daily calorie target.
                    </p>
                    {!hasValidCurrentWeight && formData.currentWeightKg !== '' && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Enter a valid weight greater than 0.
                      </p>
                    )}
                  </div>

                  {/* Units & Timezone */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4 text-emerald-500" />
                      <label className="text-sm font-medium">Units & Preferred Time</label>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1.5 block">Unit System</label>
                        <div className="flex rounded-xl overflow-hidden border border-border/50">
                          {(['metric', 'imperial'] as UnitSystem[]).map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, unitSystem: unit }))}
                              className={cn(
                                'flex-1 py-2 text-sm font-medium transition-colors',
                                formData.unitSystem === unit
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-card hover:bg-muted'
                              )}
                            >
                              {unit === 'metric' ? 'kg / cm' : 'lb / in'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1.5 block">Timezone</label>
                        <div className="flex items-center gap-2 p-2 rounded-xl border border-border/50 bg-card">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm truncate">{formData.timezone.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Coaching Tone */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4 text-emerald-500" />
                      <label className="text-sm font-medium">Coaching Tone</label>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {COACHING_TONES.map((tone) => (
                        <ChipButton
                          key={tone.value}
                          selected={formData.coachingTone === tone.value}
                          suggested={suggestions?.toneSuggestion?.value === tone.value}
                          confidence={suggestions?.toneSuggestion?.confidence}
                          onClick={() => setFormData(prev => ({ ...prev, coachingTone: tone.value }))}
                        >
                          <p className="text-[11px] font-medium">{tone.label}</p>
                        </ChipButton>
                      ))}
                    </div>
                  </div>

                  {/* Suggested Experiment */}
                  {suggestions?.suggestedExperiment && (
                    <div className="p-4 rounded-xl bg-linear-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="accept-experiment"
                          checked={formData.acceptExperiment}
                          onChange={(e) => setFormData(prev => ({ ...prev, acceptExperiment: e.target.checked }))}
                          className="mt-1 h-4 w-4 rounded border-emerald-500 text-emerald-500 focus:ring-emerald-500"
                        />
                        <div>
                          <label htmlFor="accept-experiment" className="text-sm font-medium cursor-pointer">
                            Start with: {suggestions.suggestedExperiment.title}
                          </label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {suggestions.suggestedExperiment.description} • {suggestions.suggestedExperiment.duration} days
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  {/* Progress bar during upload */}
                  {isSubmitting && uploadProgress > 0 && (
                    <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Success Animation */}
              {stage === 'success' && (
                <SetupSuccessAnimation />
              )}
            </div>

            {/* Footer */}
            {stage === 'form' && !isLoading && (
              <div className="p-6 pt-0">
                <Button
                  onClick={handleSubmit}
                  disabled={!isValid || isSubmitting}
                  className={cn(
                    'w-full h-12 rounded-xl font-medium',
                    'bg-linear-to-r from-emerald-500 to-teal-500',
                    'hover:from-emerald-600 hover:to-teal-600',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Finish & Personalize
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-3">
                  You can change all of this later in Settings
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
    </AnimatePresence>
  );
}

export default FinishSetupModal;
