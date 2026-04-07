/**
 * Unified Food Scanner
 * 
 * Provides both barcode and photo scanning options in one interface.
 * Users can choose their preferred scanning method.
 * 
 * @module components/fitness/unified-food-scanner
 */

"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scan,
  Camera,
  X,
  Barcode,
  Utensils,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PremiumBarcodeScanner, type ScannedFood } from "./premium-barcode-scanner";
import { FoodPhotoScanner, type AnalyzedFood } from "./food-photo-scanner";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type ScannerMode = 'menu' | 'barcode' | 'photo';

interface UnifiedFoodScannerProps {
  open: boolean;
  onClose: () => void;
  onBarcodeScan: (food: ScannedFood) => void;
  onPhotoScan: (food: AnalyzedFood, mealType: string) => void;
  onBarcodeNotFound?: (barcode: string) => void;
}

// ═══════════════════════════════════════════════════════════════
// Scanner Menu Component
// ═══════════════════════════════════════════════════════════════

function ScannerMenu({
  onSelectBarcode,
  onSelectPhoto,
  onClose,
}: {
  onSelectBarcode: () => void;
  onSelectPhoto: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-background rounded-t-3xl overflow-hidden"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-6 pb-4 border-b border-border">
          <h2 className="text-xl font-semibold">Scan Food</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose how you want to add food
          </p>
        </div>

        {/* Options */}
        <div className="p-4 space-y-3">
          {/* Barcode Scanner Option */}
          <button
            onClick={onSelectBarcode}
            type="button"
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center gap-4 hover:from-emerald-500/20 hover:to-teal-500/20 transition-all group"
          >
            <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Barcode className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold">Scan Barcode</h3>
              <p className="text-sm text-muted-foreground">
                Scan packaged food barcodes for instant nutrition info
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
          </button>

          {/* Photo Scanner Option */}
          <button
            onClick={onSelectPhoto}
            type="button"
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 flex items-center gap-4 hover:from-violet-500/20 hover:to-purple-500/20 transition-all group"
          >
            <div className="w-14 h-14 rounded-xl bg-violet-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Camera className="w-7 h-7 text-violet-500" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold">Photo Food</h3>
              <p className="text-sm text-muted-foreground">
                Take a photo of your meal for AI analysis
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-violet-500 transition-colors" />
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            type="button"
            className="w-full py-3 rounded-xl bg-muted hover:bg-muted/80 font-medium transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Safe Area */}
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function UnifiedFoodScanner({
  open,
  onClose,
  onBarcodeScan,
  onPhotoScan,
  onBarcodeNotFound,
}: UnifiedFoodScannerProps) {
  const [mode, setMode] = useState<ScannerMode>('menu');

  const handleSelectBarcode = useCallback(() => {
    setMode('barcode');
  }, []);

  const handleSelectPhoto = useCallback(() => {
    setMode('photo');
  }, []);

  const handleBack = useCallback(() => {
    setMode('menu');
  }, []);

  const handleClose = useCallback(() => {
    setMode('menu');
    onClose();
  }, [onClose]);

  const handleBarcodeScan = useCallback((food: ScannedFood) => {
    onBarcodeScan(food);
    handleClose();
  }, [onBarcodeScan, handleClose]);

  const handlePhotoScan = useCallback((food: AnalyzedFood, mealType: string) => {
    onPhotoScan(food, mealType);
    handleClose();
  }, [onPhotoScan, handleClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {mode === 'menu' && (
        <ScannerMenu
          onSelectBarcode={handleSelectBarcode}
          onSelectPhoto={handleSelectPhoto}
          onClose={handleClose}
        />
      )}

      {mode === 'barcode' && (
        <PremiumBarcodeScanner
          open={true}
          onClose={handleBack}
          onScan={handleBarcodeScan}
          onNotFound={onBarcodeNotFound}
        />
      )}

      {mode === 'photo' && (
        <FoodPhotoScanner
          open={true}
          onClose={handleBack}
          onSelectMeal={handlePhotoScan}
        />
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// Compact Launch Button
// ═══════════════════════════════════════════════════════════════

export function UnifiedScanButton({
  onClick,
  className,
  variant = 'default',
}: {
  onClick: () => void;
  className?: string;
  variant?: 'default' | 'compact' | 'pill';
}) {
  if (variant === 'pill') {
    return (
      <button
        onClick={onClick}
        type="button"
        aria-label="Scan food"
        className={cn(
          "inline-flex items-center gap-2 px-5 py-2.5 rounded-full",
          "bg-gradient-to-r from-emerald-500 to-violet-500 text-white font-medium",
          "hover:from-emerald-600 hover:to-violet-600 transition-all",
          "shadow-lg hover:shadow-xl",
          className
        )}
      >
        <Scan className="w-4 h-4" />
        <span>Scan Food</span>
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={onClick}
        type="button"
        aria-label="Scan food"
        className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center",
          "bg-gradient-to-br from-emerald-500/20 to-violet-500/20",
          "hover:from-emerald-500/30 hover:to-violet-500/30",
          "border border-emerald-500/20 hover:border-violet-500/30",
          "transition-all duration-200",
          className
        )}
      >
        <Scan className="w-5 h-5 text-emerald-500" />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      type="button"
      aria-label="Scan food"
      className={cn(
        "w-full py-3 px-4 rounded-xl",
        "bg-gradient-to-r from-emerald-500/10 to-violet-500/10",
        "border border-emerald-500/20 hover:border-violet-500/30",
        "flex items-center justify-center gap-2",
        "text-emerald-600 dark:text-emerald-400",
        "hover:from-emerald-500/20 hover:to-violet-500/20",
        "transition-all duration-200",
        className
      )}
    >
      <Scan className="w-5 h-5" />
      <span className="font-medium">Scan Food</span>
    </button>
  );
}

export default UnifiedFoodScanner;
