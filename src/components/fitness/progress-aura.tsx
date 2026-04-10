'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ProgressAuraProps {
  /** Consistency score from 0-100 */
  consistency: number;
  /** Trend direction affecting color scheme */
  trend: 'positive' | 'neutral' | 'negative';
  /** Size of the aura component */
  size?: 'sm' | 'md' | 'lg';
  /** Optional profile image URL */
  imageUrl?: string;
  /** Additional CSS classes */
  className?: string;
}

const sizeConfig = {
  sm: {
    container: 120,
    image: 64,
    strokeWidth: 3,
    rings: [
      { radius: 42, strokeWidth: 2 },
      { radius: 48, strokeWidth: 1.5 },
      { radius: 54, strokeWidth: 1 },
    ],
  },
  md: {
    container: 180,
    image: 100,
    strokeWidth: 4,
    rings: [
      { radius: 65, strokeWidth: 2.5 },
      { radius: 74, strokeWidth: 2 },
      { radius: 83, strokeWidth: 1.5 },
    ],
  },
  lg: {
    container: 240,
    image: 140,
    strokeWidth: 5,
    rings: [
      { radius: 88, strokeWidth: 3 },
      { radius: 100, strokeWidth: 2.5 },
      { radius: 112, strokeWidth: 2 },
    ],
  },
};

const trendColors = {
  positive: {
    primary: 'var(--progress-aura-positive-primary, #10b981)',
    secondary: 'var(--progress-aura-positive-secondary, #14b8a6)',
    glow: 'var(--progress-aura-positive-glow, rgba(16, 185, 129, 0.4))',
    gradient: ['#10b981', '#14b8a6', '#059669'],
  },
  neutral: {
    primary: 'var(--progress-aura-neutral-primary, #f59e0b)',
    secondary: 'var(--progress-aura-neutral-secondary, #eab308)',
    glow: 'var(--progress-aura-neutral-glow, rgba(245, 158, 11, 0.4))',
    gradient: ['#f59e0b', '#eab308', '#d97706'],
  },
  negative: {
    primary: 'var(--progress-aura-negative-primary, #f97316)',
    secondary: 'var(--progress-aura-negative-secondary, #ef4444)',
    glow: 'var(--progress-aura-negative-glow, rgba(249, 115, 22, 0.4))',
    gradient: ['#f97316', '#ef4444', '#dc2626'],
  },
};

// Pre-calculate particle positions to avoid hydration mismatch
const getParticlePositions = (containerSize: number, radius: number) => {
  const positions: { cx: number; cy: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 360;
    const cx = Math.round((containerSize / 2 + radius * Math.cos((angle * Math.PI) / 180)) * 100) / 100;
    const cy = Math.round((containerSize / 2 + radius * Math.sin((angle * Math.PI) / 180)) * 100) / 100;
    positions.push({ cx, cy });
  }
  return positions;
};

export function ProgressAura({
  consistency,
  trend,
  size = 'md',
  imageUrl,
  className,
}: ProgressAuraProps) {
  const config = sizeConfig[size];
  const colors = trendColors[trend];
  const normalizedConsistency = Math.max(0, Math.min(100, consistency));

  // Calculate opacity based on consistency
  const getOpacity = (ringIndex: number): number => {
    const baseOpacity = 0.3 + (normalizedConsistency / 100) * 0.5;
    const ringDiminish = ringIndex * 0.15;
    return Math.max(0.15, baseOpacity - ringDiminish);
  };

  // Calculate dash array for partial ring progress
  const getDashArray = (radius: number): number => {
    const circumference = 2 * Math.PI * radius;
    return (normalizedConsistency / 100) * circumference;
  };

  // Generate unique gradient IDs
  const gradientId = `aura-gradient-${trend}-${size}`;
  const glowId = `aura-glow-${trend}-${size}`;

  // Pre-calculate particle positions
  const particlePositions = useMemo(
    () => getParticlePositions(config.container, config.rings[1].radius),
    [config.container, config.rings]
  );

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: config.container, height: config.container }}
      role="img"
      aria-label={`Progress aura showing ${normalizedConsistency}% consistency with ${trend} trend`}
    >
      {/* Glow Layer */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
          filter: `blur(${config.container / 10}px)`,
          opacity: 0.6 + (normalizedConsistency / 100) * 0.4,
          transform: 'scale(1.2)',
        }}
      />

      {/* SVG Aura Rings */}
      <svg
        width={config.container}
        height={config.container}
        viewBox={`0 0 ${config.container} ${config.container}`}
        className="absolute"
        style={{ filter: `drop-shadow(0 0 ${config.container / 15}px ${colors.glow})` }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.gradient[0]} />
            <stop offset="50%" stopColor={colors.gradient[1]} />
            <stop offset="100%" stopColor={colors.gradient[2]} />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background Rings */}
        {config.rings.map((ring, index) => (
          <motion.circle
            key={`bg-ring-${index}`}
            cx={config.container / 2}
            cy={config.container / 2}
            r={ring.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={ring.strokeWidth}
            className="text-muted-foreground/10 dark:text-muted-foreground/5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          />
        ))}

        {/* Animated Progress Rings */}
        <AnimatePresence>
          {config.rings.map((ring, index) => {
            const dashArray = getDashArray(ring.radius);
            const circumference = 2 * Math.PI * ring.radius;
            const rotation = index * 15 - 45;
            const duration = 20 + index * 5;
            const delay = index * 2;

            return (
              <motion.circle
                key={`progress-ring-${index}`}
                cx={config.container / 2}
                cy={config.container / 2}
                r={ring.radius}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={ring.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${dashArray} ${circumference}`}
                filter={`url(#${glowId})`}
                style={{ originX: '50%', originY: '50%' }}
                initial={{ opacity: 0, strokeDasharray: `0 ${circumference}`, rotate: rotation }}
                animate={{ opacity: getOpacity(index), strokeDasharray: `${dashArray} ${circumference}`, rotate: [rotation, rotation + 360] }}
                transition={{
                  opacity: { duration: 0.5, delay: index * 0.15 },
                  strokeDasharray: { duration: 1.2, delay: index * 0.15, ease: 'easeOut' },
                  rotate: { duration, delay, repeat: Infinity, ease: 'linear' },
                }}
              />
            );
          })}
        </AnimatePresence>

        {/* Pulsing Energy Particles */}
        {particlePositions.map((pos, index) => (
          <motion.circle
            key={`particle-${index}`}
            cx={pos.cx}
            cy={pos.cy}
            r={Math.round((1.5 + (normalizedConsistency / 100) * 1.5) * 10) / 10}
            fill={colors.primary}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, getOpacity(0), 0], scale: [0.5, 1.2, 0.5] }}
            transition={{ duration: 2, delay: index * 0.3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ filter: `drop-shadow(0 0 4px ${colors.glow})` }}
          />
        ))}
      </svg>

      {/* Inner Glow Ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: config.image + 16,
          height: config.image + 16,
          border: '2px solid transparent',
          background: `linear-gradient(var(--background, white), var(--background, white)) padding-box, linear-gradient(135deg, ${colors.primary}, ${colors.secondary}) border-box`,
          boxShadow: `inset 0 0 ${Math.round(config.image / 5)}px ${colors.glow}`,
        }}
        animate={{
          boxShadow: [
            `inset 0 0 ${Math.round(config.image / 5)}px ${colors.glow}`,
            `inset 0 0 ${Math.round(config.image / 3)}px ${colors.glow}`,
            `inset 0 0 ${Math.round(config.image / 5)}px ${colors.glow}`,
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Profile Image Container */}
      <motion.div
        className="relative rounded-full overflow-hidden bg-gradient-to-br from-muted to-muted/50"
        style={{
          width: config.image,
          height: config.image,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), inset 0 2px 4px rgba(255, 255, 255, 0.1)',
        }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted-foreground/20 to-muted-foreground/10">
            <motion.div
              className="text-muted-foreground/40"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <svg
                width={config.image * 0.5}
                height={config.image * 0.5}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M20 21a8 8 0 1 0-16 0" />
              </svg>
            </motion.div>
          </div>
        )}

        {/* Shimmer Effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* Consistency Badge */}
      <motion.div
        className="absolute flex items-center justify-center rounded-full font-semibold tabular-nums text-white"
        style={{
          width: config.image / 2.5,
          height: config.image / 2.5,
          bottom: -config.image / 12,
          right: -config.image / 12,
          fontSize: size === 'sm' ? '0.625rem' : size === 'md' ? '0.75rem' : '0.875rem',
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -2px rgba(0, 0, 0, 0.1), 0 0 12px ${colors.glow}`,
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
      >
        {Math.round(normalizedConsistency)}%
      </motion.div>
    </div>
  );
}

export default ProgressAura;
