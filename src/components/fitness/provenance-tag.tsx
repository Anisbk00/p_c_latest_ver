"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  User,
  Watch,
  Tag,
  Brain,
  Calculator,
  Users,
  Info,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ProvenanceSource =
  | "manual"
  | "device"
  | "label"
  | "model"
  | "estimated"
  | "community";

export interface ProvenanceTagProps {
  /** Source of the data */
  source: ProvenanceSource;
  /** Timestamp when the data was recorded or derived */
  timestamp: Date | string;
  /** Optional rationale explaining how the value was derived */
  rationale?: string;
  /** Device name for device sources */
  deviceName?: string;
  /** AI model name for model sources */
  modelName?: string;
  /** Data lineage - what data sources contributed to this value */
  dataLineage?: string[];
  /** Confidence score (0-100) for estimated/model values */
  confidence?: number;
  /** Additional CSS classes */
  className?: string;
}

const sourceConfig: Record<
  ProvenanceSource,
  {
    icon: React.ElementType;
    label: string;
    bgClass: string;
    darkBgClass: string;
    textClass: string;
    darkTextClass: string;
  }
> = {
  manual: {
    icon: User,
    label: "Manual Entry",
    bgClass: "bg-emerald-100",
    darkBgClass: "dark:bg-emerald-950/50",
    textClass: "text-emerald-700",
    darkTextClass: "dark:text-emerald-300",
  },
  device: {
    icon: Watch,
    label: "Device Sync",
    bgClass: "bg-blue-100",
    darkBgClass: "dark:bg-blue-950/50",
    textClass: "text-blue-700",
    darkTextClass: "dark:text-blue-300",
  },
  label: {
    icon: Tag,
    label: "Label",
    bgClass: "bg-purple-100",
    darkBgClass: "dark:bg-purple-950/50",
    textClass: "text-purple-700",
    darkTextClass: "dark:text-purple-300",
  },
  model: {
    icon: Brain,
    label: "AI Model",
    bgClass: "bg-amber-100",
    darkBgClass: "dark:bg-amber-950/50",
    textClass: "text-amber-700",
    darkTextClass: "dark:text-amber-300",
  },
  estimated: {
    icon: Calculator,
    label: "Estimated",
    bgClass: "bg-gray-100",
    darkBgClass: "dark:bg-gray-800/50",
    textClass: "text-gray-700",
    darkTextClass: "dark:text-gray-300",
  },
  community: {
    icon: Users,
    label: "Community",
    bgClass: "bg-rose-100",
    darkBgClass: "dark:bg-rose-950/50",
    textClass: "text-rose-700",
    darkTextClass: "dark:text-rose-300",
  },
};

/**
 * ProvenanceTag shows the source and origin of data with transparency.
 * On desktop: hover to see details.
 * On mobile: tap to expand inline details (no hover on touch devices).
 */
export function ProvenanceTag({
  source,
  timestamp,
  rationale,
  deviceName,
  modelName,
  dataLineage,
  confidence,
  className,
}: ProvenanceTagProps) {
  const [expanded, setExpanded] = React.useState(false);
  const config = sourceConfig[source];
  const Icon = config.icon;

  const parsedTimestamp =
    typeof timestamp === "string" ? new Date(timestamp) : timestamp;

  const relativeTime = formatDistanceToNow(parsedTimestamp, {
    addSuffix: true,
  });

  const formattedTimestamp = parsedTimestamp.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const getSourceDetail = () => {
    switch (source) {
      case "device":
        return deviceName ? `Device: ${deviceName}` : "Synced from device";
      case "model":
        return modelName ? `Model: ${modelName}` : "AI-generated estimate";
      case "community":
        return "Sourced from community data";
      case "estimated":
        return "Calculated estimate";
      case "label":
        return "User-applied label";
      case "manual":
        return "User-entered value";
      default:
        return config.label;
    }
  };

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
          config.bgClass,
          config.darkBgClass,
          config.textClass,
          config.darkTextClass,
          "hover:opacity-80 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          className
        )}
        aria-label={`Data source: ${config.label}, recorded ${relativeTime}. Tap for details.`}
        aria-expanded={expanded}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">{config.label}</span>
        <span aria-hidden="true">
          {relativeTime.replace(/^about /, "")}
        </span>
        <ChevronDown
          className={cn(
            "h-2.5 w-2.5 transition-transform duration-200 ml-0.5",
            expanded && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Expandable detail panel — works on both mobile (tap) and desktop */}
      {expanded && (
        <div
          className={cn(
            "mt-1.5 ml-1 p-3 rounded-xl text-xs space-y-2 z-50 max-w-xs",
            "bg-popover text-popover-foreground border shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-150"
          )}
          role="region"
          aria-label={`${config.label} details`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium">
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{config.label}</span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-0.5 rounded-full hover:bg-muted transition-colors"
              aria-label="Close details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="opacity-90">
            <p>{getSourceDetail()}</p>
            <p className="mt-1">
              Recorded: {formattedTimestamp} ({relativeTime})
            </p>
          </div>

          {confidence !== undefined && (
            <div className="opacity-90">
              <p className="font-medium">
                Confidence: {confidence >= 80 ? 'High' : confidence >= 50 ? 'Medium' : 'Low'} ({confidence}%)
              </p>
              <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                <div
                  className={cn(
                    "h-1.5 rounded-full",
                    confidence >= 80 ? "bg-emerald-500" : confidence >= 50 ? "bg-amber-500" : "bg-rose-500"
                  )}
                  style={{ width: `${confidence}%` }}
                />
              </div>
            </div>
          )}

          {dataLineage && dataLineage.length > 0 && (
            <div className="pt-2 border-t">
              <p className="font-medium mb-1">Data sources used:</p>
              <ul className="opacity-80 space-y-0.5">
                {dataLineage.map((item, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rationale && (
            <div className="pt-2 border-t opacity-80">
              <p>
                <span className="font-medium">How derived: </span>
                {rationale}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProvenanceTag;
