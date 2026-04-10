/**
 * SVG Sprites Component
 * 
 * Centralizes SVG definitions (gradients, patterns, etc.) to avoid
 * repeating them in every component instance. This improves performance
 * by reducing DOM size and avoiding duplicate gradient parsing.
 * 
 * Usage: Include <SvgSprites /> once at the root of your app.
 */

"use client";

import { useId } from "react";

/**
 * SvgSprites - Global SVG definitions
 * 
 * This component renders a hidden SVG with all gradient definitions.
 * Use the exported gradient IDs in your SVG elements:
 * - url(#gradient-emerald) - Primary emerald gradient
 * - url(#gradient-warm) - Warm amber/orange gradient
 * - url(#gradient-exceeded) - Red gradient for exceeded values
 * - url(#gradient-rose) - Rose/pink gradient
 * - url(#gradient-sky) - Sky blue gradient
 */
export function SvgSprites() {
  const idBase = useId();
  
  return (
    <svg 
      className="absolute w-0 h-0 overflow-hidden" 
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Primary emerald gradient - use for main actions */}
        <linearGradient id={`${idBase}-gradient-emerald`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(52, 211, 153)" />
          <stop offset="100%" stopColor="rgb(20, 184, 166)" />
        </linearGradient>
        
        {/* Warm gradient - use for nutrition/calorie cards */}
        <linearGradient id={`${idBase}-gradient-warm`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(251, 191, 36)" />
          <stop offset="100%" stopColor="rgb(245, 158, 11)" />
        </linearGradient>
        
        {/* Exceeded gradient - use when values exceed targets */}
        <linearGradient id={`${idBase}-gradient-exceeded`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(248, 113, 113)" />
          <stop offset="100%" stopColor="rgb(239, 68, 68)" />
        </linearGradient>
        
        {/* Rose gradient - use for protein */}
        <linearGradient id={`${idBase}-gradient-rose`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(251, 113, 133)" />
          <stop offset="100%" stopColor="rgb(236, 72, 153)" />
        </linearGradient>
        
        {/* Sky gradient - use for carbs */}
        <linearGradient id={`${idBase}-gradient-sky`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(56, 189, 248)" />
          <stop offset="100%" stopColor="rgb(14, 165, 233)" />
        </linearGradient>
        
        {/* Ambient glow filter - use for soft shadows */}
        <filter id={`${idBase}-glow-ambient`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Hook to get the sprite URL for a gradient
 * 
 * @param gradientName - Name of the gradient (emerald, warm, exceeded, rose, sky)
 * @returns CSS url() value for use in fill/stroke
 */
export function useSpriteGradient(gradientName: string): string {
  const idBase = useId();
  return `url(#${idBase}-${gradientName})`;
}

// Export gradient ID patterns for components that need them
export const GRADIENT_IDS = {
  emerald: 'gradient-emerald',
  warm: 'gradient-warm',
  exceeded: 'gradient-exceeded',
  rose: 'gradient-rose',
  sky: 'gradient-sky',
} as const;
