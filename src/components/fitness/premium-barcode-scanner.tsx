/**
 * Premium Barcode Scanner Component
 * 
 * Production-grade barcode scanner with:
 * - Native mobile-like UI
 * - Animated scanning line
 * - Vibration feedback
 * - Manual entry fallback
 * - Offline support
 * - EAN-13, UPC-A, EAN-8, QR support
 * 
 * @module components/fitness/premium-barcode-scanner
 */

"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scan,
  X,
  Keyboard,
  AlertCircle,
  CheckCircle,
  Loader2,
  WifiOff,
  Package,
  ChevronRight,
  Flashlight,
  SwitchCamera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useBarcodeScanner, type ScannedFood } from "@/hooks/use-barcode-scanner";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface PremiumBarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (food: ScannedFood) => void;
  onNotFound?: (barcode: string) => void;
}

type ScannerMode = 'camera' | 'manual';

// ═══════════════════════════════════════════════════════════════
// Animated Scan Line Component
// ═══════════════════════════════════════════════════════════════

function AnimatedScanLine() {
  return (
    <motion.div
      className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-full shadow-lg shadow-emerald-400/50"
      animate={{ 
        top: ["10%", "90%", "10%"],
        opacity: [0.5, 1, 0.5]
      }}
      transition={{ 
        duration: 2.5, 
        repeat: Infinity, 
        ease: "easeInOut",
        times: [0, 0.5, 1]
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// Scan Frame Component
// ═══════════════════════════════════════════════════════════════

function ScanFrame({ isActive }: { isActive: boolean }) {
  return (
    <div className="relative w-72 h-36 sm:w-80 sm:h-40">
      {/* Main frame */}
      <div className={cn(
        "absolute inset-0 rounded-2xl border-2 transition-colors duration-300",
        isActive ? "border-emerald-400" : "border-white/40"
      )}>
        {/* Animated scan line */}
        {isActive && <AnimatedScanLine />}
      </div>
      
      {/* Corner markers */}
      <div className={cn(
        "absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 rounded-tl-xl transition-colors duration-300",
        isActive ? "border-emerald-400" : "border-white"
      )} />
      <div className={cn(
        "absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 rounded-tr-xl transition-colors duration-300",
        isActive ? "border-emerald-400" : "border-white"
      )} />
      <div className={cn(
        "absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 rounded-bl-xl transition-colors duration-300",
        isActive ? "border-emerald-400" : "border-white"
      )} />
      <div className={cn(
        "absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 rounded-br-xl transition-colors duration-300",
        isActive ? "border-emerald-400" : "border-white"
      )} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Status Display Component
// ═══════════════════════════════════════════════════════════════

function StatusDisplay({ 
  status, 
  message, 
  food,
  barcode,
  onRetry,
  onManualEntry,
}: { 
  status: string;
  message: string;
  food?: ScannedFood | null;
  barcode?: string;
  onRetry: () => void;
  onManualEntry: () => void;
}) {
  return (
    <AnimatePresence mode="wait">
      {/* Loading/Processing */}
      {status === 'processing' && (
        <motion.div
          key="processing"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
          <span className="text-white/80 font-medium">{message}</span>
          {barcode && (
            <span className="text-white/50 text-sm font-mono">{barcode}</span>
          )}
        </motion.div>
      )}

      {/* Found */}
      {status === 'found' && food && (
        <motion.div
          key="found"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex flex-col items-center gap-3"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center"
          >
            <CheckCircle className="w-8 h-8 text-white" />
          </motion.div>
          <div className="text-center">
            <span className="text-white font-semibold text-lg">{food.name}</span>
            {food.brand && (
              <span className="text-white/60 block text-sm">{food.brand}</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-white/70 mt-2">
            <span>{food.calories} kcal</span>
            <span className="w-px h-4 bg-white/20" />
            <span>{food.protein}g P</span>
            <span className="w-px h-4 bg-white/20" />
            <span>{food.carbs}g C</span>
            <span className="w-px h-4 bg-white/20" />
            <span>{food.fat}g F</span>
          </div>
        </motion.div>
      )}

      {/* Not Found */}
      {status === 'not_found' && (
        <motion.div
          key="not_found"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col items-center gap-4 px-6"
        >
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Package className="w-8 h-8 text-amber-400" />
          </div>
          <div className="text-center">
            <span className="text-white font-medium">Product Not Found</span>
            <p className="text-white/60 text-sm mt-1">
              This barcode isn't in our database yet. Try entering it manually or adding the food yourself.
            </p>
            {barcode && (
              <span className="text-white/40 text-xs font-mono mt-2 block">{barcode}</span>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              onClick={onRetry}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              Scan Again
            </Button>
            <Button
              onClick={onManualEntry}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Enter Manually
            </Button>
          </div>
        </motion.div>
      )}

      {/* Error */}
      {status === 'error' && (
        <motion.div
          key="error"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col items-center gap-4 px-6"
        >
          <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-400" />
          </div>
          <div className="text-center">
            <span className="text-white font-medium">Scanner Error</span>
            <p className="text-white/60 text-sm mt-1">{message}</p>
          </div>
          <Button
            onClick={onManualEntry}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Keyboard className="w-4 h-4 mr-2" />
            Enter Barcode Manually
          </Button>
        </motion.div>
      )}

      {/* Offline */}
      {status === 'offline' && (
        <motion.div
          key="offline"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col items-center gap-4 px-6"
        >
          <div className="w-16 h-16 rounded-full bg-slate-500/20 flex items-center justify-center">
            <WifiOff className="w-8 h-8 text-slate-400" />
          </div>
          <div className="text-center">
            <span className="text-white font-medium">You're Offline</span>
            <p className="text-white/60 text-sm mt-1">
              Barcode saved for later lookup when you're back online.
            </p>
            {barcode && (
              <span className="text-white/40 text-xs font-mono mt-2 block">{barcode}</span>
            )}
          </div>
          <Button
            onClick={onManualEntry}
            variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <Keyboard className="w-4 h-4 mr-2" />
            Enter Barcode Manually
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// Manual Entry Component
// ═══════════════════════════════════════════════════════════════

function ManualEntry({
  onSubmit,
  isLoading,
}: {
  onSubmit: (barcode: string) => void;
  isLoading: boolean;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
        <Keyboard className="w-8 h-8 text-emerald-400" />
      </div>
      
      <div className="text-center">
        <h3 className="text-white font-semibold text-lg">Enter Barcode</h3>
        <p className="text-white/60 text-sm mt-1">
          Type the barcode number from the product package
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 14))}
          placeholder="e.g., 3017620422003"
          className="bg-white/10 border-white/20 text-white text-center text-lg font-mono h-14 rounded-xl"
          autoFocus
          disabled={isLoading}
        />
        
        <Button
          type="submit"
          disabled={!value.trim() || isLoading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-12 rounded-xl font-medium"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Looking up...
            </>
          ) : (
            <>
              Search Product
              <ChevronRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </form>

      <p className="text-white/40 text-xs text-center">
        Barcode numbers are usually 8-14 digits long
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function PremiumBarcodeScanner({
  open,
  onClose,
  onScan,
  onNotFound,
}: PremiumBarcodeScannerProps) {
  const [mode, setMode] = useState<ScannerMode>('camera');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(true);

  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);

  const {
    status,
    lastResult,
    capabilities,
    processBarcode,
    reset,
  } = useBarcodeScanner();

  // Import html5-qrcode dynamically
  const [Html5Qrcode, setHtml5Qrcode] = useState<typeof import("html5-qrcode").Html5Qrcode | null>(null);

  useEffect(() => {
    import("html5-qrcode").then((module) => {
      setHtml5Qrcode(() => module.Html5Qrcode);
    });
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      stopScanner();
      reset();
      setMode('camera');
      setHasPermission(null);
      setIsScannerActive(true);
    }
  }, [open, reset]);

  // Start scanner when in camera mode
  useEffect(() => {
    if (open && Html5Qrcode && mode === 'camera' && hasPermission !== false) {
      startScanner();
    }
    return () => {
      if (mode === 'camera') {
        stopScanner();
      }
    };
  }, [open, Html5Qrcode, mode]);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || !Html5Qrcode || isScanningRef.current) return;

    try {
      // Check for camera availability
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
        setHasPermission(false);
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");

      if (cameras.length === 0) {
        setHasPermission(false);
        return;
      }

      // Create scanner
      const scannerId = "barcode-scanner-video-premium";
      html5QrCodeRef.current = new Html5Qrcode(scannerId);
      isScanningRef.current = true;

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 300, height: 150 },
          aspectRatio: 2.0,
        },
        onScanSuccess,
        () => {} // Ignore scan failures
      );

      setHasPermission(true);
      setIsScannerActive(true);
    } catch (error) {
      console.error("Scanner error:", error);
      setHasPermission(false);
    }
  }, [Html5Qrcode]);

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current && isScanningRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.error("Error stopping scanner:", e);
      }
      isScanningRef.current = false;
      html5QrCodeRef.current = null;
    }
  }, []);

  const onScanSuccess = async (decodedText: string) => {
    if (status === 'processing' || status === 'found') return; // Prevent duplicate processing

    // Stop scanner
    await stopScanner();
    setIsScannerActive(false);

    // Process barcode
    const result = await processBarcode(decodedText);

    if (result.success && result.food) {
      // Auto-close after showing success
      setTimeout(() => {
        onScan(result.food!);
      }, 1200);
    } else if (result.error?.includes('offline')) {
      onNotFound?.(decodedText);
    } else {
      onNotFound?.(decodedText);
    }
  };

  const handleManualSubmit = useCallback(async (barcode: string) => {
    const result = await processBarcode(barcode);

    if (result.success && result.food) {
      setTimeout(() => {
        onScan(result.food!);
      }, 1000);
    } else {
      onNotFound?.(barcode);
    }
  }, [processBarcode, onScan, onNotFound]);

  const handleRetry = useCallback(() => {
    reset();
    setMode('camera');
    setIsScannerActive(true);
  }, [reset]);

  const toggleMode = useCallback(async () => {
    if (mode === 'camera') {
      await stopScanner();
      setMode('manual');
    } else {
      setMode('camera');
    }
  }, [mode, stopScanner]);

  if (!open) return null;

  const showStatus = status !== 'idle' && status !== 'scanning';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="bg-gradient-to-b from-black/90 via-black/50 to-transparent pt-safe-top">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Scan className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold">Scan Barcode</h2>
                <p className="text-white/50 text-xs">
                  {mode === 'camera' ? 'Align barcode in frame' : 'Enter number manually'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              type="button"
              aria-label="Close scanner"
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Camera View */}
      {mode === 'camera' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={scannerRef}
            id="barcode-scanner-video-premium"
            className="w-full h-full"
          />

          {/* Scanning overlay */}
          {!showStatus && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <ScanFrame isActive={isScannerActive && status === 'scanning'} />
            </div>
          )}

          {/* Darkened edges */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-1/4 bg-gradient-to-b from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute top-1/4 bottom-1/3 left-0 w-8 bg-gradient-to-r from-black/40 to-transparent" />
            <div className="absolute top-1/4 bottom-1/3 right-0 w-8 bg-gradient-to-l from-black/40 to-transparent" />
          </div>
        </div>
      )}

      {/* Manual Entry View */}
      {mode === 'manual' && (
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          <ManualEntry
            onSubmit={handleManualSubmit}
            isLoading={status === 'processing'}
          />
        </div>
      )}

      {/* Status Display */}
      {showStatus && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <StatusDisplay
            status={status}
            message={lastResult?.error || ''}
            food={lastResult?.food}
            barcode={lastResult?.barcode}
            onRetry={handleRetry}
            onManualEntry={toggleMode}
          />
        </div>
      )}

      {/* Bottom Controls */}
      {!showStatus && (
        <div className="absolute bottom-0 left-0 right-0">
          <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-safe-bottom">
            <div className="flex items-center justify-center gap-8 pb-6">
              {/* Manual Entry Toggle */}
              <button
                onClick={toggleMode}
                className={cn(
                  "flex flex-col items-center gap-2 transition-all",
                  mode === 'manual' ? "text-emerald-400" : "text-white/60 hover:text-white"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                  mode === 'manual' 
                    ? "bg-emerald-500/30 ring-2 ring-emerald-400" 
                    : "bg-white/10 hover:bg-white/20"
                )}>
                  <Keyboard className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">Manual</span>
              </button>

              {/* Cancel */}
              <button
                onClick={onClose}
                className="flex flex-col items-center gap-2 text-white/60 hover:text-white transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <X className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">Cancel</span>
              </button>
            </div>

            {/* Instructions */}
            {mode === 'camera' && (
              <div className="text-center pb-4">
                <p className="text-white/40 text-xs">
                  Supported: EAN-13, UPC-A, EAN-8
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Permission Denied Overlay */}
      {hasPermission === false && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-rose-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">Camera Access Required</h3>
              <p className="text-white/60 text-sm mt-2">
                Please allow camera access in your device settings to scan barcodes.
              </p>
            </div>
            <Button
              onClick={toggleMode}
              className="bg-emerald-500 hover:bg-emerald-600 text-white mt-2"
            >
              <Keyboard className="w-4 h-4 mr-2" />
              Enter Barcode Manually
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Export Aliases for Backward Compatibility
// ═══════════════════════════════════════════════════════════════

export { PremiumBarcodeScanner as BarcodeScanner };
export type { ScannedFood };

// ═══════════════════════════════════════════════════════════════
// Quick Launch Button
// ═══════════════════════════════════════════════════════════════

export function BarcodeScanButton({
  onClick,
  className,
  variant = 'default',
}: {
  onClick: () => void;
  className?: string;
  variant?: 'default' | 'minimal' | 'pill';
}) {
  if (variant === 'pill') {
    return (
      <button
        onClick={onClick}
        type="button"
        aria-label="Scan barcode"
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full",
          "bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium",
          "hover:from-emerald-600 hover:to-teal-600 transition-all",
          "shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40",
          className
        )}
      >
        <Scan className="w-4 h-4" />
        <span>Scan</span>
      </button>
    );
  }

  if (variant === 'minimal') {
    return (
      <button
        onClick={onClick}
        type="button"
        aria-label="Scan barcode"
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center",
          "bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors",
          "border border-emerald-500/20",
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
      aria-label="Scan barcode"
      className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center",
        "bg-gradient-to-br from-emerald-500/20 to-teal-500/20",
        "hover:from-emerald-500/30 hover:to-teal-500/30",
        "border border-emerald-500/30 hover:border-emerald-500/50",
        "transition-all duration-200",
        className
      )}
    >
      <Scan className="w-6 h-6 text-emerald-500" />
    </button>
  );
}

export default PremiumBarcodeScanner;
