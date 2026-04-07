'use client';

import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import {
  Utensils,
  Dumbbell,
  Heart,
  Pill,
  ChevronDown,
  Calendar,
  Target,
  Edit3,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfidenceBadge } from './confidence-badge';

// Types
export type ExperimentType = 'nutrition' | 'workout' | 'habit' | 'supplement';
export type ExperimentStatus = 'active' | 'completed' | 'abandoned';

export interface AdherenceLogEntry {
  date: string | Date;
  completed: boolean;
}

export interface ExperimentCardProps {
  id: string;
  title: string;
  description: string;
  experimentType: ExperimentType;
  intervention: string;
  durationWeeks: number;
  startDate: string | Date;
  endDate?: string | Date;
  projectedEffect?: string;
  effectConfidence?: number;
  adherenceScore?: number;
  adherenceLog?: AdherenceLogEntry[];
  status: ExperimentStatus;
  results?: string;
  onEdit?: () => void;
  onComplete?: () => void;
  className?: string;
}

// Type configuration
const typeConfig = {
  nutrition: {
    icon: Utensils,
    label: 'Nutrition',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    ringColor: '#f59e0b',
  },
  workout: {
    icon: Dumbbell,
    label: 'Workout',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/50',
    ringColor: '#f43f5e',
  },
  habit: {
    icon: Heart,
    label: 'Habit',
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-950/50',
    ringColor: '#14b8a6',
  },
  supplement: {
    icon: Pill,
    label: 'Supplement',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-950/50',
    ringColor: '#8b5cf6',
  },
};

// Status configuration
const statusConfig = {
  active: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  completed: {
    label: 'Completed',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  abandoned: {
    label: 'Abandoned',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-950/50 dark:text-gray-300 border-gray-200 dark:border-gray-800',
  },
};

// Progress Ring Component
interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  showValue?: boolean;
}

function ProgressRing({
  progress,
  size = 80,
  strokeWidth = 6,
  color,
  showValue = true,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        role="img"
        aria-label={`Progress: ${Math.round(progress * 100)}%`}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      {showValue && (
        <motion.span
          className="absolute text-sm font-bold"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          {Math.round(progress * 100)}%
        </motion.span>
      )}
    </div>
  );
}

// Adherence Dots Component
interface AdherenceDotsProps {
  log: AdherenceLogEntry[];
  maxDots?: number;
}

function AdherenceDots({ log, maxDots = 14 }: AdherenceDotsProps) {
  const displayLog = log.slice(-maxDots);
  const emptySlots = Math.max(0, maxDots - displayLog.length);

  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`Adherence log: ${displayLog.filter(d => d.completed).length} of ${displayLog.length} days completed`}>
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="size-2.5 rounded-full bg-muted/30"
          aria-hidden="true"
        />
      ))}
      {displayLog.map((entry, index) => {
        const dateStr = typeof entry.date === 'string' ? entry.date : entry.date.toLocaleDateString();
        return (
          <Tooltip key={`${dateStr}-${index}`}>
            <TooltipTrigger asChild>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.02, duration: 0.2 }}
                className={cn(
                  'size-2.5 rounded-full cursor-pointer transition-transform hover:scale-125',
                  entry.completed
                    ? 'bg-emerald-500 dark:bg-emerald-400'
                    : 'bg-red-400 dark:bg-red-500'
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>{dateStr}</p>
              <p className="font-medium">{entry.completed ? 'Completed' : 'Missed'}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// Timeline Component
interface TimelineProps {
  startDate: string | Date;
  endDate?: string | Date;
  durationWeeks: number;
  status: ExperimentStatus;
}

function Timeline({ startDate, endDate, durationWeeks, status }: TimelineProps) {
  const start = useMemo(() => new Date(startDate), [startDate]);
  const end = useMemo(() => endDate ? new Date(endDate) : null, [endDate]);
  const now = new Date();

  const totalDays = durationWeeks * 7;
  const daysCompleted = useMemo(() => {
    if (status === 'completed' && end) {
      return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (status === 'abandoned') {
      return Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }
    return Math.min(
      Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
      totalDays
    );
  }, [start, end, status, totalDays, now]);

  const displayDays = Math.max(0, daysCompleted);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Calendar className="size-4" aria-hidden="true" />
      <span>
        {displayDays} / {totalDays} days
      </span>
      <span className="text-xs opacity-70">
        ({durationWeeks} {durationWeeks === 1 ? 'week' : 'weeks'})
      </span>
    </div>
  );
}

// Main ExperimentCard Component
export function ExperimentCard({
  id,
  title,
  description,
  experimentType,
  intervention,
  durationWeeks,
  startDate,
  endDate,
  projectedEffect,
  effectConfidence,
  adherenceScore = 0,
  adherenceLog = [],
  status,
  results,
  onEdit,
  onComplete,
  className,
}: ExperimentCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const config = typeConfig[experimentType];
  const TypeIcon = config.icon;
  const statusConf = statusConfig[status];

  const adherenceProgress = adherenceScore / 100;

  return (
    <Card
      className={cn(
        'overflow-hidden transition-shadow hover:shadow-md',
        status === 'active' && 'ring-1 ring-emerald-200 dark:ring-emerald-800',
        className
      )}
      role="article"
      aria-labelledby={`experiment-title-${id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Type Icon */}
            <div
              className={cn(
                'flex-shrink-0 p-2 rounded-lg',
                config.bgColor
              )}
              aria-hidden="true"
            >
              <TypeIcon className={cn('size-5', config.color)} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle
                  id={`experiment-title-${id}`}
                  className="text-base truncate"
                >
                  {title}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={cn('text-xs', statusConf.className)}
                >
                  {statusConf.label}
                </Badge>
              </div>
              <CardDescription className="mt-1 line-clamp-2">
                {description}
              </CardDescription>
            </div>
          </div>

          {/* Adherence Progress Ring */}
          <div className="flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-pointer">
                  <ProgressRing
                    progress={adherenceProgress}
                    color={config.ringColor}
                    size={72}
                    strokeWidth={5}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="font-medium">Adherence Score</p>
                <p className="text-xs opacity-80">{adherenceScore}% completion rate</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Intervention */}
        <div className="flex items-start gap-2">
          <Target className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Intervention</p>
            <p className="text-sm font-medium">{intervention}</p>
          </div>
        </div>

        {/* Timeline */}
        <Timeline
          startDate={startDate}
          endDate={endDate}
          durationWeeks={durationWeeks}
          status={status}
        />

        {/* Projected Effect */}
        {projectedEffect && (
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Projected Effect
              </p>
              <p className="text-sm">{projectedEffect}</p>
            </div>
            {effectConfidence !== undefined && (
              <ConfidenceBadge confidence={effectConfidence} size="sm" showLabel={false} />
            )}
          </div>
        )}

        {/* Adherence Dots */}
        {adherenceLog.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
              Recent Adherence
            </p>
            <AdherenceDots log={adherenceLog} />
          </div>
        )}

        {/* Results (for completed experiments) */}
        {status === 'completed' && results && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
          >
            <div className="flex items-start gap-2">
              <CheckCircle className="size-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide font-medium">
                  Results
                </p>
                <p className="text-sm text-blue-900 dark:text-blue-100 mt-0.5">{results}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Expandable Details */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground hover:text-foreground"
            >
              <span className="text-xs">{isOpen ? 'Hide details' : 'Show details'}</span>
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="size-4" />
              </motion.div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="pt-3 space-y-3"
            >
              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Started</p>
                  <p className="font-medium">
                    {new Date(startDate).toLocaleDateString()}
                  </p>
                </div>
                {endDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Ended</p>
                    <p className="font-medium">
                      {new Date(endDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Experiment ID */}
              <div className="text-xs text-muted-foreground">
                ID: {id}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {status === 'active' && (
                  <>
                    {onEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onEdit}
                        className="gap-1.5"
                      >
                        <Edit3 className="size-3.5" />
                        Edit
                      </Button>
                    )}
                    {onComplete && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onComplete}
                        className="gap-1.5"
                      >
                        <CheckCircle className="size-3.5" />
                        Complete
                      </Button>
                    )}
                  </>
                )}
                {status === 'abandoned' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <XCircle className="size-4 text-red-500" />
                    <span>This experiment was abandoned</span>
                  </div>
                )}
              </div>
            </motion.div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default ExperimentCard;
