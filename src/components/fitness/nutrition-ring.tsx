'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MacroData {
  current: number;
  target: number;
}

interface NutritionRingProps {
  calories: MacroData;
  protein: MacroData;
  carbs: MacroData;
  fat: MacroData;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface RingConfig {
  size: number;
  strokeWidth: number;
  centerTextSize: string;
  labelSize: string;
  spacing: number;
}

const sizeConfigs: Record<'sm' | 'md' | 'lg', RingConfig> = {
  sm: {
    size: 160,
    strokeWidth: 8,
    centerTextSize: 'text-lg',
    labelSize: 'text-xs',
    spacing: 4,
  },
  md: {
    size: 220,
    strokeWidth: 12,
    centerTextSize: 'text-2xl',
    labelSize: 'text-sm',
    spacing: 6,
  },
  lg: {
    size: 300,
    strokeWidth: 16,
    centerTextSize: 'text-3xl',
    labelSize: 'text-base',
    spacing: 8,
  },
};

const macroColors = {
  calories: 'var(--calories, #f59e0b)',
  protein: 'var(--protein, #ef4444)',
  carbs: 'var(--carbs, #3b82f6)',
  fat: 'var(--fat, #8b5cf6)',
};

interface ArcSegmentProps {
  radius: number;
  strokeWidth: number;
  startAngle: number;
  endAngle: number;
  progress: number;
  color: string;
  label: string;
  value: number;
  target: number;
  unit: string;
  labelSize: string;
  onHover: (hovered: boolean, percentage: number) => void;
  isHovered: boolean;
  showPercentage: boolean;
  percentage: number;
}

function ArcSegment({
  radius,
  strokeWidth,
  startAngle,
  endAngle,
  progress,
  color,
  label,
  value,
  target,
  unit,
  labelSize,
  onHover,
  isHovered,
  showPercentage,
  percentage,
}: ArcSegmentProps) {
  const centerX = radius + strokeWidth;
  const centerY = radius + strokeWidth;

  const angleToCoords = (angle: number, r: number) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: centerX + r * Math.cos(radians),
      y: centerY + r * Math.sin(radians),
    };
  };

  const circumference = ((endAngle - startAngle) / 360) * 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const labelAngle = (startAngle + endAngle) / 2;
  const labelRadius = radius + strokeWidth + 20;
  const labelPos = angleToCoords(labelAngle, labelRadius);

  return (
    <g
      onMouseEnter={() => onHover(true, percentage)}
      onMouseLeave={() => onHover(false, 0)}
      className="cursor-pointer"
      role="img"
      aria-label={`${label}: ${value}${unit} of ${target}${unit} (${percentage.toFixed(0)}%)`}
    >
      {/* Background arc */}
      <motion.circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={0}
        transform={`rotate(${startAngle}, ${centerX}, ${centerY})`}
        className="text-muted/20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
      
      {/* Progress arc */}
      <motion.circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset }}
        transition={{ duration: 1, ease: 'easeOut' }}
        transform={`rotate(${startAngle}, ${centerX}, ${centerY})`}
        style={{ filter: isHovered ? `drop-shadow(0 0 8px ${color})` : 'none' }}
      />

      {/* Label and value */}
      <foreignObject
        x={labelPos.x - 40}
        y={labelPos.y - 15}
        width="80"
        height="40"
        className="pointer-events-none"
      >
        <div className="flex flex-col items-center justify-center text-center">
          <span className={cn(labelSize, 'font-medium text-foreground/70')}>
            {label}
          </span>
          <AnimatePresence mode="wait">
            {showPercentage && isHovered ? (
              <motion.span
                key="percentage"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className={cn(labelSize, 'font-bold')}
                style={{ color }}
              >
                {percentage.toFixed(0)}%
              </motion.span>
            ) : (
              <motion.span
                key="value"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className={cn(labelSize, 'font-semibold text-foreground')}
              >
                {value}{unit}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </foreignObject>
    </g>
  );
}

export function NutritionRing({
  calories,
  protein,
  carbs,
  fat,
  size = 'md',
  className,
}: NutritionRingProps) {
  const config = sizeConfigs[size];
  const [hoveredMacro, setHoveredMacro] = useState<string | null>(null);
  const [hoveredPercentage, setHoveredPercentage] = useState(0);

  const mainRadius = config.size / 2 - config.strokeWidth;
  const arcRadius = mainRadius + config.strokeWidth + config.spacing + config.strokeWidth / 2;
  const totalSize = arcRadius * 2 + config.strokeWidth + 50;

  const progress = useMemo(() => ({
    calories: Math.min(calories.current / Math.max(calories.target, 1), 1),
    protein: Math.min(protein.current / Math.max(protein.target, 1), 1),
    carbs: Math.min(carbs.current / Math.max(carbs.target, 1), 1),
    fat: Math.min(fat.current / Math.max(fat.target, 1), 1),
  }), [calories, protein, carbs, fat]);

  const percentages = useMemo(() => ({
    calories: (calories.current / Math.max(calories.target, 1)) * 100,
    protein: (protein.current / Math.max(protein.target, 1)) * 100,
    carbs: (carbs.current / Math.max(carbs.target, 1)) * 100,
    fat: (fat.current / Math.max(fat.target, 1)) * 100,
  }), [calories, protein, carbs, fat]);

  const remainingCalories = Math.max(0, calories.target - calories.current);
  const isCompleted = remainingCalories === 0;

  const handleHover = (macro: string) => (hovered: boolean, percentage: number) => {
    setHoveredMacro(hovered ? macro : null);
    setHoveredPercentage(percentage);
  };

  const circumference = 2 * Math.PI * mainRadius;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="figure"
      aria-label={`Nutrition tracking: ${calories.current} of ${calories.target} calories, ${protein.current}g of ${protein.target}g protein, ${carbs.current}g of ${carbs.target}g carbs, ${fat.current}g of ${fat.target}g fat`}
    >
      <svg
        width={totalSize}
        height={totalSize}
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        className="transform -rotate-0"
      >
        <defs>
          <linearGradient id="caloriesGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Main calorie ring */}
        <g
          transform={`translate(${(totalSize - (mainRadius + config.strokeWidth) * 2) / 2}, ${(totalSize - (mainRadius + config.strokeWidth) * 2) / 2 - 10})`}
        >
          {/* Background circle */}
          <motion.circle
            cx={mainRadius + config.strokeWidth}
            cy={mainRadius + config.strokeWidth}
            r={mainRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            className="text-muted/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />

          {/* Progress circle */}
          <motion.circle
            cx={mainRadius + config.strokeWidth}
            cy={mainRadius + config.strokeWidth}
            r={mainRadius}
            fill="none"
            stroke={macroColors.calories}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - progress.calories) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              filter: hoveredMacro === 'calories' ? 'url(#glow)' : 'none',
              transform: 'rotate(-90deg)',
              transformOrigin: `${mainRadius + config.strokeWidth}px ${mainRadius + config.strokeWidth}px`,
            }}
          />

          {/* Center content */}
          <foreignObject
            x={config.strokeWidth}
            y={config.strokeWidth}
            width={mainRadius * 2}
            height={mainRadius * 2}
            className="pointer-events-none"
          >
            <div className="flex flex-col items-center justify-center h-full">
              <AnimatePresence mode="wait">
                {hoveredMacro === 'calories' ? (
                  <motion.div
                    key="percentage"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex flex-col items-center"
                  >
                    <span
                      className={cn(config.centerTextSize, 'font-bold')}
                      style={{ color: macroColors.calories }}
                    >
                      {percentages.calories.toFixed(0)}%
                    </span>
                    <span className={cn(config.labelSize, 'text-muted-foreground')}>
                      of daily goal
                    </span>
                  </motion.div>
                ) : isCompleted ? (
                  <motion.div
                    key="completed"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex flex-col items-center"
                  >
                    <motion.span
                      className={cn(config.centerTextSize, 'font-bold text-emerald-500')}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.5, type: 'spring' }}
                    >
                      ✓
                    </motion.span>
                    <span className={cn(config.labelSize, 'text-emerald-600 dark:text-emerald-400 font-medium')}>
                      Goal Met!
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="remaining"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex flex-col items-center"
                  >
                    <span className={cn(config.centerTextSize, 'font-bold text-foreground')}>
                      {remainingCalories}
                    </span>
                    <span className={cn(config.labelSize, 'text-muted-foreground')}>
                      remaining
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Calories label */}
              <span className={cn(config.labelSize, 'text-muted-foreground mt-1')}>
                Calories
              </span>
              <span className={cn(config.labelSize, 'font-medium text-foreground')}>
                {calories.current} / {calories.target}
              </span>
            </div>
          </foreignObject>

          {/* Invisible hover area for calories */}
          <circle
            cx={mainRadius + config.strokeWidth}
            cy={mainRadius + config.strokeWidth}
            r={mainRadius}
            fill="transparent"
            stroke="transparent"
            strokeWidth={config.strokeWidth + 10}
            className="cursor-pointer"
            onMouseEnter={() => handleHover('calories')(true, percentages.calories)}
            onMouseLeave={() => handleHover('calories')(false, 0)}
          />
        </g>

        {/* Macro arcs positioned around the main ring */}
        <g
          transform={`translate(${(totalSize - (arcRadius + config.strokeWidth) * 2) / 2}, ${(totalSize - (arcRadius + config.strokeWidth) * 2) / 2 - 10})`}
        >
          <ArcSegment
            radius={arcRadius}
            strokeWidth={config.strokeWidth / 2}
            startAngle={-135}
            endAngle={-15}
            progress={progress.protein}
            color={macroColors.protein}
            label="Protein"
            value={protein.current}
            target={protein.target}
            unit="g"
            labelSize={config.labelSize}
            onHover={handleHover('protein')}
            isHovered={hoveredMacro === 'protein'}
            showPercentage={true}
            percentage={percentages.protein}
          />

          <ArcSegment
            radius={arcRadius}
            strokeWidth={config.strokeWidth / 2}
            startAngle={15}
            endAngle={135}
            progress={progress.carbs}
            color={macroColors.carbs}
            label="Carbs"
            value={carbs.current}
            target={carbs.target}
            unit="g"
            labelSize={config.labelSize}
            onHover={handleHover('carbs')}
            isHovered={hoveredMacro === 'carbs'}
            showPercentage={true}
            percentage={percentages.carbs}
          />

          <ArcSegment
            radius={arcRadius}
            strokeWidth={config.strokeWidth / 2}
            startAngle={165}
            endAngle={285}
            progress={progress.fat}
            color={macroColors.fat}
            label="Fat"
            value={fat.current}
            target={fat.target}
            unit="g"
            labelSize={config.labelSize}
            onHover={handleHover('fat')}
            isHovered={hoveredMacro === 'fat'}
            showPercentage={true}
            percentage={percentages.fat}
          />
        </g>
      </svg>

      {/* Legend for smaller sizes */}
      {size === 'sm' && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 flex gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: macroColors.protein }} />
            <span className="text-xs text-muted-foreground">P</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: macroColors.carbs }} />
            <span className="text-xs text-muted-foreground">C</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: macroColors.fat }} />
            <span className="text-xs text-muted-foreground">F</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default NutritionRing;
