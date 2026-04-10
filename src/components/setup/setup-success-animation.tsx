'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SetupSuccessAnimationProps {
  className?: string;
}

export function SetupSuccessAnimation({ className }: SetupSuccessAnimationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex flex-col items-center justify-center py-12',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="Setup complete"
    >
      {/* Main success circle */}
      <motion.div
        className="relative"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 20,
          delay: 0.1,
        }}
      >
        {/* Outer glow */}
        <motion.div
          className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        
        {/* Pulsing ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-emerald-500/30"
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
        
        {/* Main circle */}
        <div className={cn(
          'relative w-24 h-24 rounded-full',
          'bg-gradient-to-br from-emerald-400 to-teal-500',
          'flex items-center justify-center',
          'shadow-lg shadow-emerald-500/30'
        )}>
          {/* Checkmark with animation */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 20,
              delay: 0.3,
            }}
          >
            <Check className="w-12 h-12 text-white" strokeWidth={3} />
          </motion.div>
        </div>

        {/* Sparkles around the circle */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: '50%',
              left: '50%',
              transform: `rotate(${i * 60}deg) translateY(-60px)`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.2, 1],
              opacity: [0, 1, 0.8],
            }}
            transition={{
              duration: 0.6,
              delay: 0.4 + i * 0.1,
              ease: 'easeOut',
            }}
          >
            <Sparkles 
              className="w-5 h-5 text-amber-400"
              style={{
                transform: `rotate(${-i * 60}deg)`,
              }}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Success text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="mt-6 text-center"
      >
        <h3 className="text-xl font-semibold text-foreground">
          You&apos;re all set!
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your personalized experience is ready
        </p>
      </motion.div>

      {/* Decorative particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-2 h-2 rounded-full bg-emerald-500/40"
            style={{
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0],
              opacity: [0, 0.6, 0],
              y: [-20, -80],
            }}
            transition={{
              duration: 1.2,
              delay: 0.3 + Math.random() * 0.5,
              ease: 'easeOut',
            }}
          />
        ))}
      </div>

      {/* Screen reader announcement */}
      <div className="sr-only" aria-live="polite">
        Setup complete! Your personalized experience is ready.
      </div>
    </motion.div>
  );
}

export default SetupSuccessAnimation;
