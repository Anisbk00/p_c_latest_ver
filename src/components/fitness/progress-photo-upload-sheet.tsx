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
import { apiFetch, getApiUrl, isMobileApp, getAccessToken } from "@/lib/mobile-api";

interface PhotoUploadProps {
  open: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
  heightCm?: number | null;
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
  heightCm,
}: PhotoUploadProps) {
  // State
  const [step, setStep] = useState<UploadStep>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [weight, setWeight] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state when closed
  const handleClose = useCallback(() => {
    setStep('select');
    setSelectedFile(null);
    setPreviewUrl(null);
    setWeight('');
    setNotes('');
    setAiResult(null);
    setIsUploading(false);
    setUploadProgress(0);
    abortControllerRef.current = null;
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

  // Compress image before upload to reduce upload time
  const compressImage = useCallback((file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      // Skip compression for small files or non-JPEG/PNG
      if (file.size < 500 * 1024) {
        resolve(file);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1920;
        let { width, height } = img;

        // Only resize if image is larger than max dimension
        if (width <= MAX_DIM && height <= MAX_DIM) {
          // Still convert to JPEG for compression
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(file); return; }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.82);
          return;
        }

        // Resize to fit within MAX_DIM
        if (width > height) {
          if (width > MAX_DIM) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
        } else {
          if (height > MAX_DIM) { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.82);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  // Upload photo with progress tracking
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setStep('uploading');
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Compress image for faster upload
      const compressedFile = await compressImage(selectedFile);

      // Build FormData with all metadata
      const formData = new FormData();
      formData.append('file', compressedFile);
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

      // Use XMLHttpRequest for upload progress tracking
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        controller.signal.addEventListener('abort', () => xhr.abort());

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(pct);
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.details || data.error || 'Failed to upload photo'));
            }
          } catch {
            reject(new Error('Upload failed: invalid response'));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error — please check your connection')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        // Build URL with auth
        const url = getApiUrl('/api/progress-photos');
        xhr.open('POST', url);

        // Add auth header for mobile
        if (isMobileApp()) {
          getAccessToken().then(token => {
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(formData);
          });
        } else {
          xhr.withCredentials = true;
          xhr.send(formData);
        }
      });

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
      setUploadProgress(0);
      abortControllerRef.current = null;
    }
  }, [selectedFile, weight, notes, aiResult, onUploadComplete, handleClose, compressImage]);

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
            {step === 'uploading' && uploadProgress > 0 ? `Uploading... ${uploadProgress}%` : step === 'uploading' && 'Preparing upload...'}
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
                      inputMode="decimal"
                      step="0.1"
                      min={25}
                      max={550}
                      placeholder="e.g., 75.5"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      onBlur={() => {
                        if (weight) {
                          const num = parseFloat(weight);
                          if (isNaN(num) || num < 25) setWeight('25');
                          else if (num > 550) setWeight('550');
                        }
                      }}
                      className={cn(
                        "h-12",
                        weight && (parseFloat(weight) < 25 || parseFloat(weight) > 550) && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    {weight && (parseFloat(weight) < 25 || parseFloat(weight) > 550) ? (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Weight must be between 25 kg and 550 kg
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Enter your weight at the time the photo was taken
                      </p>
                    )}

                    {/* BMI Indicator */}
                    {(() => {
                      const w = parseFloat(weight);
                      if (!w || w < 25 || w > 550 || !heightCm || heightCm < 100) return null;
                      const bmi = w / ((heightCm / 100) ** 2);
                      const bmiRounded = Math.round(bmi * 10) / 10;
                      let category: string, colorClass: string, bgClass: string, dotClass: string;
                      if (bmi < 16) {
                        category = 'Severely Underweight';
                        colorClass = 'text-blue-600 dark:text-blue-400';
                        bgClass = 'bg-blue-500/10 border-blue-500/20';
                        dotClass = 'bg-blue-500';
                      } else if (bmi < 18.5) {
                        category = 'Underweight';
                        colorClass = 'text-sky-600 dark:text-sky-400';
                        bgClass = 'bg-sky-500/10 border-sky-500/20';
                        dotClass = 'bg-sky-500';
                      } else if (bmi < 25) {
                        category = 'Normal Weight';
                        colorClass = 'text-emerald-600 dark:text-emerald-400';
                        bgClass = 'bg-emerald-500/10 border-emerald-500/20';
                        dotClass = 'bg-emerald-500';
                      } else if (bmi < 30) {
                        category = 'Overweight';
                        colorClass = 'text-amber-600 dark:text-amber-400';
                        bgClass = 'bg-amber-500/10 border-amber-500/20';
                        dotClass = 'bg-amber-500';
                      } else if (bmi < 35) {
                        category = 'Obese (Class I)';
                        colorClass = 'text-orange-600 dark:text-orange-400';
                        bgClass = 'bg-orange-500/10 border-orange-500/20';
                        dotClass = 'bg-orange-500';
                      } else if (bmi < 40) {
                        category = 'Obese (Class II)';
                        colorClass = 'text-red-500 dark:text-red-400';
                        bgClass = 'bg-red-500/10 border-red-500/20';
                        dotClass = 'bg-red-500';
                      } else {
                        category = 'Obese (Class III)';
                        colorClass = 'text-red-700 dark:text-red-500';
                        bgClass = 'bg-red-600/10 border-red-500/30';
                        dotClass = 'bg-red-600';
                      }
                      // BMI bar position (clamp 10-50 range mapped to 0-100%)
                      const barPos = Math.min(100, Math.max(0, ((bmi - 10) / 40) * 100));
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn("p-3 rounded-xl border", bgClass)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full", dotClass)} />
                              <span className={cn("text-xs font-semibold", colorClass)}>
                                BMI {bmiRounded}
                              </span>
                            </div>
                            <span className={cn("text-[11px] font-medium", colorClass)}>
                              {category}
                            </span>
                          </div>
                          {/* BMI scale bar */}
                          <div className="relative h-1.5 rounded-full overflow-hidden bg-white/30 dark:bg-black/20">
                            <div className="absolute inset-0 flex">
                              <div className="flex-1 bg-blue-400" />
                              <div className="flex-1 bg-sky-400" />
                              <div className="flex-[2] bg-emerald-400" />
                              <div className="flex-1 bg-amber-400" />
                              <div className="flex-1 bg-orange-400" />
                              <div className="flex-1 bg-red-500" />
                              <div className="flex-1 bg-red-700" />
                            </div>
                            {/* Indicator dot */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 shadow-sm"
                              style={{ left: `calc(${barPos}% - 6px)` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[8px] text-muted-foreground/60">10</span>
                            <span className="text-[8px] text-muted-foreground/60">25</span>
                            <span className="text-[8px] text-muted-foreground/60">40</span>
                            <span className="text-[8px] text-muted-foreground/60">50</span>
                          </div>
                        </motion.div>
                      );
                    })()}
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
                  disabled={isUploading || !!(weight && (parseFloat(weight) < 25 || parseFloat(weight) > 550))}
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
                    {uploadProgress > 0 ? (
                      <>
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                          <span className="text-xl font-bold text-emerald-500">{uploadProgress}%</span>
                        </div>
                        <p className="font-medium text-white">Uploading...</p>
                        <div className="w-48 h-2 rounded-full bg-white/20 mt-3 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        </div>
                        <p className="font-medium text-white">Preparing upload...</p>
                        <p className="text-sm text-white/70 mt-1">Compressing and optimizing</p>
                      </>
                    )}
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
