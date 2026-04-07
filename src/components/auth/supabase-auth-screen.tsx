'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Loader2, 
  AlertCircle,
  User,
  ChevronRight,
  Inbox,
  CheckCircle,
  Dumbbell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/lib/supabase/auth-context';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type AuthMode = 'welcome' | 'signin' | 'signup' | 'success';

interface AuthState {
  mode: AuthMode;
  isLoading: boolean;
  loadingText: string;
  error: string | null;
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  passwordStrength: number;
  goal: string;
  step: number;
  successMessage: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Error Message Helper
// ═══════════════════════════════════════════════════════════════

function getFriendlyErrorMessage(error: string | null | undefined): string {
  if (!error) return 'Could not complete sign-in. Please try again.';
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('invalid login credentials') || errorLower.includes('invalid credentials')) {
    return 'Invalid email or password. Please try again.';
  }
  if (errorLower.includes('too many') || errorLower.includes('rate limit') || errorLower.includes('429')) {
    return 'Too many attempts. Try again in a moment.';
  }
  if (errorLower.includes('email not confirmed')) {
    return 'Email not confirmed yet. Check your inbox and open the confirmation link.';
  }
  if (errorLower.includes('already registered') || errorLower.includes('already exists')) {
    return 'This email is already registered. Try signing in.';
  }
  if (errorLower.includes('password') && errorLower.includes('6')) {
    return 'Password must be at least 6 characters.';
  }
  if (errorLower.includes('password') && errorLower.includes('weak')) {
    return 'Password is too weak. Use a stronger password.';
  }
  if (errorLower.includes('email') && errorLower.includes('valid')) {
    return 'Please enter a valid email address.';
  }
  if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('failed to fetch')) {
    return 'Connection issue. Check your internet and try again.';
  }
  
  return error || 'Could not complete sign-in. Please try again.';
}

// ═══════════════════════════════════════════════════════════════
// Input Validation
// ═══════════════════════════════════════════════════════════════

function isValidEmail(email: string): boolean {
  // RFC 5322 compliant email regex (simplified for common cases)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

function validateSignInInputs(email: string, password: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!isValidEmail(email)) return 'Please enter a valid email address';
  if (!password) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

function validateSignUpInputs(email: string, password: string, confirmPassword?: string, name?: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!isValidEmail(email)) return 'Please enter a valid email address';
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Passwords do not match';
  if (name !== undefined && name.trim().length === 0) return 'Name is required';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Password Strength Meter
// ═══════════════════════════════════════════════════════════════

function calculatePasswordStrength(password: string): number {
  let strength = 0;
  if (password.length >= 8) strength += 25;
  if (password.length >= 12) strength += 10;
  if (/[A-Z]/.test(password)) strength += 20;
  if (/[a-z]/.test(password)) strength += 15;
  if (/[0-9]/.test(password)) strength += 15;
  if (/[^A-Za-z0-9]/.test(password)) strength += 15;
  return Math.min(100, strength);
}

function PasswordStrengthMeter({ strength }: { strength: number }) {
  const getColor = () => {
    if (strength < 30) return 'bg-amber-500';
    if (strength < 60) return 'bg-amber-400';
    return 'bg-emerald-500';
  };
  
  const getLabel = () => {
    if (strength < 30) return 'Weak';
    if (strength < 60) return 'Fair';
    if (strength < 80) return 'Good';
    return 'Strong';
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', getColor())}
          initial={{ width: 0 }}
          animate={{ width: `${strength}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <p className={cn(
        'text-xs transition-colors',
        strength < 30 ? 'text-amber-500' : strength < 60 ? 'text-amber-400' : 'text-emerald-500'
      )}>
        {getLabel()}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Welcome Screen
// ═══════════════════════════════════════════════════════════════

// Custom dumbbell SVG icon matching splash screen
function DumbbellLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 32 32" 
      className={className}
      style={{ 
        filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
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
  );
}

function WelcomeScreen({ 
  onEmailSignIn,
  onCreateAccount,
}: { 
  onEmailSignIn: () => void;
  onCreateAccount: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-sm mx-auto px-6"
    >
      <motion.div
        className="flex justify-center mb-8"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <motion.div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #06b6d4 100%)',
            boxShadow: `
              0 20px 40px -10px rgba(16, 185, 129, 0.4),
              0 0 60px -10px rgba(16, 185, 129, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.2)
            `,
          }}
            animate={{ 
            boxShadow: [
              '0 20px 40px -10px rgba(16, 185, 129, 0.4), 0 0 60px -10px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              '0 20px 50px -10px rgba(16, 185, 129, 0.5), 0 0 80px -10px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              '0 20px 40px -10px rgba(16, 185, 129, 0.4), 0 0 60px -10px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            ]
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <DumbbellLogo className="w-8 h-8 text-white" />
        </motion.div>
      </motion.div>

      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Progress Companion</h1>
        <p className="text-muted-foreground mt-1 text-sm">Your AI fitness companion</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        <Button
          onClick={onEmailSignIn}
          className="w-full h-12 rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium"
        >
          <Mail className="w-5 h-5 mr-3" />
          Sign in with Email
        </Button>
        
        <div className="text-center">
          <button
            onClick={onCreateAccount}
            className="text-emerald-500 hover:text-emerald-600 font-medium text-sm"
          >
            Create account
          </button>
        </div>
      </motion.div>

      <motion.p
        className="mt-8 text-center text-xs text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Your data stays private
      </motion.p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sign In Form
// ═══════════════════════════════════════════════════════════════

function SignInForm({
  state,
  onUpdateState,
  onSignIn,
  onBack,
}: {
  state: AuthState;
  onUpdateState: (updates: Partial<AuthState>) => void;
  onSignIn: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-sm mx-auto px-6"
    >
      <button
        onClick={onBack}
        className="mb-6 flex items-center text-muted-foreground hover:text-foreground transition-colors"
        type="button"
      >
        <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
        Back
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-semibold">Sign in</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Enter your credentials to continue
        </p>
      </div>

      {/* Status Banner - Shows loading or error state */}
      {state.isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
        >
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">{state.loadingText || 'Signing in...'}</span>
          </div>
        </motion.div>
      )}

      {state.error && !state.isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20"
        >
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{state.error}</span>
          </div>
        </motion.div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); onSignIn(); }} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signin-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="signin-email"
              type="email"
              placeholder="name@domain.com"
              className="pl-10 h-11"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              value={state.email}
              onChange={(e) => onUpdateState({ email: e.target.value, error: null })}
              disabled={state.isLoading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signin-password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="signin-password"
              type={state.showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              className="pl-10 pr-10 h-11"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="current-password"
              enterKeyHint="done"
              value={state.password}
              onChange={(e) => onUpdateState({ password: e.target.value, error: null })}
              disabled={state.isLoading}
            />
            <button
              type="button"
              onClick={() => onUpdateState({ showPassword: !state.showPassword })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {state.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
          disabled={state.isLoading || !state.email || !state.password}
        >
          {state.isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </span>
          ) : (
            <>
              Sign In
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </form>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Create Account Form
// ═══════════════════════════════════════════════════════════════

function CreateAccountForm({
  state,
  onUpdateState,
  onCreateAccount,
  onBack,
}: {
  state: AuthState;
  onUpdateState: (updates: Partial<AuthState>) => void;
  onCreateAccount: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-sm mx-auto px-6"
    >
      <button
        onClick={onBack}
        className="mb-6 flex items-center text-muted-foreground hover:text-foreground transition-colors"
        type="button"
      >
        <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
        Back
      </button>

      {/* Status Banner */}
      {state.isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
        >
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">{state.loadingText || 'Creating account...'}</span>
          </div>
        </motion.div>
      )}

      {state.error && !state.isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20"
        >
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{state.error}</span>
          </div>
        </motion.div>
      )}

      <>
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Create account</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Enter your details to get started
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); onCreateAccount(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Your name"
                  className="pl-10 h-11"
                  autoComplete="name"
                  enterKeyHint="next"
                  value={state.name}
                  onChange={(e) => onUpdateState({ name: e.target.value, error: null })}
                  disabled={state.isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@domain.com"
                  className="pl-10 h-11"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  inputMode="email"
                  enterKeyHint="next"
                  value={state.email}
                  onChange={(e) => onUpdateState({ email: e.target.value, error: null })}
                  disabled={state.isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={state.showPassword ? 'text' : 'password'}
                  placeholder="Create a secure password"
                  className="pl-10 pr-10 h-11"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="new-password"
                  enterKeyHint="next"
                  value={state.password}
                  onChange={(e) => {
                    const password = e.target.value;
                    onUpdateState({ 
                      password,
                      passwordStrength: calculatePasswordStrength(password),
                      error: null
                    });
                  }}
                  disabled={state.isLoading}
                />
                <button
                  type="button"
                  onClick={() => onUpdateState({ showPassword: !state.showPassword })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {state.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrengthMeter strength={state.passwordStrength} />
              <p className="text-xs text-muted-foreground">
                8+ chars, 1 number, 1 uppercase
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={state.showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  className="pl-10 pr-10 h-11"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="new-password"
                  enterKeyHint="done"
                  value={state.confirmPassword}
                  onChange={(e) => onUpdateState({ confirmPassword: e.target.value, error: null })}
                  disabled={state.isLoading}
                />
                <button
                  type="button"
                  onClick={() => onUpdateState({ showConfirmPassword: !state.showConfirmPassword })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {state.showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {state.confirmPassword && state.password !== state.confirmPassword && (
                <p className="text-xs text-rose-500">
                  Passwords do not match
                </p>
              )}
              {state.confirmPassword && state.password === state.confirmPassword && (
                <p className="text-xs text-emerald-500 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Passwords match
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
              disabled={state.isLoading || !state.name || !state.email || state.passwordStrength < 30 || state.password !== state.confirmPassword}
            >
              {state.isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </span>
              ) : (
                <>
                  Create account
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Success Screen (Email Confirmation)
// ═══════════════════════════════════════════════════════════════

function SuccessScreen({
  email,
  message,
  onBack,
}: {
  email: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-sm mx-auto px-6"
    >
      <motion.div
        className="flex justify-center mb-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring' }}
      >
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Inbox className="w-8 h-8 text-emerald-500" />
        </div>
      </motion.div>

      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="text-muted-foreground text-sm mt-2">
          {message}
        </p>
      </div>

      <motion.div
        className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{email}</span>
        </div>
      </motion.div>

      <Button
        onClick={onBack}
        variant="outline"
        className="w-full h-11"
      >
        <ChevronRight className="w-4 h-4 rotate-180 mr-2" />
        Back to sign in
      </Button>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Did not receive the email? Check your spam folder.
      </p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Auth Screen
// ═══════════════════════════════════════════════════════════════

export function SupabaseAuthScreen({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { signUp, signIn, isAuthenticated } = useSupabaseAuth();
  const [state, setState] = useState<AuthState>({
    mode: 'welcome',
    isLoading: false,
    loadingText: '',
    error: null,
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    showPassword: false,
    showConfirmPassword: false,
    passwordStrength: 0,
    goal: '',
    step: 1,
    successMessage: null,
  });
  
  // Prevent double-submit
  const hasActiveOperation = useRef(false);
  // BUG-005: Brute-force lockout — client-side
  const failedAttemptsRef = useRef(0);
  const lockedUntilRef = useRef(0);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0);

  // Redirect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Reset operation flag on successful auth
      hasActiveOperation.current = false;
      onComplete?.();
    }
  }, [isAuthenticated, onComplete]);

  const updateState = useCallback((updates: Partial<AuthState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSignIn = useCallback(async () => {
    if (hasActiveOperation.current) return;

    // SECURITY FIX: Client-side validation before server call
    const validationError = validateSignInInputs(state.email, state.password);
    if (validationError) {
      setState(prev => ({ ...prev, error: validationError }));
      return;
    }

    // BUG-005: Enforce client-side lockout after 5 failed attempts
    const now = Date.now();
    if (lockedUntilRef.current > now) {
      const remaining = Math.ceil((lockedUntilRef.current - now) / 1000);
      setState(prev => ({ ...prev, error: `Too many attempts. Try again in ${remaining}s.` }));
      return;
    }

    hasActiveOperation.current = true;
    setState(prev => ({ ...prev, isLoading: true, loadingText: 'Signing in...', error: null }));

    try {
      const result = await signIn(state.email.trim(), state.password);

      if (result.error) {
        // Increment failure counter
        failedAttemptsRef.current += 1;

        // BUG-005: Lock out after 5 consecutive failures for 30 seconds
        const LOCKOUT_THRESHOLD = 5;
        const LOCKOUT_DURATION_MS = 30_000;
        if (failedAttemptsRef.current >= LOCKOUT_THRESHOLD) {
          lockedUntilRef.current = Date.now() + LOCKOUT_DURATION_MS;
          failedAttemptsRef.current = 0; // reset counter for next window

          // Start countdown timer
          let remaining = Math.ceil(LOCKOUT_DURATION_MS / 1000);
          setLockoutSecondsLeft(remaining);
          const interval = setInterval(() => {
            remaining -= 1;
            setLockoutSecondsLeft(remaining);
            if (remaining <= 0) {
              clearInterval(interval);
              setLockoutSecondsLeft(0);
            }
          }, 1000);

          setState(prev => ({
            ...prev,
            error: `Too many attempts. Try again in 30s.`,
            isLoading: false,
            loadingText: '',
          }));
          hasActiveOperation.current = false;
          return;
        }

        const attemptsLeft = LOCKOUT_THRESHOLD - failedAttemptsRef.current;
        const errorMsg = `${getFriendlyErrorMessage(result.error)}${attemptsLeft <= 2 ? ` (${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left)` : ''}`;

        setState(prev => ({
          ...prev,
          error: errorMsg,
          isLoading: false,
          loadingText: '',
        }));
        hasActiveOperation.current = false;
        return;
      }

      // Success — reset counters
      failedAttemptsRef.current = 0;
      lockedUntilRef.current = 0;
      hasActiveOperation.current = false;
      setState(prev => ({ ...prev, isLoading: false, loadingText: '' }));
    } catch (err) {
      failedAttemptsRef.current += 1;
      setState(prev => ({
        ...prev,
        error: getFriendlyErrorMessage(err instanceof Error ? err.message : 'Sign in failed'),
        isLoading: false,
        loadingText: '',
      }));
      hasActiveOperation.current = false;
    }
  }, [state.email, state.password, signIn]);

  const handleCreateAccount = useCallback(async () => {
    if (hasActiveOperation.current) return;
    
    // SECURITY FIX: Client-side validation before server call
    const validationError = validateSignUpInputs(state.email, state.password, state.confirmPassword, state.name);
    if (validationError) {
      setState(prev => ({ ...prev, error: validationError }));
      return;
    }
    
    hasActiveOperation.current = true;
    
    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      loadingText: 'Creating your account...', 
      error: null 
    }));

    try {
      const result = await signUp(state.email.trim(), state.password, state.name.trim());

      if (result.error) {
        setState(prev => ({ 
          ...prev,
          error: getFriendlyErrorMessage(result.error),
          step: 1,
          isLoading: false,
          loadingText: '',
        }));
        hasActiveOperation.current = false;
        return;
      }

      // Check if email confirmation is needed
      if (result.needsEmailConfirmation) {
        setState(prev => ({ 
          ...prev,
          mode: 'success',
          isLoading: false,
          loadingText: '',
          successMessage: `We've sent a confirmation email to ${state.email}. Please check your inbox and click the link to verify your account.`
        }));
        hasActiveOperation.current = false;
        return;
      }

      // Success - auth context will handle navigation
      // Reset the operation flag so future operations work
      hasActiveOperation.current = false;
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        loadingText: '' 
      }));
    } catch (err) {
      setState(prev => ({ 
        ...prev,
        error: getFriendlyErrorMessage(err instanceof Error ? err.message : 'Account creation failed'),
        step: 1,
        isLoading: false,
        loadingText: '',
      }));
      hasActiveOperation.current = false;
    }
  }, [state.email, state.password, state.name, signUp]);

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center overflow-hidden">
      {/* Debug: Log when auth screen renders */}
      {console.log('[AuthScreen] Rendering, mode:', state.mode)}
      
      {/* ═══ ANIMATED BACKGROUND GLOW ORBS ═══ */}
      {/* Primary large orb - top left */}
      <motion.div 
        className="absolute top-0 left-0 w-[500px] h-[500px] -translate-x-1/4 -translate-y-1/4 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 40%, transparent 70%)',
        }}
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: 'easeInOut',
        }}
      />
      
      {/* Secondary orb - bottom right */}
      <motion.div 
        className="absolute bottom-0 right-0 w-[400px] h-[400px] translate-x-1/4 translate-y-1/4 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.12) 0%, rgba(20, 184, 166, 0.04) 40%, transparent 70%)',
        }}
        animate={{ 
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{ 
          duration: 5, 
          repeat: Infinity, 
          ease: 'easeInOut',
          delay: 0.5,
        }}
      />
      
      {/* Floating accent orb - center right */}
      <motion.div 
        className="absolute top-1/2 right-0 w-[300px] h-[300px] translate-x-1/2 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 60%)',
        }}
        animate={{ 
          y: [0, -30, 0],
          scale: [1, 1.05, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{ 
          duration: 6, 
          repeat: Infinity, 
          ease: 'easeInOut',
          delay: 1,
        }}
      />
      
      {/* Floating accent orb - center left */}
      <motion.div 
        className="absolute top-1/3 left-0 w-[250px] h-[250px] -translate-x-1/2 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 60%)',
        }}
        animate={{ 
          y: [0, 20, 0],
          x: [0, 10, 0],
          scale: [1, 1.08, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ 
          duration: 7, 
          repeat: Infinity, 
          ease: 'easeInOut',
          delay: 2,
        }}
      />
      
      {/* Pulsing ring - center behind content */}
      <motion.div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none rounded-full"
        style={{
          background: 'radial-gradient(circle, transparent 30%, rgba(16, 185, 129, 0.03) 50%, transparent 70%)',
        }}
        animate={{ 
          scale: [0.8, 1.2, 0.8],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{ 
          duration: 8, 
          repeat: Infinity, 
          ease: 'easeInOut',
        }}
      />
      
      <AnimatePresence mode="wait">
        {state.mode === 'welcome' && (
          <WelcomeScreen
            key="welcome"
            onEmailSignIn={() => updateState({ mode: 'signin' })}
            onCreateAccount={() => updateState({ mode: 'signup' })}
          />
        )}

        {state.mode === 'signin' && (
          <SignInForm
            key="signin"
            state={{
              ...state,
              // Overlay lockout message in error field when counting down
              error: lockoutSecondsLeft > 0
                ? `Too many attempts. Try again in ${lockoutSecondsLeft}s.`
                : state.error,
            }}
            onUpdateState={(updates) => {
              // Reset lockout display if user clears error manually
              updateState(updates);
            }}
            onSignIn={handleSignIn}
            onBack={() => {
              // BUG-005: Reset failed attempts when navigating back
              failedAttemptsRef.current = 0;
              lockedUntilRef.current = 0;
              setLockoutSecondsLeft(0);
              updateState({ mode: 'welcome', error: null });
            }}
          />
        )}

        {state.mode === 'signup' && (
          <CreateAccountForm
            key="signup"
            state={state}
            onUpdateState={updateState}
            onCreateAccount={handleCreateAccount}
            onBack={() => updateState({ mode: 'welcome', step: 1, error: null })}
          />
        )}

        {state.mode === 'success' && (
          <SuccessScreen
            key="success"
            email={state.email}
            message={state.successMessage || 'Please check your email to verify your account.'}
            onBack={() => updateState({ mode: 'welcome', email: '', password: '', name: '', step: 1, error: null, successMessage: null })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export { SupabaseAuthScreen as AuthScreenV2 };
