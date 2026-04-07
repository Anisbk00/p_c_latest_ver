"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scan,
  X,
  Camera,
  AlertCircle,
  CheckCircle,
  Loader2,
  Flashlight,
  SwitchCamera,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ScannedFood {
  id: string;
  name: string;
  brand?: string;
  barcode: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servingSize: number;
  servingUnit: string;
  isVerified: boolean;
  source: "local" | "openfoodfacts";
  image_url?: string;
}

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (food: ScannedFood) => void;
  onNotFound?: (barcode: string) => void;
}

type ScannerStatus = "idle" | "loading" | "scanning" | "found" | "not_found" | "error";

// ═══════════════════════════════════════════════════════════════
// Barcode Scanner Component
// ═══════════════════════════════════════════════════════════════

export function BarcodeScanner({
  open,
  onClose,
  onScan,
  onNotFound,
}: BarcodeScannerProps) {
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [foundFood, setFoundFood] = useState<ScannedFood | null>(null);

  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);

  // Import html5-qrcode dynamically to avoid SSR issues
  const [Html5Qrcode, setHtml5Qrcode] = useState<typeof import("html5-qrcode").Html5Qrcode | null>(null);

  useEffect(() => {
    import("html5-qrcode").then((module) => {
      setHtml5Qrcode(() => module.Html5Qrcode);
    });
  }, []);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopScanner();
      setStatus("idle");
      setStatusMessage("");
      setScannedBarcode(null);
      setFoundFood(null);
      setManualBarcode("");
      setShowManualInput(false);
    }
  }, [open]);

  // Start scanner when opened
  useEffect(() => {
    if (open && Html5Qrcode && !showManualInput) {
      startScanner();
    }
  }, [open, Html5Qrcode, showManualInput]);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || !Html5Qrcode || isScanningRef.current) return;

    try {
      setStatus("loading");
      setStatusMessage("Opening camera...");

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
        setHasPermission(false);
        setStatus("error");
        setStatusMessage("Camera is not available on this device. Enter barcode manually.");
        return;
      }

      // Check camera permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");

      if (cameras.length === 0) {
        setHasPermission(false);
        setStatus("error");
        setStatusMessage("No camera detected. Check permissions or enter barcode manually.");
        return;
      }

      // Create scanner instance
      const scannerId = "barcode-scanner-video";
      html5QrCodeRef.current = new Html5Qrcode(scannerId);
      isScanningRef.current = true;

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 150 },
          aspectRatio: 1.0,
        },
        onScanSuccess,
        onScanFailure
      );

      setHasPermission(true);
      setStatus("scanning");
      setStatusMessage("Align barcode inside the frame");
    } catch (error) {
      console.error("Scanner start error:", error);
      setHasPermission(false);
      setStatus("error");
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      if (errorMessage.includes('notallowed') || errorMessage.includes('permission') || errorMessage.includes('denied')) {
        setStatusMessage("Camera permission is blocked. Allow camera access in device settings.");
      } else {
        setStatusMessage("Unable to open camera. Enter barcode manually.");
      }
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
    if (scannedBarcode === decodedText) return; // Prevent duplicate scans

    setScannedBarcode(decodedText);
    setStatus("loading");
    setStatusMessage("Looking up product...");

    // Stop scanner while looking up
    await stopScanner();

    try {
      const response = await fetch(`/api/barcode-lookup?barcode=${decodedText}`);
      const data = await response.json();

      if (data.found && data.food) {
        setStatus("found");
        setStatusMessage(`Found: ${data.food.name}`);
        setFoundFood(data.food);

        // Auto-close and return after a brief delay
        setTimeout(() => {
          onScan(data.food);
        }, 800);
      } else {
        setStatus("not_found");
        setStatusMessage("Barcode not found in database");
        onNotFound?.(decodedText);
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      setStatus("error");
      setStatusMessage("Could not look up barcode. Check connection and try again.");
    }
  };

  const onScanFailure = (error: string) => {
    // Ignore - this is called frequently when no barcode is in view
  };

  const handleManualSubmit = async () => {
    if (!manualBarcode.trim()) return;

    setStatus("loading");
    setStatusMessage("Looking up product...");

    try {
      const response = await fetch(`/api/barcode-lookup?barcode=${manualBarcode.trim()}`);
      const data = await response.json();

      if (data.found && data.food) {
        setStatus("found");
        setStatusMessage(`Found: ${data.food.name}`);
        setFoundFood(data.food);

        setTimeout(() => {
          onScan(data.food);
        }, 800);
      } else {
        setStatus("not_found");
        setStatusMessage("Barcode not found in database");
        onNotFound?.(manualBarcode.trim());
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      setStatus("error");
      setStatusMessage("Could not look up barcode. Check connection and try again.");
    }
  };

  const handleRetry = () => {
    setScannedBarcode(null);
    setFoundFood(null);
    setStatus("idle");
    setStatusMessage("");
    if (!showManualInput) {
      startScanner();
    }
  };

  const toggleManualInput = () => {
    setShowManualInput(!showManualInput);
    if (!showManualInput) {
      stopScanner();
      setStatus("idle");
      setStatusMessage("");
    } else {
      startScanner();
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-linear-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2 text-white">
          <Scan className="w-5 h-5" />
          <span className="font-medium">Scan Barcode</span>
        </div>
        <button
          onClick={onClose}
          type="button"
          aria-label="Close barcode scanner"
          title="Close barcode scanner"
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera View */}
      {!showManualInput && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={scannerRef}
            id="barcode-scanner-video"
            className="w-full h-full"
          />

          {/* Scanning Overlay */}
          {status === "scanning" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-72 h-36 border-2 border-white/50 rounded-xl relative">
                {/* Animated scan line */}
                <motion.div
                  className="absolute left-0 right-0 h-0.5 bg-emerald-400"
                  animate={{ top: ["0%", "100%", "0%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-xl" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Input Mode */}
      {showManualInput && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center p-6">
          <Keyboard className="w-12 h-12 text-white/50 mb-4" />
          <p className="text-white/70 text-center mb-4">
            Enter the barcode number manually
          </p>
          <div className="w-full max-w-sm space-y-4">
            <Input
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="e.g., 3017620422003"
              className="bg-white/10 border-white/20 text-white text-center text-lg h-12"
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleManualSubmit();
                }
              }}
            />
            <Button
              onClick={handleManualSubmit}
              disabled={!manualBarcode.trim() || status === "loading"}
              className="w-full bg-emerald-500 hover:bg-emerald-600 h-12"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Looking up...
                </>
              ) : (
                "Look up Barcode"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Status Message */}
      <div className="absolute bottom-32 left-0 right-0 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {status === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 text-white/80"
            >
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{statusMessage}</span>
            </motion.div>
          )}

          {status === "found" && foundFood && (
            <motion.div
              key="found"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <span className="text-white font-medium">{statusMessage}</span>
              {foundFood.brand && (
                <span className="text-white/60 text-sm">{foundFood.brand}</span>
              )}
            </motion.div>
          )}

          {status === "not_found" && (
            <motion.div
              key="not_found"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-amber-400" />
              </div>
              <span className="text-white/80 text-center px-4">{statusMessage}</span>
              <p className="text-white/50 text-sm text-center px-4">
                Try typing the barcode number manually
              </p>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                Try Again
              </Button>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-rose-400" />
              </div>
              <span className="text-white/80 text-center px-4">{statusMessage}</span>
              <Button
                variant="outline"
                onClick={toggleManualInput}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <Keyboard className="w-4 h-4 mr-2" />
                Enter Manually
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {status === "scanning" && (
          <p className="text-white/60 text-sm">
            Position the barcode within the frame
          </p>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-linear-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleManualInput}
            className={cn(
              "flex flex-col items-center gap-1 transition-opacity",
              showManualInput ? "text-emerald-400" : "text-white/70"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center",
              showManualInput ? "bg-emerald-500/20" : "bg-white/10"
            )}>
              <Keyboard className="w-5 h-5" />
            </div>
            <span className="text-xs">Manual</span>
          </button>

          {!showManualInput && (
            <button
              onClick={onClose}
              className="flex flex-col items-center gap-1 text-white/70"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-5 h-5" />
              </div>
              <span className="text-xs">Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Safe area for iOS */}
      <div className="absolute bottom-0 left-0 right-0 h-[env(safe-area-inset-bottom,0px)]" />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Compact Barcode Button for Integration
// ═══════════════════════════════════════════════════════════════

export function BarcodeScanButton({
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
      aria-label="Scan barcode"
      className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
        "bg-linear-to-br from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30",
        "border border-emerald-500/30",
        className
      )}
      title="Scan Barcode"
    >
      <Scan className="w-5 h-5 text-emerald-500" />
    </button>
  );
}

export default BarcodeScanner;
