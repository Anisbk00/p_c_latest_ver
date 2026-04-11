"use client";

import * as React from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  X,
  RefreshCw,
  Check,
  Sparkles,
  AlertCircle,
  Loader2,
  SwitchCamera,
  Flame,
  Zap,
  Droplet,
  Coffee,
  Sun,
  Moon,
  Apple,
  Pill,
  Plus,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from '@/lib/mobile-api';
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// Image Compression Utility
// Reduces camera photos from 5-20MB to ~200KB for fast upload
// ═══════════════════════════════════════════════════════════════

const MAX_IMAGE_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

function compressImage(canvas: HTMLCanvasElement): string {
  let { width, height } = canvas;

  // Scale down if larger than max dimension
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, width, height);

  return tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface AnalyzedFood {
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  servingSize: number;
  servingUnit: string;
  confidence: number;
  detectedItems: string[];
}

type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "supplements";

interface FoodPhotoScannerProps {
  open: boolean;
  onClose: () => void;
  onSelectMeal: (food: AnalyzedFood, mealType: MealType) => Promise<void>;
}

type ScannerStatus = "idle" | "camera" | "capturing" | "analyzing" | "result" | "error";

// ═══════════════════════════════════════════════════════════════
// Meal Config
// ═══════════════════════════════════════════════════════════════

const MEAL_CONFIG = {
  breakfast: { icon: Coffee, label: "Breakfast", color: "from-amber-500/20 to-orange-500/20", borderColor: "border-amber-500/30", textColor: "text-amber-600 dark:text-amber-400" },
  lunch: { icon: Sun, label: "Lunch", color: "from-yellow-500/20 to-amber-500/20", borderColor: "border-yellow-500/30", textColor: "text-yellow-600 dark:text-yellow-400" },
  dinner: { icon: Moon, label: "Dinner", color: "from-indigo-500/20 to-purple-500/20", borderColor: "border-indigo-500/30", textColor: "text-indigo-600 dark:text-indigo-400" },
  snack: { icon: Apple, label: "Snack", color: "from-emerald-500/20 to-teal-500/20", borderColor: "border-emerald-500/30", textColor: "text-emerald-600 dark:text-emerald-400" },
  supplements: { icon: Pill, label: "Supplements", color: "from-rose-500/20 to-pink-500/20", borderColor: "border-rose-500/30", textColor: "text-rose-600 dark:text-rose-400" },
};

// ═══════════════════════════════════════════════════════════════
// Food Photo Scanner Component
// ═══════════════════════════════════════════════════════════════

export function FoodPhotoScanner({
  open,
  onClose,
  onSelectMeal,
}: FoodPhotoScannerProps) {
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analyzedFood, setAnalyzedFood] = useState<AnalyzedFood | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setStatus("idle");
      setCapturedImage(null);
      setAnalyzedFood(null);
      setError(null);
      setSelectedMeal(null);
    }
  }, [open]);

  // Start camera when entering camera mode
  useEffect(() => {
    if (open && status === "camera") {
      startCamera();
    }
    return () => {
      if (status === "camera") {
        stopCamera();
      }
    };
  }, [open, status]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("[FoodPhotoScanner] Camera error:", err);
      setError("Camera access denied. Please allow camera permissions.");
      setStatus("error");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setStatus("capturing");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Stop camera
    stopCamera();

    // Convert to base64 (full quality for display)
    const fullImageData = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(fullImageData);
    setStatus("analyzing");

    // Compress image for API upload (reduces payload from ~5-20MB to ~200KB)
    const compressedImage = compressImage(canvas);

    // Analyze the image
    try {
      const response = await apiFetch("/api/analyze-food-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: compressedImage }),
      });

      // Handle non-JSON responses (504 HTML error pages, etc.)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if (response.status === 504) {
          throw new Error('Server timed out. The image may be too complex — try a clearer photo.');
        }
        if (response.status >= 500) {
          throw new Error('Server error. Please try again in a moment.');
        }
        throw new Error(`Unexpected response (${response.status}). Please try again.`);
      }

      const data = await response.json();

      if (data.success && data.food) {
        setAnalyzedFood(data.food);
        setStatus("result");
      } else {
        setError(data.error || "Failed to analyze food");
        setStatus("error");
      }
    } catch (err) {
      console.error("[FoodPhotoScanner] Analysis error:", err);
      const message = err instanceof Error ? err.message : 'Failed to analyze photo. Please try again.';
      setError(message);
      setStatus("error");
    }
  }, [stopCamera]);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setAnalyzedFood(null);
    setError(null);
    setSelectedMeal(null);
    setStatus("camera");
  }, []);

  const handleAddToMeal = useCallback(async () => {
    if (!analyzedFood || !selectedMeal) return;

    setIsAdding(true);
    try {
      await onSelectMeal(analyzedFood, selectedMeal);
      onClose();
    } catch (err) {
      console.error("[FoodPhotoScanner] Add error:", err);
      setError("Failed to add food. Please try again.");
    } finally {
      setIsAdding(false);
    }
  }, [analyzedFood, selectedMeal, onSelectMeal, onClose]);

  const openCamera = useCallback(() => {
    setStatus("camera");
  }, []);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ─────────────────────────────────────────────────────────
          IDLE STATE - Initial camera button
          ───────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {status === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col"
          >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2 text-white">
                <Camera className="w-5 h-5" />
                <span className="font-medium">Food Scanner</span>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Center content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-2 border-emerald-500/30 flex items-center justify-center mb-6"
              >
                <Camera className="w-14 h-14 text-emerald-500" />
              </motion.div>
              
              <h2 className="text-white text-xl font-semibold mb-2">
                Scan Your Food
              </h2>
              <p className="text-white/60 text-center max-w-xs mb-8">
                Take a photo of your food and we'll detect the nutritional information automatically
              </p>

              <Button
                onClick={openCamera}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-6 rounded-2xl text-lg font-medium"
              >
                <Camera className="w-5 h-5 mr-2" />
                Open Camera
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─────────────────────────────────────────────────────────
            CAMERA STATE - Live camera view
            ───────────────────────────────────────────────────────── */}
        {status === "camera" && (
          <motion.div
            key="camera"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            {/* Video feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2 text-white">
                <Camera className="w-5 h-5" />
                <span className="font-medium">Position food in frame</span>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Center targeting guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-72 h-72 border-2 border-white/40 rounded-3xl relative">
                {/* Corner markers */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-3 border-l-3 border-emerald-400 rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-3 border-r-3 border-emerald-400 rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-3 border-l-3 border-emerald-400 rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-3 border-r-3 border-emerald-400 rounded-br-xl" />
                
                {/* Animated pulse */}
                <motion.div
                  className="absolute inset-0 border-2 border-emerald-400/50 rounded-3xl"
                  animate={{ scale: [1, 1.02, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center">
                <button
                  onClick={capturePhoto}
                  className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <div className="w-16 h-16 rounded-full border-4 border-emerald-500 flex items-center justify-center">
                    <Camera className="w-7 h-7 text-emerald-500" />
                  </div>
                </button>
              </div>
              <p className="text-white/60 text-center text-sm mt-4">
                Tap to capture
              </p>
            </div>
          </motion.div>
        )}

        {/* ─────────────────────────────────────────────────────────
            ANALYZING STATE
            ───────────────────────────────────────────────────────── */}
        {status === "analyzing" && capturedImage && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col"
          >
            {/* Captured image (dimmed) */}
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-50"
              style={{ backgroundImage: `url(${capturedImage})` }}
            />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5" />
                <span className="font-medium">Analyzing...</span>
              </div>
            </div>

            {/* Center loading */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-full border-4 border-white/20 border-t-emerald-500 mb-4"
              />
              <p className="text-white text-lg font-medium">Detecting food...</p>
              <p className="text-white/60 text-sm mt-1">This may take a few seconds</p>
            </div>
          </motion.div>
        )}

        {/* ─────────────────────────────────────────────────────────
            RESULT STATE - Show analyzed food with meal selection
            ───────────────────────────────────────────────────────── */}
        {status === "result" && analyzedFood && capturedImage && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col bg-background"
          >
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <span className="font-medium">Food Detected</span>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* Food image and info */}
              <div className="p-4">
                {/* Food image */}
                <div 
                  className="w-full h-48 rounded-2xl bg-cover bg-center mb-4 relative"
                  style={{ backgroundImage: `url(${capturedImage})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-2xl" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white text-xl font-bold">{analyzedFood.name}</h3>
                    <p className="text-white/80 text-sm">{analyzedFood.description}</p>
                  </div>
                  {/* Confidence badge */}
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm">
                    <span className={cn(
                      "text-sm font-medium",
                      analyzedFood.confidence >= 0.8 ? "text-emerald-400" :
                      analyzedFood.confidence >= 0.5 ? "text-amber-400" : "text-rose-400"
                    )}>
                      {Math.round(analyzedFood.confidence * 100)}% confidence
                    </span>
                  </div>
                </div>

                {/* Macros */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <Flame className="w-5 h-5 mx-auto mb-1 text-rose-500" />
                    <div className="text-lg font-bold">{analyzedFood.calories}</div>
                    <div className="text-xs text-muted-foreground">kcal</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <Droplet className="w-5 h-5 mx-auto mb-1 text-rose-400" />
                    <div className="text-lg font-bold">{analyzedFood.protein}g</div>
                    <div className="text-xs text-muted-foreground">Protein</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <Zap className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                    <div className="text-lg font-bold">{analyzedFood.carbs}g</div>
                    <div className="text-xs text-muted-foreground">Carbs</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <Droplet className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                    <div className="text-lg font-bold">{analyzedFood.fat}g</div>
                    <div className="text-xs text-muted-foreground">Fat</div>
                  </div>
                </div>

                {/* Serving info */}
                <div className="p-3 rounded-xl bg-muted/30 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Estimated serving</span>
                    <span className="font-medium">{analyzedFood.servingSize}{analyzedFood.servingUnit}</span>
                  </div>
                </div>

                {/* Detected items */}
                {analyzedFood.detectedItems.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm text-muted-foreground mb-2">Detected items:</p>
                    <div className="flex flex-wrap gap-2">
                      {analyzedFood.detectedItems.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-full bg-muted text-sm"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meal selection */}
                <div className="mb-4">
                  <p className="text-sm font-medium mb-3">Add to which meal?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(MEAL_CONFIG) as [MealType, typeof MEAL_CONFIG.breakfast][]).map(([key, config]) => {
                      const Icon = config.icon;
                      const isSelected = selectedMeal === key;
                      
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedMeal(key)}
                          className={cn(
                            "p-3 rounded-xl border-2 transition-all",
                            isSelected 
                              ? `bg-gradient-to-br ${config.color} ${config.borderColor}`
                              : "bg-muted/30 border-transparent hover:bg-muted/50"
                          )}
                        >
                          <Icon className={cn("w-5 h-5 mx-auto mb-1", isSelected ? config.textColor : "text-muted-foreground")} />
                          <span className={cn("text-sm", isSelected ? "font-medium" : "text-muted-foreground")}>
                            {config.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom actions */}
            <div className="p-4 border-t border-border space-y-3">
              <Button
                onClick={handleAddToMeal}
                disabled={!selectedMeal || isAdding}
                className="w-full py-6 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 mr-2" />
                    Add to {selectedMeal ? MEAL_CONFIG[selectedMeal].label : "Meal"}
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleRetake}
                variant="outline"
                className="w-full py-4 rounded-2xl"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Take Another Photo
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─────────────────────────────────────────────────────────
            ERROR STATE
            ───────────────────────────────────────────────────────── */}
        {status === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-background"
          >
            <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
            <p className="text-muted-foreground text-center mb-6">{error}</p>
            
            <div className="flex gap-3">
              <Button onClick={handleRetake} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={onClose} variant="ghost">
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS safe area */}
      <div className="absolute bottom-0 left-0 right-0 h-[env(safe-area-inset-bottom,0px)]" />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Compact Button for Integration
// ═══════════════════════════════════════════════════════════════

export function FoodPhotoButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-label="Take food photo"
      className={cn(
        "w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors",
        "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20",
        "border border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        className
      )}
    >
      <Camera className="w-5 h-5" />
      <span className="font-medium">Scan Food with Camera</span>
    </button>
  );
}

export default FoodPhotoScanner;
