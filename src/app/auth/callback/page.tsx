'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getClient } from '@/lib/supabase/client';

/**
 * Auth Callback Page
 * 
 * Handles email confirmation links from Supabase.
 * Exchanges the token and redirects to the main app.
 * 
 * IMPORTANT: This uses the client-side Supabase client to properly
 * establish the session in the browser before redirecting.
 */

// Inner component that uses useSearchParams - must be wrapped in Suspense
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // Get tokens from URL
        const code = searchParams.get('code');
        const token = searchParams.get('token');
        const type = searchParams.get('type');
        
        // If we have a code, exchange it for a session using CLIENT-SIDE Supabase
        if (code) {
          const supabase = getClient();
          
          // Exchange code for session - this properly sets cookies in the browser
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('[Auth Callback] Code exchange error:', error.message);
            setStatus('error');
            setErrorMessage(error.message || 'Failed to verify email');
            return;
          }
          
          console.log('[Auth Callback] Session established for:', data.user?.email);
          
          // Sync user to our database
          if (data.user) {
            try {
              await fetch('/api/auth/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
              });
            } catch (syncError) {
              // Log but don't fail - user is authenticated
              console.warn('[Auth Callback] Failed to sync user:', syncError);
            }
          }
          
          setStatus('success');
          
          // Wait a moment for the session to be fully established
          // This ensures cookies are properly set before redirect
          setTimeout(() => {
            router.push('/');
            router.refresh(); // Force a refresh to update server components
          }, 1500);
          return;
        }
        
        // If we have token and type (older Supabase format)
        if (token && type) {
          // For recovery or signup confirmation
          if (type === 'signup' || type === 'email') {
            setStatus('success');
            setTimeout(() => {
              router.push('/');
              router.refresh();
            }, 1500);
            return;
          }
          
          if (type === 'recovery') {
            router.push('/auth/reset-password');
            return;
          }
        }
        
        // No valid tokens found
        throw new Error('Invalid confirmation link');
        
      } catch (error) {
        console.error('[Auth Callback] Error:', error);
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Verification failed');
      }
    }
    
    handleCallback();
  }, [router, searchParams]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center px-6"
    >
      {status === 'loading' && (
        <>
          <motion.div
            className="w-16 h-16 mx-auto rounded-2xl bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Activity className="w-8 h-8 text-white" />
          </motion.div>
          <div className="mt-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying your email...</span>
          </div>
        </>
      )}
      
      {status === 'success' && (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center"
          >
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </motion.div>
          <h2 className="mt-6 text-xl font-semibold">Email verified!</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Redirecting you to the app...
          </p>
        </>
      )}
      
      {status === 'error' && (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center"
          >
            <AlertCircle className="w-8 h-8 text-destructive" />
          </motion.div>
          <h2 className="mt-6 text-xl font-semibold">Verification failed</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {errorMessage || 'Something went wrong. Please try again.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-6 text-emerald-500 hover:text-emerald-600 font-medium text-sm"
          >
            Back to sign in
          </button>
        </>
      )}
    </motion.div>
  );
}

// Loading fallback for Suspense
function LoadingFallback() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center px-6"
    >
      <motion.div
        className="w-16 h-16 mx-auto rounded-2xl bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25"
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <Activity className="w-8 h-8 text-white" />
      </motion.div>
      <div className="mt-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading...</span>
      </div>
    </motion.div>
  );
}

// Main page component with Suspense boundary
export default function AuthCallbackPage() {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      {/* Subtle background glow */}
      <div 
        className="absolute top-0 left-0 w-125 h-125 -translate-x-1/4 -translate-y-1/4 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 60%)',
        }}
      />
      
      <Suspense fallback={<LoadingFallback />}>
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
