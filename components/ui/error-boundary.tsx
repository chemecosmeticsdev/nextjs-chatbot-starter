"use client"

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
  className?: string
}

// Main Error Boundary Component
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    })

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
          showDetails={this.props.showDetails}
          className={this.props.className}
        />
      )
    }

    return this.props.children
  }
}

// Default Error Fallback Component
interface ErrorFallbackProps {
  error?: Error
  errorInfo?: ErrorInfo
  onRetry?: () => void
  showDetails?: boolean
  className?: string
  title?: string
  description?: string
}

export function ErrorFallback({
  error,
  errorInfo,
  onRetry,
  showDetails = false,
  className,
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again."
}: ErrorFallbackProps) {
  const [showErrorDetails, setShowErrorDetails] = React.useState(false)

  return (
    <div className={cn("flex flex-col items-center justify-center p-8 space-y-4 text-center", className)}>
      <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
        <AlertTriangle className="w-8 h-8 text-red-600" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-muted-foreground max-w-md">{description}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </button>
        )}

        <button
          onClick={() => window.location.href = '/'}
          className="inline-flex items-center px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
        >
          <Home className="w-4 h-4 mr-2" />
          Go Home
        </button>
      </div>

      {(showDetails && error) && (
        <div className="w-full max-w-2xl">
          <button
            onClick={() => setShowErrorDetails(!showErrorDetails)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Bug className="w-4 h-4" />
            {showErrorDetails ? 'Hide' : 'Show'} Error Details
          </button>

          {showErrorDetails && (
            <div className="mt-4 p-4 bg-muted rounded-md text-left">
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Error:</strong>
                  <pre className="mt-1 text-xs bg-background p-2 rounded overflow-auto">
                    {error.message}
                  </pre>
                </div>

                {error.stack && (
                  <div>
                    <strong>Stack Trace:</strong>
                    <pre className="mt-1 text-xs bg-background p-2 rounded overflow-auto max-h-40">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {errorInfo?.componentStack && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre className="mt-1 text-xs bg-background p-2 rounded overflow-auto max-h-40">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Specialized Error Boundaries for different contexts

// API Error Boundary
interface ApiErrorBoundaryProps extends ErrorBoundaryProps {
  onRetry?: () => void
}

export function ApiErrorBoundary({ children, onRetry, ...props }: ApiErrorBoundaryProps) {
  return (
    <ErrorBoundary
      {...props}
      fallback={
        <ErrorFallback
          title="Failed to load data"
          description="There was an error loading the data. Please check your connection and try again."
          onRetry={onRetry}
          className="py-12"
        />
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// Chat Error Boundary
export function ChatErrorBoundary({ children, ...props }: ErrorBoundaryProps) {
  return (
    <ErrorBoundary
      {...props}
      fallback={
        <ErrorFallback
          title="Chat Error"
          description="Something went wrong with the chat interface. Please refresh to continue."
          className="py-8"
        />
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// Dashboard Error Boundary
export function DashboardErrorBoundary({ children, ...props }: ErrorBoundaryProps) {
  return (
    <ErrorBoundary
      {...props}
      fallback={
        <ErrorFallback
          title="Dashboard Error"
          description="Unable to load the dashboard. Please try refreshing the page."
          className="py-12"
        />
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// Route Error Boundary (for page-level errors)
export function RouteErrorBoundary({ children, ...props }: ErrorBoundaryProps) {
  return (
    <ErrorBoundary
      {...props}
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <ErrorFallback
            title="Page Error"
            description="This page encountered an error and couldn't be displayed properly."
            showDetails={process.env.NODE_ENV === 'development'}
          />
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// Widget/Component Error Boundary (for smaller components)
export function WidgetErrorBoundary({ children, ...props }: ErrorBoundaryProps) {
  return (
    <ErrorBoundary
      {...props}
      fallback={
        <div className="p-4 border border-red-200 rounded-md bg-red-50">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Widget Error</span>
          </div>
          <p className="text-xs text-red-600 mt-1">This component failed to load</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// Hook for functional components to handle errors
export function useErrorHandler() {
  return React.useCallback((error: Error, errorInfo?: ErrorInfo) => {
    // Log error
    console.error('useErrorHandler:', error, errorInfo)

    // You can add error reporting service here
    // Example: reportError(error, errorInfo)
  }, [])
}

// Higher-order component to wrap components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}

// Error boundary hook for Next.js app directory
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null)

  const resetError = React.useCallback(() => {
    setError(null)
  }, [])

  const captureError = React.useCallback((error: Error) => {
    setError(error)
  }, [])

  React.useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return { captureError, resetError }
}

// Compound export
export const ErrorBoundaries = {
  ErrorBoundary,
  ErrorFallback,
  ApiErrorBoundary,
  ChatErrorBoundary,
  DashboardErrorBoundary,
  RouteErrorBoundary,
  WidgetErrorBoundary,
  withErrorBoundary,
  useErrorHandler,
  useErrorBoundary
}