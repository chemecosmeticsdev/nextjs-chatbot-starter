"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Home, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorVariants } from '@/lib/animations';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolate?: boolean;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props;

    this.setState({ errorInfo });

    if (onError) {
      onError(error, errorInfo);
    }

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 Error Boundary Caught Error');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.groupEnd();
    }

    // Send to error reporting service in production
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetOnPropsChange) {
        this.resetErrorBoundary();
      }
    }
  }

  reportError = (error: Error, errorInfo: ErrorInfo) => {
    // This is where you would send the error to your error reporting service
    // For example, Sentry, LogRocket, or a custom endpoint
    try {
      // Example error reporting
      // Sentry.captureException(error, { contexts: { react: errorInfo } });

      // Or send to custom endpoint
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          errorInfo,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(console.error);
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      window.clearTimeout(this.resetTimeoutId);
    }
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleRetry = () => {
    this.resetErrorBoundary();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    const { hasError, error, errorId } = this.state;
    const { children, fallback, isolate } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <ErrorFallback
          error={error}
          errorId={errorId}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          onGoBack={this.handleGoBack}
          isolate={isolate}
        />
      );
    }

    return children;
  }
}

interface ErrorFallbackProps {
  error?: Error;
  errorId?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
  onGoBack?: () => void;
  isolate?: boolean;
  className?: string;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorId,
  onRetry,
  onGoHome,
  onGoBack,
  isolate = false,
  className
}) => {
  const isNetworkError = error?.message.includes('fetch') || error?.message.includes('network');
  const isChunkLoadError = error?.message.includes('Loading chunk') || error?.message.includes('ChunkLoadError');

  const getErrorMessage = () => {
    if (isNetworkError) {
      return 'Network connection issue. Please check your internet connection.';
    }
    if (isChunkLoadError) {
      return 'Application update detected. Please refresh the page.';
    }
    return 'Something went wrong. Our team has been notified.';
  };

  const getErrorTitle = () => {
    if (isNetworkError) {
      return 'Connection Error';
    }
    if (isChunkLoadError) {
      return 'Update Required';
    }
    return 'Oops! Something went wrong';
  };

  const shouldShowTechnicalDetails = process.env.NODE_ENV === 'development';

  return (
    <motion.div
      variants={errorVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'flex flex-col items-center justify-center p-8',
        isolate ? 'min-h-[200px]' : 'min-h-[50vh]',
        className
      )}
    >
      <div className="text-center space-y-6 max-w-md">
        {/* Error Icon */}
        <motion.div
          className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </motion.div>

        {/* Error Content */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            {getErrorTitle()}
          </h2>
          <p className="text-muted-foreground">
            {getErrorMessage()}
          </p>

          {errorId && (
            <p className="text-xs text-muted-foreground mt-4">
              Error ID: {errorId}
            </p>
          )}
        </div>

        {/* Technical Details (Development Only) */}
        {shouldShowTechnicalDetails && error && (
          <motion.details
            className="text-left w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Technical Details
            </summary>
            <div className="mt-2 p-4 bg-muted rounded-md">
              <pre className="text-xs overflow-x-auto text-muted-foreground">
                {error.stack}
              </pre>
            </div>
          </motion.details>
        )}

        {/* Action Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-3 pt-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </button>
          )}

          {!isolate && (
            <>
              {onGoBack && (
                <button
                  onClick={onGoBack}
                  className="inline-flex items-center justify-center px-4 py-2 border border-input rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Go Back
                </button>
              )}

              {onGoHome && (
                <button
                  onClick={onGoHome}
                  className="inline-flex items-center justify-center px-4 py-2 border border-input rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </button>
              )}
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

// Higher-order component for easier use
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Partial<ErrorBoundaryProps>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Async error handler for async operations
export const handleAsyncError = (error: Error, context?: string) => {
  console.error(`Async error${context ? ` in ${context}` : ''}:`, error);

  // Send to error reporting service
  if (process.env.NODE_ENV === 'production') {
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          context,
          type: 'async',
          timestamp: new Date().toISOString(),
          url: window.location.href,
        }),
      }).catch(console.error);
    } catch (reportingError) {
      console.error('Failed to report async error:', reportingError);
    }
  }
};

// Hook for error handling in components
export const useErrorHandler = () => {
  const handleError = React.useCallback((error: Error, context?: string) => {
    handleAsyncError(error, context);
  }, []);

  return { handleError };
};

// Error state components for specific use cases
interface ApiErrorProps {
  error: Error | null;
  loading?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const ApiError: React.FC<ApiErrorProps> = ({
  error,
  loading = false,
  onRetry,
  className
}) => {
  if (!error) return null;

  return (
    <motion.div
      variants={errorVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        'flex flex-col items-center justify-center p-6 text-center space-y-4 border border-destructive/20 rounded-lg bg-destructive/5',
        className
      )}
    >
      <AlertTriangle className="w-8 h-8 text-destructive" />
      <div>
        <h3 className="font-medium text-destructive">Request Failed</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {error.message || 'An unexpected error occurred'}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={loading}
          className="inline-flex items-center justify-center px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Try Again
        </button>
      )}
    </motion.div>
  );
};

interface FormErrorProps {
  error: string | null;
  className?: string;
}

export const FormError: React.FC<FormErrorProps> = ({ error, className }) => {
  if (!error) return null;

  return (
    <motion.div
      variants={errorVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        'flex items-center space-x-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md',
        className
      )}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{error}</span>
    </motion.div>
  );
};

export default ErrorBoundary;
export { ErrorFallback };