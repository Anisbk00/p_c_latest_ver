"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  AlertTriangle,
  Link2,
  Sparkles,
  X,
  ChevronDown,
  Info,
  Lightbulb,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ConfidenceBadge } from "./confidence-badge";
import { ProvenanceTag, type ProvenanceSource } from "./provenance-tag";

export type InsightCategory = "trend" | "anomaly" | "correlation" | "prediction";

export interface InsightCardProps {
  /** Main insight title */
  title: string;
  /** Detailed explanation */
  description: string;
  /** Optional action suggestion e.g., "Try: +20g protein at dinner for 14 days" */
  actionSuggestion?: string;
  /** Confidence level as a percentage (0-100) */
  confidence: number;
  /** Category of the insight */
  category: InsightCategory;
  /** What data sources were used to generate this insight */
  dataSources?: string[];
  /** Priority level (higher = more important) */
  priority?: number;
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Callback when action button is clicked */
  onAct?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Source of the insight (for provenance) */
  source?: ProvenanceSource;
  /** Timestamp when insight was generated */
  generatedAt?: Date | string;
  /** AI model name if applicable */
  modelName?: string;
  /** Rationale explaining how the insight was derived */
  rationale?: string;
}

const categoryConfig: Record<
  InsightCategory,
  {
    icon: React.ElementType;
    label: string;
    bgColor: string;
    iconColor: string;
    borderColor: string;
  }
> = {
  trend: {
    icon: TrendingUp,
    label: "Trend",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  anomaly: {
    icon: AlertTriangle,
    label: "Anomaly",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  correlation: {
    icon: Link2,
    label: "Correlation",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
  prediction: {
    icon: Sparkles,
    label: "Prediction",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
};

/**
 * InsightCard displays AI-generated insights with full provenance and confidence.
 * Features animated entrance, expandable provenance details, and accessible keyboard navigation.
 */
export function InsightCard({
  title,
  description,
  actionSuggestion,
  confidence,
  category,
  dataSources,
  priority,
  onDismiss,
  onAct,
  className,
  source = "model",
  generatedAt = new Date(),
  modelName,
  rationale,
}: InsightCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);
  const config = categoryConfig[category];
  const CategoryIcon = config.icon;

  const handleDismiss = () => {
    setIsVisible(false);
    // Allow animation to complete before calling onDismiss
    setTimeout(() => {
      onDismiss?.();
    }, 200);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsExpanded(!isExpanded);
    }
    if (event.key === "Escape" && isExpanded) {
      setIsExpanded(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{
            duration: 0.25,
            ease: [0.4, 0, 0.2, 1],
          }}
          className={cn("relative", className)}
        >
          <Card
            className={cn(
              "group relative overflow-hidden transition-all duration-200",
              "hover:shadow-lg hover:-translate-y-0.5",
              "border border-gray-200 dark:border-gray-800",
              "bg-white dark:bg-gray-950",
              config.borderColor,
              "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            )}
            role="article"
            aria-label={`Insight: ${title}`}
          >
            {/* Priority indicator */}
            {priority !== undefined && priority > 0 && (
              <div
                className="absolute top-0 left-0 h-1 bg-gradient-to-r from-primary to-primary/50"
                style={{ width: `${Math.min(priority * 10, 100)}%` }}
                aria-hidden="true"
              />
            )}

            <CardContent className="p-0">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 p-4 pb-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Category icon */}
                  <div
                    className={cn(
                      "flex-shrink-0 p-2 rounded-lg transition-colors",
                      config.bgColor,
                      "group-hover:scale-105 transition-transform"
                    )}
                    aria-label={`${config.label} insight`}
                  >
                    <CategoryIcon
                      className={cn("size-5", config.iconColor)}
                      aria-hidden="true"
                    />
                  </div>

                  {/* Title and confidence */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base leading-tight text-gray-900 dark:text-gray-100">
                        {title}
                      </h3>
                    </div>
                    <ConfidenceBadge
                      confidence={confidence}
                      size="sm"
                      showLabel={false}
                    />
                  </div>
                </div>

                {/* Dismiss button */}
                {onDismiss && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDismiss}
                    className={cn(
                      "flex-shrink-0 size-8 rounded-full",
                      "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
                      "dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800",
                      "focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                    aria-label="Dismiss insight"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>

              {/* Description */}
              <div className="px-4 pb-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {description}
                </p>
              </div>

              {/* Action suggestion */}
              {actionSuggestion && (
                <div className="px-4 pb-3">
                  <button
                    onClick={onAct}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onAct?.();
                      }
                    }}
                    disabled={!onAct}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium",
                      "bg-primary/10 text-primary hover:bg-primary/20",
                      "dark:bg-primary/20 dark:hover:bg-primary/30",
                      "transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      onAct && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
                      !onAct && "cursor-default opacity-80"
                    )}
                    aria-label={`Action suggestion: ${actionSuggestion}`}
                  >
                    <Lightbulb className="size-4" aria-hidden="true" />
                    <span>{actionSuggestion}</span>
                  </button>
                </div>
              )}

              {/* Provenance section - Always show for AI-generated insights */}
              <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                <CollapsibleTrigger
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-4 py-3",
                    "text-xs font-medium text-gray-500 dark:text-gray-400",
                    "bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900",
                    "transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                  onKeyDown={handleKeyDown}
                  aria-expanded={isExpanded}
                  aria-controls="provenance-content"
                >
                  <span className="flex items-center gap-2">
                    <Brain className="size-3.5" aria-hidden="true" />
                    <span className="flex items-center gap-2">
                      AI-Generated
                      <ProvenanceTag
                        source={source}
                        timestamp={generatedAt}
                        modelName={modelName}
                        rationale={rationale}
                        className="ml-1"
                      />
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div
                    id="provenance-content"
                    className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-3"
                  >
                    {/* Provenance Details */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Provenance
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Source:</span>
                          <span className="ml-1 font-medium capitalize">{source === 'model' ? 'AI Model' : source}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Generated:</span>
                          <span className="ml-1 font-medium">
                            {typeof generatedAt === 'string' 
                              ? new Date(generatedAt).toLocaleDateString() 
                              : generatedAt.toLocaleDateString()}
                          </span>
                        </div>
                        {modelName && (
                          <div className="col-span-2">
                            <span className="text-gray-500 dark:text-gray-400">Model:</span>
                            <span className="ml-1 font-medium">{modelName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Rationale */}
                    {rationale && (
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          How this was derived:
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                          {rationale}
                        </p>
                      </div>
                    )}
                    
                    {/* Data Sources */}
                    {dataSources && dataSources.length > 0 && (
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Data sources used:
                        </p>
                        <ul className="space-y-1">
                          {dataSources.map((dataSource, index) => (
                            <li
                              key={index}
                              className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300"
                            >
                              <span className="size-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                              {dataSource}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Confidence Explanation */}
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-medium">Confidence: {confidence}%</span>
                        {" — "}
                        {confidence >= 80 
                          ? "High confidence based on strong data patterns."
                          : confidence >= 50 
                          ? "Moderate confidence. More data may improve accuracy."
                          : "Lower confidence. Consider additional data points."}
                      </p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default InsightCard;
