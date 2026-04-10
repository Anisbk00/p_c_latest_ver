/**
 * Sign Out Animation Component
 * 
 * Provides a polished, accessible sign-out animation with:
 * - 3 stages: processing → success → redirect
 * - Accessibility support (reduced motion, screen reader announcements)
 * - CSS-based animation with fallback for reduced motion
 * 
 * @module components/auth/sign-out-animation
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { LogOut, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSystemReducedMotion } from '@/hooks/use-system-reduced-motion';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SignOutStage = 'idle' | 'processing' | 'success' | 'complete';

interface SignOutAnimationProps {
  isVisible: boolean;
  stage: SignOutStage;
  userName?: string;
  onComplete?: () => void;
  error?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Animation Variants
// ═══════════════════════════════════════════════════════════════

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.3, ease: 'easeOut' }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.2, ease: 'easeIn' }
  }
};

const iconVariants: Variants = {
  processing: {
    scale: [1, 1.1, 1],
    rotate: [0, 360],
    transition: { 
      duration: 2, 
      repeat: Infinity, 
      ease: 'linear',
    }
  },
  success: {
    scale: [0.8, 1.2, 1],
    transition: { duration: 0.5, ease: 'easeOut' }
  }
};

const textVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { delay: 0.1, duration: 0.3 }
  }
};

// ═══════════════════════════════════════════════════════════════
// Animated Icon Components
// ═══════════════════════════════════════════════════════════════

function ProcessingIcon({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    return (
      <div className="w-20 h-20 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      className="relative"
      variants={iconVariants}
      animate="processing"
    >
      {/* Outer pulse ring */}
      <motion.div
        className="absolute inset-0 rounded-full bg-emerald-400/20"
        animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
      />
      
      {/* Main icon container */}
      <motion.div
        className="w-20 h-20 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
      >
        <LogOut className="w-10 h-10 text-white" />
      </motion.div>
      
      {/* Inner glow */}
      <motion.div
        className="absolute inset-0 rounded-full bg-white/20"
        animate={{ opacity: [0, 0.3, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}

function SuccessIcon({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    return (
      <div className="w-20 h-20 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-white" />
      </div>
    );
  }

  return (
    <motion.div
      className="relative"
      variants={iconVariants}
      initial="hidden"
      animate="success"
    >
      {/* Success particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-emerald-400"
          style={{
            top: '50%',
            left: '50%',
          }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{
            x: Math.cos(i * 45 * Math.PI / 180) * 60,
            y: Math.sin(i * 45 * Math.PI / 180) * 60,
            opacity: 0,
            scale: [1, 0.5, 0]
          }}
          transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
        />
      ))}
      
      {/* Main icon */}
      <motion.div
        className="w-20 h-20 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        >
          <CheckCircle className="w-10 h-10 text-white" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function SignOutAnimation({
  isVisible,
  stage,
  userName,
  onComplete,
  error,
}: SignOutAnimationProps) {
  const reducedMotion = useSystemReducedMotion();
  
  // Get status text based on stage
  const getStatusText = useCallback(() => {
    switch (stage) {
      case 'processing':
        return 'Signing out...';
      case 'success':
        return 'Goodbye' + (userName ? `, ${userName}` : '');
      case 'complete':
        return 'See you soon!';
      default:
        return '';
    }
  }, [stage, userName]);
  
  // Get subtext based on stage
  const getSubText = useCallback(() => {
    switch (stage) {
      case 'processing':
        return 'Clearing your session...';
      case 'success':
        return 'You have been signed out successfully';
      case 'complete':
        return 'Redirecting to sign in...';
      default:
        return '';
    }
  }, [stage]);
  
  // Auto-complete after success animation
  useEffect(() => {
    if (stage === 'success') {
      const timer = setTimeout(() => {
        onComplete?.();
      }, reducedMotion ? 500 : 1200);
      return () => clearTimeout(timer);
    }
  }, [stage, onComplete, reducedMotion]);
  
  // Announce to screen readers
  useEffect(() => {
    if (isVisible && stage !== 'idle') {
      // Create a live region announcement
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.className = 'sr-only';
      announcement.textContent = getStatusText() + '. ' + getSubText();
      document.body.appendChild(announcement);
      
      return () => {
        document.body.removeChild(announcement);
      };
    }
  }, [isVisible, stage, getStatusText, getSubText]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="alert"
          aria-live="polite"
          aria-label="Sign out status"
        >
          {/* Background gradient */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div 
              className="absolute top-1/4 left-1/2 -translate-x-1/2 w-100 h-100 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
              }}
            />
          </motion.div>
          
          {/* Icon */}
          <div className="relative z-10 mb-6">
            <AnimatePresence mode="wait">
              {stage === 'processing' && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <ProcessingIcon reducedMotion={reducedMotion ?? false} />
                </motion.div>
              )}
              
              {(stage === 'success' || stage === 'complete') && !error && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <SuccessIcon reducedMotion={reducedMotion ?? false} />
                </motion.div>
              )}
              
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-20 h-20 rounded-full bg-linear-to-br from-rose-400 to-red-500 flex items-center justify-center"
                >
                  <LogOut className="w-10 h-10 text-white" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Text */}
          <motion.div
            className="relative z-10 text-center"
            variants={textVariants}
            initial="hidden"
            animate="visible"
          >
            <h2 className="text-xl font-semibold text-foreground">
              {error ? 'Sign out failed' : getStatusText()}
            </h2>
            <p className={cn(
              "text-muted-foreground mt-2 text-sm",
              error && "text-rose-500"
            )}>
              {error || getSubText()}
            </p>
          </motion.div>
          
          {/* Loading bar for processing state */}
          {stage === 'processing' && !reducedMotion && (
            <motion.div
              className="mt-6 w-48 h-1 bg-muted rounded-full overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div
                className="h-full bg-linear-to-r from-emerald-400 to-teal-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              />
            </motion.div>
          )}
          
          {/* Screen reader only status */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {stage === 'processing' && 'Signing out, please wait...'}
            {stage === 'success' && 'Sign out successful. Goodbye.'}
            {stage === 'complete' && 'Redirecting to sign in page.'}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// Hook for easier usage
// ═══════════════════════════════════════════════════════════════

export function useSignOutAnimation() {
  const [isVisible, setIsVisible] = useState(false);
  const [stage, setStage] = useState<SignOutStage>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const startSignOut = useCallback(() => {
    setIsVisible(true);
    setStage('processing');
    setError(null);
  }, []);
  
  const setSuccess = useCallback(() => {
    setStage('success');
    setError(null);
  }, []);
  
  const setComplete = useCallback(() => {
    setStage('complete');
  }, []);
  
  const setErrorState = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setStage('complete'); // Still complete, but show error
  }, []);
  
  const hide = useCallback(() => {
    setIsVisible(false);
    setStage('idle');
    setError(null);
  }, []);
  
  return {
    isVisible,
    stage,
    error,
    startSignOut,
    setSuccess,
    setComplete,
    setError: setErrorState,
    hide,
  };
}
