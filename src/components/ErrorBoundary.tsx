"use client";

import { Component, ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// Error Boundary Props
// ═══════════════════════════════════════════════════════════════

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// ═══════════════════════════════════════════════════════════════
// Error Boundary Component
// ═══════════════════════════════════════════════════════════════

/**
 * ErrorBoundary catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the app.
 * 
 * Usage:
 * <ErrorBoundary onReset={handleReset} showDetails={isDev}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    if (process.env.NODE_ENV === 'development') {
      console.error("ErrorBoundary caught an error:", error);
      console.error("Component stack:", errorInfo.componentStack);
    }
    import('@/lib/logger').then(({ logger }) => {
      logger.error('ErrorBoundary caught an error', error, { componentStack: errorInfo.componentStack });
    });
    import('@/lib/error-monitoring').then(({ captureError }) => {
      captureError(error, {
        category: 'rendering',
        additionalData: { componentStack: errorInfo.componentStack },
      });
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center min-h-75 p-6 text-center"
          role="alert"
          aria-live="assertive"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 rounded-2xl bg-linear-to-br from-rose-100 to-amber-100 dark:from-rose-950/50 dark:to-amber-950/50 flex items-center justify-center mb-4"
          >
            <AlertTriangle className="w-8 h-8 text-rose-500" />
          </motion.div>
          
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Something went wrong
          </h2>
          
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            We encountered an unexpected error. Please try again or refresh the page.
          </p>

          {/* Error details (development only) */}
          {this.props.showDetails && this.state.error && (
            <details className="mb-6 w-full max-w-md">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                View error details
              </summary>
              <div className="mt-2 p-3 bg-muted/50 rounded-lg overflow-auto">
                <pre className="text-xs text-left whitespace-pre-wrap wrap-break-word">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {"\n\nComponent Stack:"}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </div>
            </details>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Page
            </Button>
            
            <Button
              variant="default"
              size="sm"
              onClick={this.handleReset}
              className="gap-2 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
            >
              Try Again
            </Button>
          </div>
        </motion.div>
      );
    }

    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════
// Simple Error Fallback for inline errors
// ═══════════════════════════════════════════════════════════════

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary?: () => void;
  message?: string;
}

export function ErrorFallback({ 
  error, 
  resetErrorBoundary,
  message = "Something went wrong loading this content"
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
      <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-rose-500" />
      </div>
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      {resetErrorBoundary && (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetErrorBoundary}
          className="text-emerald-600 dark:text-emerald-400"
        >
          Try again
        </Button>
      )}
    </div>
  );
}

export default ErrorBoundary;
