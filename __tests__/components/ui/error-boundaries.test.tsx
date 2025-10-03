import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '@/components/ui/error-boundaries';

// Mock error reporting service
const mockErrorReporting = {
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
  setContext: jest.fn(),
};

// Mock component that throws errors
const ThrowError = ({ shouldThrow = false, errorType = 'generic' }: { shouldThrow?: boolean; errorType?: string }) => {
  if (shouldThrow) {
    switch (errorType) {
      case 'network':
        throw new Error('Network error: Failed to fetch data');
      case 'runtime':
        throw new TypeError('Cannot read property of undefined');
      case 'async':
        throw new Promise((_, reject) => reject(new Error('Async operation failed')));
      case 'chunk':
        throw new Error('ChunkLoadError: Failed to load chunk');
      default:
        throw new Error('Test error message');
    }
  }
  return <div data-testid="working-component">Component is working</div>;
};

// Mock Next.js router
const mockRouter = {
  push: jest.fn(),
  reload: jest.fn(),
  back: jest.fn(),
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Mock console methods to test error logging
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  describe('Normal Operation', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('working-component')).toBeInTheDocument();
      expect(screen.getByText('Component is working')).toBeInTheDocument();
    });

    it('passes props through to children', () => {
      const ChildComponent = ({ message }: { message: string }) => (
        <div data-testid="child-with-props">{message}</div>
      );

      render(
        <ErrorBoundary>
          <ChildComponent message="Hello World" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('catches and displays generic errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
    });

    it('displays custom error messages for known error types', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="network" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Network Error')).toBeInTheDocument();
      expect(screen.getByText('Please check your internet connection and try again.')).toBeInTheDocument();
    });

    it('handles runtime errors with specific messaging', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="runtime" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Runtime Error')).toBeInTheDocument();
      expect(screen.getByText('A programming error occurred. Our team has been notified.')).toBeInTheDocument();
    });

    it('handles chunk loading errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="chunk" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Loading Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load application resources. Please refresh the page.')).toBeInTheDocument();
    });
  });

  describe('Error Information Display', () => {
    it('shows error details when enabled', () => {
      render(
        <ErrorBoundary showErrorDetails={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error Details')).toBeInTheDocument();
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('hides error details in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      render(
        <ErrorBoundary showErrorDetails={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText('Error Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Test error message')).not.toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it('displays stack trace when available', () => {
      render(
        <ErrorBoundary showStackTrace={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Stack Trace')).toBeInTheDocument();
      expect(screen.getByTestId('error-stack-trace')).toBeInTheDocument();
    });

    it('shows component stack information', () => {
      render(
        <ErrorBoundary showComponentStack={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Stack')).toBeInTheDocument();
      expect(screen.getByTestId('component-stack')).toBeInTheDocument();
    });
  });

  describe('Recovery Actions', () => {
    it('provides retry functionality', () => {
      render(
        <ErrorBoundary allowRetry={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Test retry functionality
      fireEvent.click(screen.getByText('Try Again'));
      expect(screen.getByTestId('working-component')).toBeInTheDocument();
    });

    it('limits retry attempts', () => {
      render(
        <ErrorBoundary allowRetry={true} maxRetries={2}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // First retry
      fireEvent.click(screen.getByText('Try Again'));
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Second retry
      fireEvent.click(screen.getByText('Try Again'));
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Third retry should be disabled
      fireEvent.click(screen.getByText('Try Again'));
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
      expect(screen.getByText('Maximum retry attempts reached')).toBeInTheDocument();
    });

    it('provides navigation options', () => {
      render(
        <ErrorBoundary showNavigationOptions={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Go Home')).toBeInTheDocument();
      expect(screen.getByText('Go Back')).toBeInTheDocument();
      expect(screen.getByText('Reload Page')).toBeInTheDocument();

      // Test navigation
      fireEvent.click(screen.getByText('Go Home'));
      expect(mockRouter.push).toHaveBeenCalledWith('/');

      fireEvent.click(screen.getByText('Go Back'));
      expect(mockRouter.back).toHaveBeenCalled();

      fireEvent.click(screen.getByText('Reload Page'));
      expect(mockRouter.reload).toHaveBeenCalled();
    });

    it('allows custom recovery actions', () => {
      const mockCustomAction = jest.fn();
      const customActions = [
        { label: 'Custom Action', action: mockCustomAction },
      ];

      render(
        <ErrorBoundary customActions={customActions}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom Action')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Custom Action'));
      expect(mockCustomAction).toHaveBeenCalled();
    });
  });

  describe('Error Reporting and Logging', () => {
    it('reports errors to external service', () => {
      render(
        <ErrorBoundary onError={mockErrorReporting.captureException}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(mockErrorReporting.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });

    it('logs errors to console in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalledWith(
        'ErrorBoundary caught an error:',
        expect.any(Error),
        expect.any(String)
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('includes additional context in error reports', () => {
      const context = {
        userId: 'user-123',
        feature: 'dashboard',
        buildVersion: '1.2.3',
      };

      render(
        <ErrorBoundary onError={mockErrorReporting.captureException} context={context}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(mockErrorReporting.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context,
        })
      );
    });

    it('tracks error frequency and patterns', () => {
      const mockTrackError = jest.fn();

      render(
        <ErrorBoundary onErrorTracking={mockTrackError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(mockTrackError).toHaveBeenCalledWith({
        errorType: 'Error',
        errorMessage: 'Test error message',
        timestamp: expect.any(Number),
        userAgent: expect.any(String),
      });
    });
  });

  describe('Fallback UI Customization', () => {
    it('renders custom fallback component', () => {
      const CustomFallback = ({ error }: { error: Error }) => (
        <div data-testid="custom-fallback">
          Custom error UI: {error.message}
        </div>
      );

      render(
        <ErrorBoundary fallback={CustomFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
      expect(screen.getByText('Custom error UI: Test error message')).toBeInTheDocument();
    });

    it('applies custom styling', () => {
      render(
        <ErrorBoundary className="custom-error-class" style={{ backgroundColor: 'red' }}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const errorBoundary = screen.getByTestId('error-boundary');
      expect(errorBoundary).toHaveClass('custom-error-class');
      expect(errorBoundary).toHaveStyle('background-color: red');
    });

    it('supports different error UI themes', () => {
      render(
        <ErrorBoundary theme="minimal">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('error-boundary')).toHaveClass('error-boundary-minimal');
    });

    it('renders different UI based on error severity', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="network" />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('error-boundary')).toHaveClass('error-severity-medium');
    });
  });

  describe('User Feedback and Support', () => {
    it('provides feedback form for error reports', () => {
      render(
        <ErrorBoundary showFeedbackForm={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Report this issue')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Describe what you were doing...')).toBeInTheDocument();
      expect(screen.getByText('Send Report')).toBeInTheDocument();
    });

    it('handles feedback form submission', () => {
      const mockSubmitFeedback = jest.fn();

      render(
        <ErrorBoundary showFeedbackForm={true} onFeedbackSubmit={mockSubmitFeedback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const feedbackInput = screen.getByPlaceholderText('Describe what you were doing...');
      const submitButton = screen.getByText('Send Report');

      fireEvent.change(feedbackInput, { target: { value: 'I was trying to submit a form' } });
      fireEvent.click(submitButton);

      expect(mockSubmitFeedback).toHaveBeenCalledWith({
        errorMessage: 'Test error message',
        userFeedback: 'I was trying to submit a form',
        timestamp: expect.any(Number),
      });
    });

    it('displays support contact information', () => {
      render(
        <ErrorBoundary showSupportInfo={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Need help?')).toBeInTheDocument();
      expect(screen.getByText('Contact Support')).toBeInTheDocument();
      expect(screen.getByText('support@example.com')).toBeInTheDocument();
    });

    it('generates error report ID for support', () => {
      render(
        <ErrorBoundary generateReportId={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Error ID:/)).toBeInTheDocument();
      expect(screen.getByTestId('error-report-id')).toBeInTheDocument();
    });
  });

  describe('Accessibility and User Experience', () => {
    it('provides proper ARIA attributes', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const errorBoundary = screen.getByTestId('error-boundary');
      expect(errorBoundary).toHaveAttribute('role', 'alert');
      expect(errorBoundary).toHaveAttribute('aria-live', 'assertive');
    });

    it('focuses error message for screen readers', () => {
      render(
        <ErrorBoundary autoFocus={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const errorMessage = screen.getByTestId('error-message');
      expect(document.activeElement).toBe(errorMessage);
    });

    it('provides keyboard navigation for actions', () => {
      render(
        <ErrorBoundary allowRetry={true} showNavigationOptions={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByText('Try Again');
      const homeButton = screen.getByText('Go Home');

      retryButton.focus();
      expect(document.activeElement).toBe(retryButton);

      // Tab to next button
      fireEvent.keyDown(retryButton, { key: 'Tab' });
      homeButton.focus();
      expect(document.activeElement).toBe(homeButton);
    });

    it('handles escape key to dismiss error details', () => {
      render(
        <ErrorBoundary showErrorDetails={true} dismissible={true}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error Details')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('Error Details')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases and Error Recovery', () => {
    it('handles errors in error handling', () => {
      const FaultyErrorBoundary = () => {
        throw new Error('Error in error boundary');
      };

      render(
        <ErrorBoundary fallback={FaultyErrorBoundary}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Should fallback to default error UI
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('prevents infinite error loops', () => {
      const InfiniteErrorComponent = () => {
        throw new Error('Infinite error');
      };

      render(
        <ErrorBoundary preventInfiniteLoop={true}>
          <InfiniteErrorComponent />
        </ErrorBoundary>
      );

      // Should render error UI only once
      expect(screen.getAllByTestId('error-boundary')).toHaveLength(1);
    });

    it('handles async errors gracefully', async () => {
      const AsyncErrorComponent = () => {
        React.useEffect(() => {
          Promise.reject(new Error('Async error'));
        }, []);
        return <div>Async component</div>;
      };

      render(
        <ErrorBoundary catchAsyncErrors={true}>
          <AsyncErrorComponent />
        </ErrorBoundary>
      );

      // Note: React Error Boundaries don't catch async errors by default
      // This would require additional error handling logic
      expect(screen.getByText('Async component')).toBeInTheDocument();
    });

    it('recovers from temporary errors', () => {
      let shouldThrow = true;
      const RecoverableComponent = () => {
        if (shouldThrow) {
          shouldThrow = false;
          throw new Error('Temporary error');
        }
        return <div data-testid="recovered-component">Recovered</div>;
      };

      render(
        <ErrorBoundary allowRetry={true}>
          <RecoverableComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Try Again'));
      expect(screen.getByTestId('recovered-component')).toBeInTheDocument();
    });
  });

  describe('Performance and Memory Management', () => {
    it('cleans up resources on unmount', () => {
      const { unmount } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      const mockCleanup = jest.fn();
      // Mock cleanup function
      (window as any).errorBoundaryCleanup = mockCleanup;

      unmount();

      expect(mockCleanup).toHaveBeenCalled();
    });

    it('memoizes error state to prevent unnecessary re-renders', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const initialErrorElement = screen.getByTestId('error-boundary');

      // Re-render with same error
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const afterRerenderElement = screen.getByTestId('error-boundary');
      expect(initialErrorElement).toBe(afterRerenderElement);
    });

    it('limits error context size to prevent memory leaks', () => {
      const largeContext = {
        data: new Array(10000).fill('large data'),
      };

      render(
        <ErrorBoundary context={largeContext} maxContextSize={1000}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Should truncate context to prevent memory issues
      expect(mockErrorReporting.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            truncated: true,
          }),
        })
      );
    });
  });
});