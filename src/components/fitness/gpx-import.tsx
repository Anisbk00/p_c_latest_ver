"use client";

import * as React from "react";
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  MapPin,
  Timer,
  Flame,
  Mountain,
  Activity,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { parseGPX, gpxToWorkout, ParsedGPX, WorkoutImportData } from "@/lib/gpx-parser";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface GPXImportProps {
  open: boolean;
  onClose: () => void;
  onImport: (workout: WorkoutImportData) => Promise<void>;
}

type ImportStatus = "idle" | "parsing" | "preview" | "importing" | "success" | "error";

// ═══════════════════════════════════════════════════════════════
// GPX Import Component
// ═══════════════════════════════════════════════════════════════

export function GPXImport({ open, onClose, onImport }: GPXImportProps) {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [parsedGPX, setParsedGPX] = useState<ParsedGPX | null>(null);
  const [workoutData, setWorkoutData] = useState<WorkoutImportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state on close
  const handleClose = useCallback(() => {
    setStatus("idle");
    setParsedGPX(null);
    setWorkoutData(null);
    setError(null);
    onClose();
  }, [onClose]);

  // Handle file selection
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setError('Please select a GPX file');
      setStatus('error');
      return;
    }

    setStatus('parsing');
    setError(null);

    try {
      const content = await file.text();
      const result = parseGPX(content);

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to parse GPX file');
        setStatus('error');
        return;
      }

      const gpx = result.data;
      const workout = gpxToWorkout(gpx);

      setParsedGPX(gpx);
      setWorkoutData(workout);
      setStatus('preview');
    } catch (err) {
      console.error('GPX parsing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to read file');
      setStatus('error');
    }
  }, []);

  // Handle import confirmation
  const handleImport = useCallback(async () => {
    if (!workoutData) return;

    setStatus('importing');

    try {
      await onImport(workoutData);
      setStatus('success');
      // Auto close after success
      setTimeout(handleClose, 1500);
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import workout');
      setStatus('error');
    }
  }, [workoutData, onImport, handleClose]);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            Import GPX Workout
          </DialogTitle>
          <DialogDescription>
            Import your workout from a GPX file exported from apps like Strava, Garmin, or Runkeeper.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <AnimatePresence mode="wait">
            {/* Upload Area */}
            {status === "idle" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors",
                    dragActive
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-border hover:border-emerald-500/50 hover:bg-muted/30"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gpx"
                    onChange={handleFileSelect}
                    className="hidden"
                    aria-label="Select GPX file to import"
                  />
                  <motion.div
                    animate={{ y: dragActive ? -5 : 0 }}
                    className="w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mx-auto mb-4"
                  >
                    <Upload className="w-8 h-8 text-emerald-500" />
                  </motion.div>
                  <p className="font-medium mb-1">
                    {dragActive ? "Drop your GPX file" : "Drop your GPX file here"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse
                  </p>
                </div>
              </motion.div>
            )}

            {/* Parsing */}
            {status === "parsing" && (
              <motion.div
                key="parsing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center py-8"
              >
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                <p className="font-medium">Parsing GPX file...</p>
              </motion.div>
            )}

            {/* Preview */}
            {status === "preview" && workoutData && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Workout Info */}
                <div className="p-4 rounded-2xl bg-muted/50">
                  <p className="font-medium mb-2">{workoutData.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {workoutData.startedAt.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {workoutData.durationMinutes && (
                    <div className="p-3 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Timer className="w-4 h-4 text-purple-500" />
                        <span className="text-xs text-muted-foreground">Duration</span>
                      </div>
                      <p className="font-semibold">
                        {Math.floor(workoutData.durationMinutes / 60)}h {workoutData.durationMinutes % 60}m
                      </p>
                    </div>
                  )}

                  {workoutData.distanceMeters && (
                    <div className="p-3 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        <span className="text-xs text-muted-foreground">Distance</span>
                      </div>
                      <p className="font-semibold">
                        {(workoutData.distanceMeters / 1000).toFixed(2)} km
                      </p>
                    </div>
                  )}

                  {workoutData.caloriesBurned && (
                    <div className="p-3 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Flame className="w-4 h-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground">Calories</span>
                      </div>
                      <p className="font-semibold">{workoutData.caloriesBurned} kcal</p>
                    </div>
                  )}

                  {workoutData.elevationGain && (
                    <div className="p-3 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Mountain className="w-4 h-4 text-teal-500" />
                        <span className="text-xs text-muted-foreground">Elevation</span>
                      </div>
                      <p className="font-semibold">{Math.round(workoutData.elevationGain)} m</p>
                    </div>
                  )}

                  {workoutData.avgHeartRate && (
                    <div className="p-3 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-4 h-4 text-rose-500" />
                        <span className="text-xs text-muted-foreground">Avg HR</span>
                      </div>
                      <p className="font-semibold">{workoutData.avgHeartRate} bpm</p>
                    </div>
                  )}

                  {workoutData.avgPace && (
                    <div className="p-3 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-muted-foreground">Avg Pace</span>
                      </div>
                      <p className="font-semibold">
                        {Math.floor(workoutData.avgPace)}:{Math.floor((workoutData.avgPace % 1) * 60).toString().padStart(2, '0')} /km
                      </p>
                    </div>
                  )}
                </div>

                {/* Route Preview */}
                {parsedGPX && parsedGPX.tracks.length > 0 && (
                  <div className="p-3 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Route</span>
                    </div>
                    <p className="text-sm">
                      {parsedGPX.tracks.length} track{parsedGPX.tracks.length > 1 ? 's' : ''} • {' '}
                      {parsedGPX.tracks.reduce((sum, t) => sum + t.points.length, 0)} points
                    </p>
                  </div>
                )}

                {/* Activity Type */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-sm text-muted-foreground">Activity Type</span>
                  <span className="font-medium text-emerald-600 capitalize">
                    {workoutData.activityType}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Importing */}
            {status === "importing" && (
              <motion.div
                key="importing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center py-8"
              >
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                <p className="font-medium">Importing workout...</p>
              </motion.div>
            )}

            {/* Success */}
            {status === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4"
                >
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </motion.div>
                <p className="font-medium">Workout imported!</p>
              </motion.div>
            )}

            {/* Error */}
            {status === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center py-8"
              >
                <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
                </div>
                <p className="font-medium text-rose-500 mb-2">Import failed</p>
                <p className="text-sm text-muted-foreground text-center px-4">
                  {error || "An error occurred while importing"}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatus("idle");
                    setError(null);
                  }}
                  className="mt-4"
                >
                  Try Again
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {status === "preview" && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              Import Workout
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// GPX Import Button (for easy integration)
// ═══════════════════════════════════════════════════════════════

export function GPXImportButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-2xl",
        "bg-white/10 backdrop-blur-sm border border-white/20",
        "hover:bg-white/20 transition-colors",
        className
      )}
    >
      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
        <Upload className="w-5 h-5 text-white" />
      </div>
      <span className="text-xs text-white font-medium">Import GPX</span>
    </button>
  );
}

export default GPXImport;
