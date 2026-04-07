"use client";

import * as React from "react";
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Upload,
  X,
  Loader2,
  Scale,
  FileText,
  Brain,
  Activity,
  Dumbbell,
  Sparkles,
  AlertTriangle,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/fitness/confidence-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { apiFetch } from "@/lib/mobile-api";

interface PhotoUploadProps {
  open: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

interface AIAnalysisResult {
  bodyFatEstimate?: {
    value: number;
    confidence: number;
    rationale: string;
  };
  muscleMassEstimate?: {
    value: number;
    confidence: number;
    rationale: string;
  };
  weightEstimate?: {
    value: number;
    confidence: number;
    rationale: string;
  };
  overallConfidence: number;
  analysisNotes: string;
  recommendations: string[];
}

type UploadStep = 'select' | 'preview' | 'analyzing' | 'results' | 'uploading';

export function ProgressPhotoUploadSheet({
  open,
  onClose,
  onUploadComplete,
}: PhotoUploadProps) {
  // State
  const [step, setStep] = useState<UploadStep>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [weight, setWeight] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when closed
  const handleClose = useCallback(() => {
    setStep('select');
    setSelectedFile(null);
    setPreviewUrl(null);
    setWeight('');
    setNotes('');
    setAiResult(null);
    setIsUploading(false);
    onClose();
  }, [onClose]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    setSelectedFile(file);

    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
      setStep('preview');
    };
    reader.readAsDataURL(file);
  }, []);

  // Run AI analysis
  const handleAnalyze = useCallback(async () => {
    if (!selectedFile || !previewUrl) return;

    setStep('analyzing');

    try {
      // Add client-side timeout (20s) — if server takes longer, abort
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      // Convert file to base64 for API
      const response = await apiFetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: previewUrl.split(',')[1], // Remove data:image/...;base64, prefix
          mimeType: selectedFile.type,
          analysisType: 'body-composition',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const isTimeout = response.status === 504 || errorData.code === 'TIMEOUT';
        throw new Error(isTimeout 
          ? 'AI analysis timed out — please try again or upload without AI analysis'
          : 'AI analysis failed');
      }

      const result = await response.json();
      
      if (!result.success || !result.analysis) {
        throw new Error('AI analysis returned no results');
      }

      setAiResult(result.analysis as AIAnalysisResult);
      setStep('results');

      // Auto-fill weight estimate if user hasn't entered weight
      if (!weight && result.analysis?.weightEstimate?.value) {
        setWeight(result.analysis.weightEstimate.value.toFixed(1));
      }
    } catch (error) {
      console.error('Analysis error:', error);
      const isTimeout = error instanceof Error && (
        error.message.includes('timed out') || 
        error.message.includes('Timeout') ||
        error.message.includes('abort') ||
        error.name === 'AbortError'
      );
      
      toast.error(isTimeout ? 'AI analysis timed out' : 'AI analysis unavailable', {
        description: isTimeout
          ? 'The AI service is busy. You can still upload the photo and add your weight manually.'
          : 'You can still upload the photo without AI analysis.',
        duration: 5000,
      });
      // Always go to results step so user can upload even without AI data
      setStep('results');
    }
  }, [selectedFile, previewUrl, weight]);

  // Upload photo
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setStep('uploading');
    setIsUploading(true);

    try {
      // First upload the file with all metadata
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('capturedAt', new Date().toISOString());
      if (weight) formData.append('weight', weight);
      if (notes) formData.append('notes', notes);

      // Include AI analysis results if available
      if (aiResult?.bodyFatEstimate) {
        formData.append('bodyFat', JSON.stringify({
          min: Math.max(0, aiResult.bodyFatEstimate.value - 3),
          max: Math.min(50, aiResult.bodyFatEstimate.value + 3),
          confidence: aiResult.bodyFatEstimate.confidence,
        }));
      }
      if (aiResult?.muscleMassEstimate) {
        formData.append('muscleMass', aiResult.muscleMassEstimate.value.toString());
      }

      const uploadResponse = await apiFetch('/api/progress-photos', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        let errorJson: any;
        try { errorJson = await uploadResponse.json(); } catch { errorJson = {}; }
        if (errorJson._needsMigration) {
          throw new Error(errorJson.details || 'Database setup required. Please contact support.');
        }
        const detail = typeof errorJson.details === 'string' ? errorJson.details
          : errorJson.details ? JSON.stringify(errorJson.details)
          : null;
        throw new Error(detail || errorJson.error || 'Failed to upload photo');
      }

      const uploadResult = await uploadResponse.json();

      toast.success('Photo uploaded successfully!', {
        description: aiResult
          ? `Body fat estimated at ${aiResult.bodyFatEstimate?.value || '?'}%`
          : 'Your progress photo has been saved.',
      });

      onUploadComplete();
      handleClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed', {
        description: error instanceof Error ? error.message : 'Could not upload photo. Please try again.',
      });
      setStep('results');
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, weight, notes, aiResult, onUploadComplete, handleClose]);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl px-0 max-h-[95vh] overflow-y-auto">
        <div className="h-1 w-12 bg-muted rounded-full mx-auto mt-2 mb-4" />
        <SheetHeader className="px-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-500" />
            Upload Progress Photo
          </SheetTitle>
          <SheetDescription>
            {step === 'select' && 'Select a photo to track your fitness progress'}
            {step === 'preview' && 'Add details and run AI analysis'}
            {step === 'analyzing' && 'AI is analyzing your photo...'}
            {step === 'results' && 'Review AI predictions and upload'}
            {step === 'uploading' && 'Uploading your photo...'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 space-y-4 pb-6">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Select photo"
          />

          <AnimatePresence mode="wait">
            {/* Step 1: Select Photo */}
            {step === 'select' && (
              <motion.div
                key="select"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-3/4 rounded-2xl border-2 border-dashed border-muted-foreground/30 hover:border-emerald-500/50 transition-colors flex flex-col items-center justify-center gap-4 bg-muted/10"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">Tap to select a photo</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      JPEG, PNG, or WebP up to 10MB
                    </p>
                  </div>
                </button>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Tips for best results</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Take photos in good lighting, same pose, same time of day. Consistent photos help AI track your progress accurately.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Preview & Enter Info */}
            {step === 'preview' && previewUrl && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Photo Preview */}
                <div className="relative aspect-3/4 rounded-2xl overflow-hidden bg-muted">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setStep('select');
                    }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>

                {/* User Input Fields - BEFORE AI analysis */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight" className="flex items-center gap-2">
                      <Scale className="w-4 h-4" />
                      Your Weight (kg)
                    </Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      placeholder="e.g., 75.5"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="h-12"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter your current weight for accurate tracking
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes" className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Notes (optional)
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="How are you feeling? Any changes to note?"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAnalyze}
                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-600"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Run AI Analysis
                </Button>
              </motion.div>
            )}

            {/* Step 3: Analyzing */}
            {step === 'analyzing' && previewUrl && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="relative aspect-3/4 rounded-2xl overflow-hidden bg-muted">
                  <img
                    src={previewUrl}
                    alt="Analyzing"
                    className="w-full h-full object-cover opacity-50"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                      <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                    </div>
                    <p className="font-medium text-white">AI is analyzing...</p>
                    <p className="text-sm text-white/70 mt-1">Detecting body composition</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium">Analyzing body composition</p>
                      <p className="text-xs text-muted-foreground">
                        Estimating body fat percentage and muscle mass
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 4: Results & Upload */}
            {step === 'results' && previewUrl && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Photo Preview */}
                <div className="relative aspect-3/4 rounded-2xl overflow-hidden bg-muted">
                  <img
                    src={previewUrl}
                    alt="Ready to upload"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-emerald-500 text-white">
                      <Check className="w-3 h-3 mr-1" />
                      Ready
                    </Badge>
                  </div>
                </div>

                {/* User Info Display */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Scale className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Weight</span>
                    </div>
                    <p className="font-semibold">{weight ? `${weight} kg` : '-- kg'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Date</span>
                    </div>
                    <p className="font-semibold">{format(new Date(), 'MMM d, yyyy')}</p>
                  </div>
                </div>

                {/* AI Results */}
                {aiResult && (
                  <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-violet-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-5 h-5 text-purple-500" />
                      <p className="font-semibold text-purple-700 dark:text-purple-300">AI Predictions</p>
                      <Badge className="bg-purple-500/20 text-purple-600 text-[10px]">AI</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {/* Body Fat */}
                      {aiResult.bodyFatEstimate && (
                        <div className="p-3 rounded-lg bg-white/50 dark:bg-black/20">
                          <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-4 h-4 text-purple-500" />
                            <span className="text-xs text-muted-foreground">Body Fat</span>
                          </div>
                          <p className="text-lg font-bold text-purple-600">
                            {aiResult.bodyFatEstimate.value.toFixed(0)}%
                          </p>
                          <ConfidenceBadge confidence={aiResult.bodyFatEstimate.confidence} size="xs" />
                        </div>
                      )}

                      {/* Muscle Mass */}
                      {aiResult.muscleMassEstimate && (
                        <div className="p-3 rounded-lg bg-white/50 dark:bg-black/20">
                          <div className="flex items-center gap-2 mb-1">
                            <Dumbbell className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs text-muted-foreground">Muscle Mass</span>
                          </div>
                          <p className="text-lg font-bold text-emerald-600">
                            {aiResult.muscleMassEstimate.value.toFixed(1)} kg
                          </p>
                          <ConfidenceBadge confidence={aiResult.muscleMassEstimate.confidence} size="xs" />
                        </div>
                      )}
                    </div>

                    {/* Analysis Notes */}
                    {aiResult.analysisNotes && (
                      <div className="p-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">{aiResult.analysisNotes}</p>
                      </div>
                    )}

                    {/* Disclaimer */}
                    <div className="mt-3 flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground">
                        AI estimates are approximations. For accurate measurements, consult a healthcare professional.
                      </p>
                    </div>
                  </div>
                )}

                {/* Notes Display */}
                {notes && (
                  <div className="p-3 rounded-xl bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{notes}</p>
                  </div>
                )}

                {/* Upload Button */}
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-600"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Photo
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                  disabled={isUploading}
                >
                  Choose Different Photo
                </Button>
              </motion.div>
            )}

            {/* Step 5: Uploading */}
            {step === 'uploading' && previewUrl && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="relative aspect-3/4 rounded-2xl overflow-hidden bg-muted">
                  <img
                    src={previewUrl}
                    alt="Uploading"
                    className="w-full h-full object-cover opacity-50"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    </div>
                    <p className="font-medium text-white">Uploading...</p>
                    <p className="text-sm text-white/70 mt-1">Saving your progress photo</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </SheetContent>
    </Sheet>
  );
}
