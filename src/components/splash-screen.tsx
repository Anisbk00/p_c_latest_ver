"use client";

import { useEffect, useState, useRef, useCallback, useLayoutEffect } from "react";

interface SplashScreenProps {
  isLoading?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PARTICLE SYSTEM - Ambient floating particles
// ═══════════════════════════════════════════════════════════════

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

// Generate particles only on client to avoid hydration mismatch
function generateParticles(count: number): Particle[] {
  if (typeof window === 'undefined') return [];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 1,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * 5,
    opacity: Math.random() * 0.3 + 0.1,
  }));
}

// ═══════════════════════════════════════════════════════════════
// TIME-BASED GREETING - Personalization (client-only)
// ═══════════════════════════════════════════════════════════════

function getTimeBasedGreeting(): { emoji: string; text: string; subtext: string } {
  if (typeof window === 'undefined') {
    return { emoji: "", text: "", subtext: "" };
  }
  
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) {
    return {
      emoji: "☀️",
      text: "Good morning",
      subtext: "Ready to crush your goals?",
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      emoji: "🌤️",
      text: "Good afternoon",
      subtext: "Keep the momentum going",
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      emoji: "🌅",
      text: "Good evening",
      subtext: "Time to reflect and recover",
    };
  } else {
    return {
      emoji: "🌙",
      text: "Good night",
      subtext: "Rest well, champion",
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// RIPPLE EFFECT COMPONENT
// ═══════════════════════════════════════════════════════════════

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

function RippleEffect({ ripples }: { ripples: Ripple[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute rounded-full border-2 border-emerald-400/30 animate-ripple-out"
          style={{
            left: ripple.x - ripple.size / 2,
            top: ripple.y - ripple.size / 2,
            width: ripple.size,
            height: ripple.size,
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOLD PROGRESS INDICATOR
// ═══════════════════════════════════════════════════════════════

function HoldProgress({ progress, isActive }: { progress: number; isActive: boolean }) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  if (!isActive) return null;
  
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg className="w-[120px] h-[120px] -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(16, 185, 129, 0.1)"
          strokeWidth="2"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="url(#hold-gradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-75 ease-out"
        />
        <defs>
          <linearGradient id="hold-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// KEYFRAME ANIMATIONS - Static CSS to avoid hydration issues
// ═══════════════════════════════════════════════════════════════

const ANIMATION_STYLES = `
  @keyframes float-orb-1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(30px, -20px) scale(1.05); }
    66% { transform: translate(-20px, 20px) scale(0.95); }
  }
  
  @keyframes float-orb-2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(-25px, 15px) scale(1.1); }
    66% { transform: translate(25px, -25px) scale(0.9); }
  }
  
  @keyframes pulse-glow {
    0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.1); }
  }
  
  @keyframes glow-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  
  @keyframes logo-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  
  @keyframes icon-breathe {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.03); opacity: 0.95; }
  }
  
  @keyframes loading-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  
  @keyframes dot-pulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }
  
  @keyframes particle-float {
    0%, 100% { 
      transform: translate(0, 0); 
      opacity: 0.2;
    }
    25% { 
      transform: translate(20px, -30px); 
      opacity: 0.4;
    }
    50% { 
      transform: translate(-10px, -50px); 
      opacity: 0.3;
    }
    75% { 
      transform: translate(15px, -20px); 
      opacity: 0.4;
    }
  }
  
  @keyframes ripple-out {
    0% {
      transform: scale(0);
      opacity: 0.5;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }
  
  @keyframes shimmer-text {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  
  .animate-ripple-out {
    animation: ripple-out 0.6s ease-out forwards;
  }
`;

// ═══════════════════════════════════════════════════════════════
// MAIN SPLASH SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function SplashScreen({ isLoading = true }: SplashScreenProps) {
  const exitTriggeredRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<'waking' | 'active' | 'transitioning'>('waking');
  
  // Interactive states
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [logoScale, setLogoScale] = useState(1);
  const [logoGlow, setLogoGlow] = useState(0);
  
  // Client-only data - initialize empty on server, hydrate on client
  const [clientReady, setClientReady] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [greeting, setGreeting] = useState({ emoji: "", text: "", subtext: "" });
  
  // Refs for hold interaction
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartRef = useRef<number>(0);
  const rippleIdRef = useRef(0);
  
  // ═══════════════════════════════════════════════════════════
  // CLIENT-ONLY INITIALIZATION (useLayoutEffect for sync)
  // ═══════════════════════════════════════════════════════════
  
  useLayoutEffect(() => {
    if (clientReady) return; // Only run once
    // Generate client-only random data
    setParticles(generateParticles(30));
    setGreeting(getTimeBasedGreeting());
    setClientReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // ═══════════════════════════════════════════════════════════
  // MOUNT & WAKE-UP SEQUENCE - Instant startup
  // ═══════════════════════════════════════════════════════════
  
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setMounted(true);
    });
    
    // Wake-up sequence - instant transition
    const wakeTimer = setTimeout(() => {
      setPhase('active');
    }, 100);
    
    exitTriggeredRef.current = false;
    
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(wakeTimer);
    };
  }, []);
  
  // ═══════════════════════════════════════════════════════════
  // EXIT HANDLING - Smooth transition with no gap
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (!isLoading && !exitTriggeredRef.current) {
      exitTriggeredRef.current = true;

      // Start transition smoothly
      setPhase('transitioning');

      // Smooth fade out with proper timing
      const fadeTimer = setTimeout(() => {
        setIsExiting(true);
      }, 150);

      return () => clearTimeout(fadeTimer);
    }
  }, [isLoading]);
  
  // ═══════════════════════════════════════════════════════════
  // HOLD INTERACTION - Premium unlock feel
  // ═══════════════════════════════════════════════════════════
  
  const handleHoldStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsHolding(true);
    holdStartRef.current = Date.now();
    
    setLogoScale(1.05);
    setLogoGlow(1);
    
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    
    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min((elapsed / 1500) * 100, 100);
      setHoldProgress(progress);
      
      if (progress > 25 && progress < 26 && 'vibrate' in navigator) {
        navigator.vibrate(15);
      }
      if (progress > 50 && progress < 51 && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }
      if (progress > 75 && progress < 76 && 'vibrate' in navigator) {
        navigator.vibrate(25);
      }
      
      if (progress >= 100) {
        if ('vibrate' in navigator) {
          navigator.vibrate([30, 50, 30]);
        }
        if (holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
        }
        setHoldProgress(100);
        setLogoGlow(2);
        
        setTimeout(() => {
          setPhase('transitioning');
          setTimeout(() => setIsExiting(true), 300);
        }, 200);
      }
    }, 16);
  }, []);
  
  const handleHoldEnd = useCallback(() => {
    setIsHolding(false);
    setLogoScale(1);
    setLogoGlow(0);
    
    if (holdProgress < 100) {
      setHoldProgress(0);
    }
    
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
    }
  }, [holdProgress]);
  
  // ═══════════════════════════════════════════════════════════
  // TAP INTERACTION - Ripple effect + Exit when ready
  // ═══════════════════════════════════════════════════════════
  
  const handleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (isHolding) return;
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    let clientX: number, clientY: number;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    const newRipple: Ripple = {
      id: rippleIdRef.current++,
      x,
      y,
      size: 0,
    };
    
    setRipples(prev => [...prev, { ...newRipple, size: 200 }]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);
    
    setLogoScale(1.08);
    setLogoGlow(0.5);
    
    if ('vibrate' in navigator) {
      navigator.vibrate(15);
    }
    
    setTimeout(() => {
      setLogoScale(1);
      setLogoGlow(0);
    }, 200);
    
    // If loading is complete, tap triggers exit
    if (!isLoading) {
      setTimeout(() => {
        setPhase('transitioning');
        setTimeout(() => setIsExiting(true), 300);
      }, 100);
    }
  }, [isHolding, isLoading]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
      }
    };
  }, []);
  
  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  // Note: We don't return null here when isLoading is false.
  // Instead, we rely on the exit animation to complete first.
  // The parent component (page.tsx) handles removing us from the DOM
  // after the animation completes via the splashGone state.
  
  return (
    <div
      className={
        "fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden " +
        "transition-all duration-700 ease-in-out " +
        (isExiting ? "opacity-0 scale-[1.002]" : "opacity-100 scale-100")
      }
      style={{
        background: 'linear-gradient(135deg, #0a0f0d 0%, #0d1512 50%, #0a1210 100%)',
      }}
      role="status"
      aria-live="polite"
      aria-label="Loading Progress Companion"
    >
      {/* ═══ AMBIENT GRADIENT BACKGROUND ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
            animation: 'pulse-glow 4s ease-in-out infinite',
          }}
        />
        
        <div 
          className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(20, 184, 166, 0.2) 0%, transparent 70%)',
            animation: 'float-orb-1 12s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%)',
            animation: 'float-orb-2 15s ease-in-out infinite',
          }}
        />
      </div>
      
      {/* ═══ PARTICLE SYSTEM (client-only) ═══ */}
      {clientReady && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="absolute rounded-full bg-emerald-400"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                opacity: particle.opacity,
                animation: `particle-float ${particle.duration}s ease-in-out ${particle.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}
      
      {/* ═══ INTERACTIVE AREA ═══ */}
      <div 
        className="relative flex flex-col items-center justify-center touch-none select-none"
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onMouseLeave={handleHoldEnd}
        onClick={handleTap}
      >
        <RippleEffect ripples={ripples} />
        <HoldProgress progress={holdProgress} isActive={isHolding} />
        
        {/* ═══ LOGO CONTAINER ═══ */}
        <div 
          className="relative transition-all duration-200 ease-out"
          style={{
            transform: `scale(${logoScale})`,
            filter: `drop-shadow(0 0 ${20 + logoGlow * 30}px rgba(16, 185, 129, ${0.3 + logoGlow * 0.4}))`,
          }}
        >
          <div 
            className="absolute inset-0 -m-8 rounded-[48px] opacity-60"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(20, 184, 166, 0.15) 50%, rgba(6, 182, 212, 0.2) 100%)',
              filter: 'blur(20px)',
              animation: 'glow-pulse 3s ease-in-out infinite',
            }}
          />
          
          <div 
            className="absolute inset-0 -m-3 rounded-[32px] opacity-50"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(20, 184, 166, 0.25) 100%)',
              filter: 'blur(12px)',
              animation: 'glow-pulse 3s ease-in-out 0.5s infinite',
            }}
          />
          
          <div 
            className="relative w-24 h-24 rounded-[26px] flex items-center justify-center shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #06b6d4 100%)',
              boxShadow: `
                0 20px 40px -10px rgba(16, 185, 129, 0.4),
                0 0 60px -10px rgba(16, 185, 129, 0.3),
                inset 0 1px 0 rgba(255, 255, 255, 0.2)
              `,
              animation: 'logo-float 4s ease-in-out infinite',
            }}
          >
            <svg 
              viewBox="0 0 32 32" 
              className="w-14 h-14 text-white"
              style={{ 
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                animation: 'icon-breathe 3s ease-in-out infinite',
              }}
              aria-hidden="true"
            >
              <g fill="currentColor">
                {/* Left weight plate */}
                <rect x="3" y="10" width="4" height="12" rx="1" />
                {/* Left inner plate */}
                <rect x="8" y="12" width="2" height="8" rx="0.5" />
                {/* Bar */}
                <rect x="10" y="14" width="12" height="4" rx="1" />
                {/* Right inner plate */}
                <rect x="22" y="12" width="2" height="8" rx="0.5" />
                {/* Right weight plate */}
                <rect x="25" y="10" width="4" height="12" rx="1" />
                {/* Accent line - progress indicator */}
                <rect x="12" y="24" width="8" height="1.5" rx="0.75" opacity="0.6" />
              </g>
            </svg>
            
            <div 
              className="absolute inset-0 rounded-[26px] pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, transparent 50%)',
              }}
            />
          </div>
        </div>
        
        {/* ═══ TEXT CONTENT ═══ */}
        <div className="mt-10 flex flex-col items-center gap-2">
          {/* App Name - Smooth letter-by-letter reveal */}
          <div className="flex items-center justify-center overflow-hidden">
            {"Progress".split('').map((letter, index) => (
              <span
                key={index}
                className="text-3xl font-semibold tracking-tight text-white/95 inline-block"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0) rotateX(0deg)' : 'translateY(20px) rotateX(-40deg)',
                  transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.3 + index * 0.05}s`,
                  display: 'inline-block',
                  textShadow: '0 0 20px rgba(16, 185, 129, 0.3)',
                }}
              >
                {letter}
              </span>
            ))}
          </div>
          {/* Companion - Smooth fade in */}
          <p 
            className="text-sm font-medium tracking-[0.15em] uppercase text-white/50"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.7s',
            }}
          >
            Companion
          </p>
        </div>
        
        {/* ═══ PERSONALIZED GREETING (client-only) ═══ */}
        {clientReady && phase === 'active' && greeting.text && (
          <div 
            className="mt-6 flex flex-col items-center gap-1"
            style={{
              opacity: 1,
              transform: 'translateY(0)',
              transition: 'all 0.6s ease-out 0.5s',
            }}
          >
            <p className="text-sm text-emerald-400/80 font-medium">
              {greeting.emoji} {greeting.text}
            </p>
            <p className="text-xs text-white/30">
              {greeting.subtext}
            </p>
          </div>
        )}
        
        {/* ═══ INTERACTION HINT ═══ */}
        {phase === 'active' && !isHolding && holdProgress === 0 && isLoading && (
          <div 
            className="mt-12 flex flex-col items-center gap-3"
            style={{
              opacity: 0.7,
              transition: 'opacity 0.5s ease-out 1s',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
              <span className="text-xs text-white/50 font-medium">
                Preparing your experience...
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-white/30">
              <span className="text-[10px]">Fetching profile</span>
              <span className="text-[10px]">•</span>
              <span className="text-[10px]">Loading nutrition</span>
              <span className="text-[10px]">•</span>
              <span className="text-[10px]">Syncing data</span>
            </div>
          </div>
        )}
        
        {/* ═══ TAP TO CONTINUE (when data is ready) ═══ */}
        {phase === 'active' && !isHolding && holdProgress === 0 && !isLoading && (
          <div 
            className="mt-12 flex flex-col items-center gap-3"
            style={{
              opacity: 0.8,
              transition: 'opacity 0.5s ease-out 0.5s',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs text-emerald-400/80 font-medium">
                All set! Tap to continue
              </span>
            </div>
          </div>
        )}
        
        {/* ═══ LOADING INDICATOR ═══ */}
        {phase === 'waking' && (
          <div 
            className="mt-12 flex flex-col items-center gap-4"
            style={{
              opacity: 1,
              transition: 'opacity 0.3s ease-out',
            }}
          >
            <div className="w-32 h-0.5 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #10b981, #14b8a6, #06b6d4, #10b981)',
                  backgroundSize: '200% 100%',
                  animation: 'loading-slide 1.5s ease-in-out infinite',
                }}
              />
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400/50"
                  style={{
                    animation: 'dot-pulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* ═══ CREDIT - Fixed at bottom ═══ */}
      <div 
        className="absolute left-0 right-0 flex flex-col items-center gap-2 pb-8"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div 
            className="h-px bg-gradient-to-r from-transparent to-white/20"
            style={{
              width: mounted ? '32px' : '0px',
              transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 1s',
            }}
          />
          <span 
            className="text-[10px] font-medium tracking-[0.2em] uppercase text-white/25 whitespace-nowrap"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'scale(1)' : 'scale(0.8)',
              transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s',
            }}
          >
            Made by
          </span>
          <div 
            className="h-px bg-gradient-to-l from-transparent to-white/20"
            style={{
              width: mounted ? '32px' : '0px',
              transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 1s',
            }}
          />
        </div>
        <div 
          className="relative overflow-hidden"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 1.4s',
          }}
        >
          <span 
            className="text-sm font-semibold tracking-wide relative z-10"
            style={{
              background: 'linear-gradient(90deg, #10b981, #14b8a6, #06b6d4, #14b8a6, #10b981)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'shimmer-text 3s linear infinite',
            }}
          >
            Anis
          </span>
        </div>
      </div>
      
      <span className="sr-only">Loading application...</span>
      
      {/* ═══ KEYFRAME ANIMATIONS ═══ */}
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
    </div>
  );
}

export default SplashScreen;
