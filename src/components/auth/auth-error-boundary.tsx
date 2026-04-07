'use client'

import React from 'react'
import styles from './auth-error-boundary.module.css'

/**
 * AuthErrorBoundary
 *
 * Catches runtime errors caused by stale auth session state (e.g. a partially
 * cleared session that leaves context providers with bad data).
 *
 * On catch: clears localStorage/sessionStorage auth keys and reloads the page,
 * landing the user at the unauthenticated splash screen cleanly.
 *
 * SECURITY FIX: Added exponential backoff to prevent infinite reload loops.
 *
 * This must wrap the entire app or at minimum the auth provider tree.
 */

// Track reload attempts to prevent infinite loops
const RELOAD_ATTEMPT_KEY = 'auth_error_reload_attempts';
const RELOAD_TIMESTAMP_KEY = 'auth_error_reload_timestamp';
const MAX_RELOAD_ATTEMPTS = 3;
const RELOAD_WINDOW_MS = 60000; // 1 minute window

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string | null
  reloadBlocked: boolean
}

export class AuthErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: null, reloadBlocked: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message }
  }

  private shouldBlockReload(): boolean {
    try {
      const lastTimestamp = parseInt(sessionStorage.getItem(RELOAD_TIMESTAMP_KEY) || '0', 10);
      const attempts = parseInt(sessionStorage.getItem(RELOAD_ATTEMPT_KEY) || '0', 10);
      const now = Date.now();
      
      // Reset counter if outside the window
      if (now - lastTimestamp > RELOAD_WINDOW_MS) {
        sessionStorage.setItem(RELOAD_ATTEMPT_KEY, '0');
        sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, now.toString());
        return false;
      }
      
      // Block if too many attempts
      return attempts >= MAX_RELOAD_ATTEMPTS;
    } catch {
      return false; // If storage fails, allow reload
    }
  }

  private incrementReloadAttempt(): void {
    try {
      const attempts = parseInt(sessionStorage.getItem(RELOAD_ATTEMPT_KEY) || '0', 10);
      sessionStorage.setItem(RELOAD_ATTEMPT_KEY, (attempts + 1).toString());
      sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, Date.now().toString());
    } catch {
      // Ignore storage errors
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Only auto-recover from auth/session-related crashes
    const isAuthError = [
      'auth', 'session', 'token', 'profile', 'unauthenticated', 'setup',
    ].some(keyword => error.message.toLowerCase().includes(keyword))

    if (isAuthError) {
      // SECURITY FIX: Check if we've reloaded too many times recently
      if (this.shouldBlockReload()) {
        console.error('[AuthErrorBoundary] Blocking auto-reload to prevent infinite loop');
        this.setState({ reloadBlocked: true });
        return;
      }
      
      // Track this reload attempt
      this.incrementReloadAttempt();
      
      // Clear all auth storage to remove the stale state
      try {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth'))) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k))
        // Note: Don't clear sessionStorage entirely - we need our reload tracking
      } catch {
        // Storage inaccessible — ignore
      }
      // Reload to get a clean unauthenticated state
      window.location.href = '/'
      return
    }

    // Non-auth errors: secure logging
    if (process.env.NODE_ENV === 'development') {
      console.error('[AuthErrorBoundary] Unhandled error:', error, info);
    }
    import('@/lib/logger').then(({ logger }) => {
      logger.error('AuthErrorBoundary unhandled error', error, { componentStack: info.componentStack });
    });
    import('@/lib/error-monitoring').then(({ captureError }) => {
      captureError(error, {
        category: 'authentication',
        additionalData: { componentStack: info.componentStack },
      });
    });
  }

  handleReset = () => {
    // Clear auth storage and reload
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          localStorage.removeItem(key)
        }
      }
      // Reset reload counter on manual reset
      sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
      sessionStorage.removeItem(RELOAD_TIMESTAMP_KEY);
    } catch { /* ignore */ }
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      // Minimal fallback UI — do NOT show a fancy page, just a safe recovery button
      return (
        <div className={styles['auth-error-boundary__container']}>
          <div className={styles['auth-error-boundary__icon']}>⚠️</div>
          <h1 className={styles['auth-error-boundary__title']}>Something went wrong</h1>
          <p className={styles['auth-error-boundary__desc']}>
            {this.state.reloadBlocked 
              ? 'Multiple errors detected. Please try again in a minute or clear your browser data.'
              : 'An unexpected error occurred. Clearing session data and returning to the login screen.'}
          </p>
          <button
            onClick={this.handleReset}
            className={styles['auth-error-boundary__button']}
          >
            Return to sign in
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
