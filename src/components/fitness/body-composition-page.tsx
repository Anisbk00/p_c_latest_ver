"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Brain,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Info,
  RefreshCw,
  Clock,
  Zap,
  Shield,
  Eye,
  EyeOff,
  Upload,
  X,
  Check,
  Loader2,
  Calendar,
  ArrowRight,
  Lightbulb,
  Target,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ProvenanceTag } from "./provenance-tag";
import { ConfidenceBadge } from "./confidence-badge";

// ============================================
// Types
// ============================================

interface BodyCompositionScan {
  id: string;
  capturedAt: string;
  bodyFatMin: number;
  bodyFatMax: number;
  bodyFatConfidence: number;
  leanMassMin: number | null;
  leanMassMax: number | null;
  bodyFatChange: number | null;
  changeDirection: string | null;
  aiCommentary: string | null;
  photoClarity: number;
  lightingQuality: number;
  poseQuality: number;
  rapidChangeDetected: boolean;
  safetyAlert: string | null;
}

interface ScanHistory {
  scans: BodyCompositionScan[];
  trends: {
    bodyFatTrend: Array<{ date: string; value: number; confidence: number }>;
    avgChange: number;
    direction: 'improving' | 'stable' | 'declining';
  };
  monthlySummary: {
    period: string;
    scanCount: number;
    bodyFatChange: number;
    direction: string;
    summary: string;
  } | null;
}

// ============================================
// Processing Animation
// ============================================

function ProcessingAnimation({ stage }: { stage: number }) {
  const stages = [
    { text: "Analyzing morphology...", icon: Activity },
    { text: "Cross-referencing historical trends...", icon: TrendingUp },
    { text: "Calibrating metabolic model...", icon: Brain },
    { text: "Computing confidence intervals...", icon: Shield },
    { text: "Generating insights...", icon: Sparkles },
  ];

  const currentStage = stages[Math.min(stage, stages.length - 1)];
  const Icon = currentStage.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16">
      {/* 3D Silhouette Animation */}
      <div className="relative w-48 h-64 mb-8">
        {/* Wireframe body outline */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <svg viewBox="0 0 100 150" className="w-full h-full">
            {/* Head */}
            <motion.ellipse
              cx="50"
              cy="15"
              rx="15"
              ry="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-emerald-500/30"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            {/* Torso */}
            <motion.path
              d="M35 35 L25 80 L40 85 L50 90 L60 85 L75 80 L65 35 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-emerald-500/30"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, delay: 0.2, repeat: Infinity }}
            />
            {/* Left arm */}
            <motion.path
              d="M25 40 L15 70 L20 72 L28 45"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-emerald-500/30"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: 0.4, repeat: Infinity }}
            />
            {/* Right arm */}
            <motion.path
              d="M75 40 L85 70 L80 72 L72 45"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-emerald-500/30"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: 0.4, repeat: Infinity }}
            />
            {/* Left leg */}
            <motion.path
              d="M40 90 L35 145 L45 145 L50 95"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-emerald-500/30"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.3, delay: 0.6, repeat: Infinity }}
            />
            {/* Right leg */}
            <motion.path
              d="M60 90 L65 145 L55 145 L50 95"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-emerald-500/30"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.3, delay: 0.6, repeat: Infinity }}
            />
          </svg>
        </motion.div>

        {/* Scanning line effect */}
        <motion.div
          className="absolute left-0 right-0 h-1 bg-linear-to-r from-transparent via-emerald-500 to-transparent"
          animate={{
            top: ["0%", "100%", "0%"],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {/* Pulse effect */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-emerald-500/30"
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
          }}
        />
      </div>

      {/* Status text */}
      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 text-emerald-600"
      >
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{currentStage.text}</span>
      </motion.div>

      {/* Progress dots */}
      <div className="flex gap-2 mt-6">
        {stages.map((_, i) => (
          <motion.div
            key={i}
            className={cn(
              "w-2 h-2 rounded-full",
              i <= stage ? "bg-emerald-500" : "bg-muted"
            )}
            animate={i === stage ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Alignment Guide Overlay
// ============================================

function AlignmentGuideOverlay({ pose }: { pose: "front" | "side" | "back" }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Silhouette guide */}
      <svg
        viewBox="0 0 200 300"
        className="absolute inset-0 w-full h-full opacity-30"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Body outline */}
        <ellipse cx="100" cy="40" rx="30" ry="36" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" className="text-emerald-400" />
        <path
          d={pose === "front" || pose === "back"
            ? "M70 80 L50 160 L80 170 L100 180 L120 170 L150 160 L130 80 Z"
            : "M90 80 L80 160 L100 180 L120 160 L110 80 Z"
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="8 4"
          className="text-emerald-400"
        />
        {/* Arms */}
        {pose === "front" || pose === "back" ? (
          <>
            <path d="M50 90 L30 140 L40 145 L55 100" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" className="text-emerald-400" />
            <path d="M150 90 L170 140 L160 145 L145 100" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" className="text-emerald-400" />
          </>
        ) : (
          <path d="M90 90 L70 130 L80 135 L95 100" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" className="text-emerald-400" />
        )}
        {/* Legs */}
        <path d="M80 180 L70 280 L90 280 L100 190" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" className="text-emerald-400" />
        <path d="M120 180 L130 280 L110 280 L100 190" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" className="text-emerald-400" />
      </svg>

      {/* Center line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-emerald-400/20" />

      {/* Alignment marks */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] text-emerald-400/60 uppercase tracking-wider">
        Align body here
      </div>
    </div>
  );
}

// ============================================
// Camera Capture Component
// ============================================

function CameraCapture({
  onCapture,
  onClose,
  isProcessing,
}: {
  onCapture: (imageData: string, metadata: { lighting: string; clothing: string }) => void;
  onClose: () => void;
  isProcessing: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [pose, setPose] = useState<"front" | "side" | "back">("front");
  const [showGuide, setShowGuide] = useState(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lighting, setLighting] = useState("moderate");
  const [clothing, setClothing] = useState("light");

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("Camera access denied. Please enable camera permissions.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror the image (front camera)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(imageData);
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage, { lighting, clothing });
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  if (isProcessing) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <ProcessingAnimation stage={Math.floor(Math.random() * 5)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <button onClick={onClose} className="p-2 rounded-full bg-white/10">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="font-medium">Body Composition Scan</p>
          <p className="text-xs text-white/60">Premium AI Analysis</p>
        </div>
        <button
          onClick={() => setShowGuide(!showGuide)}
          className={cn(
            "p-2 rounded-full transition-colors",
            showGuide ? "bg-emerald-500" : "bg-white/10"
          )}
        >
          {showGuide ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative">
        {capturedImage ? (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {showGuide && <AlignmentGuideOverlay pose={pose} />}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Instructions */}
      {!capturedImage && (
        <div className="p-4 text-white text-center">
          <div className="flex justify-center gap-4 mb-4">
            {(["front", "side", "back"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPose(p)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm capitalize transition-all",
                  pose === p ? "bg-emerald-500" : "bg-white/10"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="text-xs text-white/60 space-y-1">
            <p>• Stand 1.5m from camera, arms slightly away from body</p>
            <p>• Natural lighting, minimal bulky clothing</p>
            <p>• Relaxed state, no pump or extreme flex</p>
          </div>
        </div>
      )}

      {/* Capture controls */}
      <div className="p-6">
        {capturedImage ? (
          <div className="space-y-4">
            {/* Quality options */}
            <div className="flex gap-2 justify-center">
              <select
                value={lighting}
                onChange={(e) => setLighting(e.target.value)}
                className="bg-white/10 text-white px-3 py-2 rounded-lg text-sm"
              >
                <option value="good">Good Lighting</option>
                <option value="moderate">Moderate Lighting</option>
                <option value="poor">Poor Lighting</option>
              </select>
              <select
                value={clothing}
                onChange={(e) => setClothing(e.target.value)}
                className="bg-white/10 text-white px-3 py-2 rounded-lg text-sm"
              >
                <option value="minimal">Minimal Clothing</option>
                <option value="light">Light Clothing</option>
                <option value="heavy">Heavy Clothing</option>
              </select>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleRetake}
                variant="outline"
                className="flex-1 bg-white/10 border-white/20 text-white"
              >
                Retake
              </Button>
              <Button
                onClick={handleConfirm}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleCapture}
              disabled={!cameraReady}
              className={cn(
                "w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all",
                cameraReady ? "bg-white/20 hover:bg-white/30" : "bg-white/10 opacity-50"
              )}
            >
              <Camera className="w-8 h-8 text-white" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Scan Results Component
// ============================================

function ScanResults({
  scan,
  onClose,
  onScanAgain,
}: {
  scan: BodyCompositionScan;
  onClose: () => void;
  onScanAgain: () => void;
}) {
  const avgBodyFat = (scan.bodyFatMin + scan.bodyFatMax) / 2;

  return (
    <div className="p-6 space-y-6">
      {/* Safety Alert */}
      {scan.safetyAlert && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-600">Health Notice</p>
              <p className="text-sm text-amber-700/80 mt-1">{scan.safetyAlert}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Result */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">Estimated Body Fat</p>
        <div className="text-5xl font-bold">
          <span className="text-foreground">{scan.bodyFatMin}</span>
          <span className="text-muted-foreground mx-2">–</span>
          <span className="text-foreground">{scan.bodyFatMax}</span>
          <span className="text-2xl text-muted-foreground ml-1">%</span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <ConfidenceBadge confidence={scan.bodyFatConfidence} size="sm" />
          <ProvenanceTag
            source="model"
            timestamp={scan.capturedAt}
            modelName="Vision-Language Model"
            rationale="Body fat estimated from photo analysis using visual markers and body composition patterns"
          />
        </div>
      </div>

      {/* Visual Representation */}
      <div className="relative h-4 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
          style={{ width: `${Math.min(100, avgBodyFat * 2)}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-medium text-white drop-shadow">
            {avgBodyFat.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Lean Mass */}
      {scan.leanMassMin && scan.leanMassMax && (
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Estimated Lean Mass</p>
              <p className="text-xl font-bold text-purple-600">
                {scan.leanMassMin.toFixed(1)}–{scan.leanMassMax.toFixed(1)} kg
              </p>
              <div className="mt-1">
                <ProvenanceTag
                  source="estimated"
                  timestamp={scan.capturedAt}
                  rationale="Calculated from body weight minus estimated body fat percentage"
                />
              </div>
            </div>
            <Activity className="w-8 h-8 text-purple-500/50" />
          </div>
        </div>
      )}

      {/* Change from Previous */}
      {scan.bodyFatChange !== null && (
        <div className={cn(
          "p-4 rounded-xl border",
          scan.changeDirection === "improving" && "bg-emerald-500/10 border-emerald-500/20",
          scan.changeDirection === "stable" && "bg-slate-500/10 border-slate-500/20",
          scan.changeDirection === "declining" && "bg-rose-500/10 border-rose-500/20"
        )}>
          <div className="flex items-center gap-3">
            {scan.changeDirection === "improving" && <TrendingDown className="w-5 h-5 text-emerald-500" />}
            {scan.changeDirection === "stable" && <Minus className="w-5 h-5 text-slate-500" />}
            {scan.changeDirection === "declining" && <TrendingUp className="w-5 h-5 text-rose-500" />}
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Change from Previous</p>
              <p className="font-medium">
                {scan.bodyFatChange > 0 ? "+" : ""}{scan.bodyFatChange.toFixed(1)}% body fat
              </p>
            </div>
            <ProvenanceTag
              source="model"
              timestamp={scan.capturedAt}
              rationale="Comparison between current and previous scan results"
            />
          </div>
        </div>
      )}

      {/* AI Commentary */}
      {scan.aiCommentary && (
        <div className="p-4 rounded-xl bg-linear-to-br from-violet-500/10 to-purple-500/10 border border-purple-500/20">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-purple-700">AI Analysis</p>
                <ProvenanceTag
                  source="model"
                  timestamp={scan.capturedAt}
                  modelName="Vision-Language Model"
                />
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{scan.aiCommentary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quality Scores */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-muted/50 text-center">
          <p className="text-[10px] text-muted-foreground">Photo Clarity</p>
          <p className="text-lg font-bold">{Math.round(scan.photoClarity * 100)}%</p>
        </div>
        <div className="p-3 rounded-xl bg-muted/50 text-center">
          <p className="text-[10px] text-muted-foreground">Lighting</p>
          <p className="text-lg font-bold">{Math.round(scan.lightingQuality * 100)}%</p>
        </div>
        <div className="p-3 rounded-xl bg-muted/50 text-center">
          <p className="text-[10px] text-muted-foreground">Pose</p>
          <p className="text-lg font-bold">{Math.round(scan.poseQuality * 100)}%</p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="p-3 rounded-lg bg-muted/30 text-center">
        <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <Info className="w-3 h-3" />
          This is an AI-based estimation tool and does not replace medical-grade DEXA or clinical assessment.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Close
        </Button>
        <Button onClick={onScanAgain} className="flex-1 bg-emerald-500 hover:bg-emerald-600">
          <Camera className="w-4 h-4 mr-2" />
          New Scan
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Timeline View Component
// ============================================

function TimelineView({
  scans,
  onSelectScan,
}: {
  scans: BodyCompositionScan[];
  onSelectScan: (scan: BodyCompositionScan) => void;
}) {
  if (scans.length === 0) {
    return (
      <div className="text-center py-12">
        <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
        <p className="text-muted-foreground">No scans yet</p>
        <p className="text-sm text-muted-foreground/60 mt-1">Start your body composition journey</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {scans.map((scan, index) => {
        const avgBodyFat = (scan.bodyFatMin + scan.bodyFatMax) / 2;
        const prevAvg = index < scans.length - 1
          ? (scans[index + 1].bodyFatMin + scans[index + 1].bodyFatMax) / 2
          : null;
        const change = prevAvg !== null ? avgBodyFat - prevAvg : null;

        return (
          <motion.button
            key={scan.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onSelectScan(scan)}
            className="w-full p-4 rounded-xl bg-card border border-border/50 hover:border-emerald-500/30 transition-all text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-linear-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                  <span className="text-lg font-bold">{avgBodyFat.toFixed(0)}%</span>
                </div>
                <div>
                  <p className="font-medium">{scan.bodyFatMin}–{scan.bodyFatMax}% Body Fat</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(scan.capturedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {change !== null && (
                  <div className={cn(
                    "flex items-center gap-1 text-sm",
                    change < 0 ? "text-emerald-500" : change > 0 ? "text-rose-500" : "text-muted-foreground"
                  )}>
                    {change < 0 ? <TrendingDown className="w-3 h-3" /> : change > 0 ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    <span>{change > 0 ? "+" : ""}{change.toFixed(1)}%</span>
                  </div>
                )}
                <ConfidenceBadge confidence={scan.bodyFatConfidence} size="xs" />
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ============================================
// Trend Chart Component
// ============================================

function TrendChart({ scans }: { scans: BodyCompositionScan[] }) {
  if (scans.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Need at least 2 scans to show trends</p>
      </div>
    );
  }

  const reversedScans = [...scans].reverse();
  const values = reversedScans.map(s => (s.bodyFatMin + s.bodyFatMax) / 2);
  const minVal = Math.min(...values) - 2;
  const maxVal = Math.max(...values) + 2;
  const range = maxVal - minVal;

  const chartWidth = 300;
  const chartHeight = 150;
  const padding = 20;

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * (chartWidth - padding * 2),
    y: chartHeight - padding - ((v - minVal) / range) * (chartHeight - padding * 2),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="p-4">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-48">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => (
          <line
            key={pct}
            x1={padding}
            y1={chartHeight - padding - (pct / 100) * (chartHeight - padding * 2)}
            x2={chartWidth - padding}
            y2={chartHeight - padding - (pct / 100) * (chartHeight - padding * 2)}
            stroke="currentColor"
            className="text-muted/20"
            strokeDasharray="4 4"
          />
        ))}

        {/* Trend line */}
        <motion.path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-emerald-500"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />

        {/* Data points */}
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="currentColor"
            className="text-emerald-500"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + i * 0.1 }}
          />
        ))}

        {/* Y-axis labels */}
        <text x={padding - 5} y={chartHeight - padding} className="text-[8px] fill-muted-foreground" textAnchor="end">
          {minVal.toFixed(0)}%
        </text>
        <text x={padding - 5} y={padding} className="text-[8px] fill-muted-foreground" textAnchor="end">
          {maxVal.toFixed(0)}%
        </text>
      </svg>

      {/* Date labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{format(new Date(reversedScans[0].capturedAt), "MMM d")}</span>
        <span>{format(new Date(reversedScans[reversedScans.length - 1].capturedAt), "MMM d")}</span>
      </div>
    </div>
  );
}

// ============================================
// Monthly Summary Component
// ============================================

function MonthlySummaryCard({ summary }: { summary: NonNullable<ScanHistory["monthlySummary"]> }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4 bg-linear-to-r from-violet-500/10 to-purple-500/10">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-purple-500" />
          Monthly Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-center gap-4 mb-3">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            summary.direction === "decreased" && "bg-emerald-500/20",
            summary.direction === "increased" && "bg-rose-500/20",
            summary.direction === "stable" && "bg-slate-500/20"
          )}>
            {summary.direction === "decreased" && <TrendingDown className="w-6 h-6 text-emerald-500" />}
            {summary.direction === "increased" && <TrendingUp className="w-6 h-6 text-rose-500" />}
            {summary.direction === "stable" && <Minus className="w-6 h-6 text-slate-500" />}
          </div>
          <div>
            <p className="text-2xl font-bold">
              {summary.bodyFatChange > 0 ? "+" : ""}{summary.bodyFatChange}%
            </p>
            <p className="text-xs text-muted-foreground">over {summary.period}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{summary.summary}</p>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>{summary.scanCount} scans this period</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Body Composition Page
// ============================================

export function BodyCompositionPage() {
  const [showCamera, setShowCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<ScanHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedScan, setSelectedScan] = useState<BodyCompositionScan | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [latestScan, setLatestScan] = useState<BodyCompositionScan | null>(null);
  const [activeTab, setActiveTab] = useState<"timeline" | "trends">("timeline");

  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/body-composition?summary=true");
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setHistory(data);
      if (data.scans.length > 0) {
        setLatestScan(data.scans[0]);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
      toast.error("Failed to load scan history");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleCapture = async (imageData: string, metadata: { lighting: string; clothing: string }) => {
    setIsProcessing(true);

    try {
      const response = await fetch("/api/body-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontPhotoUrl: imageData,
          lighting: metadata.lighting,
          clothing: metadata.clothing,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to analyze scan");
      }

      setLatestScan(result.scan);
      setShowCamera(false);
      setShowResults(true);
      fetchHistory(); // Refresh history
      toast.success("Body composition scan complete!");
    } catch (error) {
      console.error("Error processing scan:", error);
      toast.error("Failed to analyze scan. Please try again.");
      setShowCamera(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectScan = (scan: BodyCompositionScan) => {
    setSelectedScan(scan);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Body Intelligence</h2>
          <p className="text-sm text-muted-foreground">AI-powered composition analysis</p>
        </div>
        <Button
          onClick={() => setShowCamera(true)}
          className="bg-emerald-500 hover:bg-emerald-600"
        >
          <Camera className="w-4 h-4 mr-2" />
          New Scan
        </Button>
      </div>

      {/* Latest Scan Preview */}
      {latestScan && (
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted opacity-20" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${((latestScan.bodyFatMin + latestScan.bodyFatMax) / 2) * 2.51} 251`}
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-bold">{((latestScan.bodyFatMin + latestScan.bodyFatMax) / 2).toFixed(0)}%</span>
                  </div>
                </div>
                <div>
                  <p className="font-medium">Latest Estimate</p>
                  <p className="text-sm text-muted-foreground">
                    {latestScan.bodyFatMin}–{latestScan.bodyFatMax}% body fat
                  </p>
                  <ConfidenceBadge confidence={latestScan.bodyFatConfidence} size="xs" />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedScan(latestScan);
                  setShowResults(true);
                }}
              >
                View
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Summary */}
      {history?.monthlySummary && <MonthlySummaryCard summary={history.monthlySummary} />}

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-xl bg-muted/50">
        <button
          onClick={() => setActiveTab("timeline")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
            activeTab === "timeline" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab("trends")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
            activeTab === "trends" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
        >
          Trends
        </button>
      </div>

      {/* Content */}
      {activeTab === "timeline" && history && (
        <TimelineView scans={history.scans} onSelectScan={handleSelectScan} />
      )}

      {activeTab === "trends" && history && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base">Body Fat Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TrendChart scans={history.scans} />
          </CardContent>
        </Card>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
          isProcessing={isProcessing}
        />
      )}

      {/* Results Sheet */}
      <Sheet open={showResults} onOpenChange={setShowResults}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0 max-h-[90vh] overflow-y-auto">
          <div className="h-1 w-12 bg-muted rounded-full mx-auto mt-2 mb-4" />
          <SheetHeader className="px-6 pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              Scan Results
            </SheetTitle>
            <SheetDescription>
              {latestScan && format(new Date(latestScan.capturedAt), "MMMM d, yyyy 'at' h:mm a")}
            </SheetDescription>
          </SheetHeader>
          {latestScan && (
            <ScanResults
              scan={latestScan}
              onClose={() => setShowResults(false)}
              onScanAgain={() => {
                setShowResults(false);
                setShowCamera(true);
              }}
            />
          )}
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </SheetContent>
      </Sheet>

      {/* Scan Detail Sheet */}
      <Sheet open={!!selectedScan && !showResults} onOpenChange={() => setSelectedScan(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0 max-h-[90vh] overflow-y-auto">
          <div className="h-1 w-12 bg-muted rounded-full mx-auto mt-2 mb-4" />
          <SheetHeader className="px-6 pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              Scan Details
            </SheetTitle>
            <SheetDescription>
              {selectedScan && format(new Date(selectedScan.capturedAt), "MMMM d, yyyy 'at' h:mm a")}
            </SheetDescription>
          </SheetHeader>
          {selectedScan && (
            <ScanResults
              scan={selectedScan}
              onClose={() => setSelectedScan(null)}
              onScanAgain={() => {
                setSelectedScan(null);
                setShowCamera(true);
              }}
            />
          )}
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </SheetContent>
      </Sheet>

      {/* Info Footer */}
      <div className="p-4 rounded-xl bg-muted/30 text-center">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Shield className="w-4 h-4" />
          <p className="text-xs">
            Privacy-first: All photos encrypted and processed securely
          </p>
        </div>
      </div>
    </div>
  );
}
