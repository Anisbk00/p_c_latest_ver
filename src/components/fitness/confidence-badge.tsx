"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ConfidenceBadgeProps {
  /** Confidence level as a percentage (0-100) */
  confidence: number;
  /** Whether to show the text label */
  showLabel?: boolean;
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

type ConfidenceLevel = "high" | "medium" | "low";

interface ConfidenceConfig {
  level: ConfidenceLevel;
  label: string;
  dotColor: string;
  textColor: string;
  bgColor: string;
}

const getConfidenceConfig = (confidence: number): ConfidenceConfig => {
  if (confidence >= 80) {
    return {
      level: "high",
      label: "High confidence",
      dotColor: "bg-emerald-500 dark:bg-emerald-400",
      textColor: "text-emerald-700 dark:text-emerald-300",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/50",
    };
  }
  if (confidence >= 50) {
    return {
      level: "medium",
      label: "Medium confidence",
      dotColor: "bg-amber-500 dark:bg-amber-400",
      textColor: "text-amber-700 dark:text-amber-300",
      bgColor: "bg-amber-50 dark:bg-amber-950/50",
    };
  }
  return {
    level: "low",
    label: "Low confidence",
    dotColor: "bg-orange-500 dark:bg-orange-400",
    textColor: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-50 dark:bg-orange-950/50",
  };
};

const sizeConfig = {
  xs: {
    container: "gap-1 px-1.5 py-0.5 text-[10px]",
    dot: "size-1.5",
  },
  sm: {
    container: "gap-1.5 px-2 py-0.5 text-xs",
    dot: "size-2",
  },
  md: {
    container: "gap-2 px-2.5 py-1 text-sm",
    dot: "size-2.5",
  },
  lg: {
    container: "gap-2.5 px-3 py-1.5 text-base",
    dot: "size-3",
  },
};

/**
 * ConfidenceBadge displays AI confidence levels with visual indicators.
 * Shows a color-coded circular indicator, percentage, and optional label.
 * Includes a tooltip explaining what confidence means.
 */
export function ConfidenceBadge({
  confidence,
  showLabel = true,
  size = "md",
  className,
}: ConfidenceBadgeProps) {
  // Clamp confidence to valid range
  const clampedConfidence = Math.max(0, Math.min(100, confidence));
  const config = getConfidenceConfig(clampedConfidence);
  const sizes = sizeConfig[size];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-label={`AI confidence: ${clampedConfidence}% - ${config.label}`}
          className={cn(
            "inline-flex items-center rounded-full font-medium transition-colors",
            config.bgColor,
            config.textColor,
            sizes.container,
            className
          )}
        >
          {/* Circular indicator */}
          <span
            className={cn(
              "rounded-full ring-2 ring-white dark:ring-gray-900",
              config.dotColor,
              sizes.dot
            )}
            aria-hidden="true"
          />
          {/* Percentage */}
          <span className="font-semibold">{clampedConfidence}%</span>
          {/* Optional label */}
          {showLabel && (
            <span className="hidden sm:inline opacity-80">
              {config.label}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs text-center"
        sideOffset={4}
      >
        <p className="text-sm">
          <strong>Confidence Score</strong>
        </p>
        <p className="text-xs opacity-90 mt-1">
          This indicates how certain the AI is about its assessment. Higher
          confidence means more reliable results.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default ConfidenceBadge;
