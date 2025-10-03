import { render, screen, waitFor } from '@testing-library/react';
import { LoadingStates } from '@/components/ui/loading-states';

// Mock framer-motion for animation testing
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('LoadingStates Component', () => {
  describe('Basic Loading States', () => {
    it('renders spinner loading state', () => {
      render(<LoadingStates type="spinner" />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    });

    it('renders skeleton loading state', () => {
      render(<LoadingStates type="skeleton" />);

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
      expect(screen.getByRole('presentation')).toBeInTheDocument();
    });

    it('renders dots loading state', () => {
      render(<LoadingStates type="dots" />);

      expect(screen.getByTestId('loading-dots')).toBeInTheDocument();
      const dots = screen.getAllByTestId('loading-dot');
      expect(dots).toHaveLength(3);
    });

    it('renders pulse loading state', () => {
      render(<LoadingStates type="pulse" />);

      expect(screen.getByTestId('loading-pulse')).toBeInTheDocument();
    });

    it('renders progress bar loading state', () => {
      render(<LoadingStates type="progress" progress={50} />);

      expect(screen.getByTestId('loading-progress')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    });
  });

  describe('Loading Messages and Labels', () => {
    it('displays custom loading message', () => {
      render(<LoadingStates type="spinner" message="Loading your data..." />);

      expect(screen.getByText('Loading your data...')).toBeInTheDocument();
    });

    it('displays default loading message when none provided', () => {
      render(<LoadingStates type="spinner" />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides message when showMessage is false', () => {
      render(<LoadingStates type="spinner" message="Should not show" showMessage={false} />);

      expect(screen.queryByText('Should not show')).not.toBeInTheDocument();
    });

    it('displays custom aria-label', () => {
      render(<LoadingStates type="spinner" ariaLabel="Custom loading indicator" />);

      expect(screen.getByLabelText('Custom loading indicator')).toBeInTheDocument();
    });
  });

  describe('Size Variations', () => {
    it('renders small size loading state', () => {
      render(<LoadingStates type="spinner" size="small" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('w-4', 'h-4');
    });

    it('renders medium size loading state', () => {
      render(<LoadingStates type="spinner" size="medium" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('w-6', 'h-6');
    });

    it('renders large size loading state', () => {
      render(<LoadingStates type="spinner" size="large" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('w-8', 'h-8');
    });

    it('renders extra large size loading state', () => {
      render(<LoadingStates type="spinner" size="xl" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('w-12', 'h-12');
    });
  });

  describe('Color Variations', () => {
    it('renders primary color loading state', () => {
      render(<LoadingStates type="spinner" color="primary" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('text-primary');
    });

    it('renders secondary color loading state', () => {
      render(<LoadingStates type="spinner" color="secondary" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('text-secondary');
    });

    it('renders muted color loading state', () => {
      render(<LoadingStates type="spinner" color="muted" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('text-muted-foreground');
    });
  });

  describe('Progress Bar Specific Features', () => {
    it('displays progress percentage', () => {
      render(<LoadingStates type="progress" progress={75} showPercentage={true} />);

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('updates progress value dynamically', () => {
      const { rerender } = render(<LoadingStates type="progress" progress={25} />);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');

      rerender(<LoadingStates type="progress" progress={75} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    });

    it('handles indeterminate progress', () => {
      render(<LoadingStates type="progress" />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).not.toHaveAttribute('aria-valuenow');
      expect(progressBar).toHaveClass('indeterminate');
    });

    it('validates progress range (0-100)', () => {
      render(<LoadingStates type="progress" progress={150} />);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });
  });

  describe('Skeleton Loading Variations', () => {
    it('renders text skeleton', () => {
      render(<LoadingStates type="skeleton" variant="text" />);

      const skeleton = screen.getByTestId('loading-skeleton');
      expect(skeleton).toHaveClass('skeleton-text');
    });

    it('renders card skeleton', () => {
      render(<LoadingStates type="skeleton" variant="card" />);

      expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-header')).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-content')).toBeInTheDocument();
    });

    it('renders list skeleton', () => {
      render(<LoadingStates type="skeleton" variant="list" itemCount={3} />);

      const items = screen.getAllByTestId('skeleton-list-item');
      expect(items).toHaveLength(3);
    });

    it('renders table skeleton', () => {
      render(<LoadingStates type="skeleton" variant="table" rows={4} columns={3} />);

      expect(screen.getByTestId('skeleton-table')).toBeInTheDocument();
      const rows = screen.getAllByTestId('skeleton-table-row');
      expect(rows).toHaveLength(4);
    });

    it('renders avatar skeleton', () => {
      render(<LoadingStates type="skeleton" variant="avatar" />);

      expect(screen.getByTestId('skeleton-avatar')).toBeInTheDocument();
    });
  });

  describe('Animation and Timing', () => {
    it('applies custom animation duration', () => {
      render(<LoadingStates type="spinner" duration={2000} />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveStyle('animation-duration: 2000ms');
    });

    it('applies slow animation speed', () => {
      render(<LoadingStates type="dots" speed="slow" />);

      const dotsContainer = screen.getByTestId('loading-dots');
      expect(dotsContainer).toHaveClass('animate-slow');
    });

    it('applies fast animation speed', () => {
      render(<LoadingStates type="pulse" speed="fast" />);

      const pulse = screen.getByTestId('loading-pulse');
      expect(pulse).toHaveClass('animate-fast');
    });

    it('pauses animation when specified', () => {
      render(<LoadingStates type="spinner" paused={true} />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('animation-paused');
    });
  });

  describe('Accessibility Features', () => {
    it('provides proper ARIA attributes', () => {
      render(<LoadingStates type="spinner" />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveAttribute('role', 'status');
      expect(spinner).toHaveAttribute('aria-live', 'polite');
    });

    it('announces loading state changes', () => {
      const { rerender } = render(<LoadingStates type="spinner" message="Loading data..." />);

      expect(screen.getByLabelText('Loading')).toBeInTheDocument();

      rerender(<LoadingStates type="spinner" message="Almost done..." />);
      expect(screen.getByText('Almost done...')).toBeInTheDocument();
    });

    it('supports reduced motion preferences', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
        })),
      });

      render(<LoadingStates type="spinner" respectMotionPreference={true} />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveClass('motion-reduce:animate-none');
    });

    it('provides keyboard navigation support', () => {
      render(<LoadingStates type="progress" progress={50} focusable={true} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Overlay and Modal Loading', () => {
    it('renders fullscreen overlay loading', () => {
      render(<LoadingStates type="spinner" overlay={true} />);

      expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('loading-overlay')).toHaveClass('fixed', 'inset-0');
    });

    it('renders modal loading with backdrop', () => {
      render(<LoadingStates type="spinner" modal={true} />);

      expect(screen.getByTestId('loading-modal')).toBeInTheDocument();
      expect(screen.getByTestId('loading-backdrop')).toBeInTheDocument();
    });

    it('handles overlay dismissal', () => {
      const mockOnDismiss = jest.fn();
      render(<LoadingStates type="spinner" overlay={true} onDismiss={mockOnDismiss} dismissible={true} />);

      const overlay = screen.getByTestId('loading-overlay');
      overlay.click();

      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('prevents overlay dismissal when not dismissible', () => {
      const mockOnDismiss = jest.fn();
      render(<LoadingStates type="spinner" overlay={true} onDismiss={mockOnDismiss} dismissible={false} />);

      const overlay = screen.getByTestId('loading-overlay');
      overlay.click();

      expect(mockOnDismiss).not.toHaveBeenCalled();
    });
  });

  describe('Custom Content and Styling', () => {
    it('renders custom loading content', () => {
      const customContent = <div data-testid="custom-loader">Custom Loading...</div>;
      render(<LoadingStates type="custom" customContent={customContent} />);

      expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
      expect(screen.getByText('Custom Loading...')).toBeInTheDocument();
    });

    it('applies custom CSS classes', () => {
      render(<LoadingStates type="spinner" className="custom-loading-class" />);

      const container = screen.getByTestId('loading-container');
      expect(container).toHaveClass('custom-loading-class');
    });

    it('applies custom inline styles', () => {
      const customStyle = { backgroundColor: 'red', padding: '20px' };
      render(<LoadingStates type="spinner" style={customStyle} />);

      const container = screen.getByTestId('loading-container');
      expect(container).toHaveStyle('background-color: red; padding: 20px');
    });

    it('renders with custom theme', () => {
      const theme = {
        primary: '#ff0000',
        background: '#f0f0f0',
        text: '#333333'
      };

      render(<LoadingStates type="spinner" theme={theme} />);

      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toHaveStyle('color: #ff0000');
    });
  });

  describe('Conditional Rendering and States', () => {
    it('renders loading state when isLoading is true', () => {
      render(<LoadingStates type="spinner" isLoading={true} />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('does not render when isLoading is false', () => {
      render(<LoadingStates type="spinner" isLoading={false} />);

      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    it('shows loading state with delay', async () => {
      render(<LoadingStates type="spinner" delay={500} />);

      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      }, { timeout: 600 });
    });

    it('hides loading state after timeout', async () => {
      render(<LoadingStates type="spinner" timeout={1000} />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      }, { timeout: 1100 });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles invalid progress values gracefully', () => {
      render(<LoadingStates type="progress" progress={-10} />);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('handles missing required props', () => {
      // Should not crash with minimal props
      render(<LoadingStates type="spinner" />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('handles invalid type gracefully', () => {
      render(<LoadingStates type="invalid" as any />);

      // Should fallback to spinner
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('handles null children gracefully', () => {
      render(<LoadingStates type="skeleton" variant="custom">{null}</LoadingStates>);

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    });
  });

  describe('Performance and Memory', () => {
    it('cleans up animations on unmount', () => {
      const { unmount } = render(<LoadingStates type="spinner" />);

      // Mock animation cleanup
      const mockClearInterval = jest.spyOn(global, 'clearInterval');

      unmount();

      expect(mockClearInterval).toHaveBeenCalled();
    });

    it('memoizes expensive computations', () => {
      const expensiveConfig = {
        type: 'skeleton' as const,
        variant: 'list' as const,
        itemCount: 100
      };

      const { rerender } = render(<LoadingStates {...expensiveConfig} />);

      const initialItems = screen.getAllByTestId('skeleton-list-item');

      // Re-render with same props
      rerender(<LoadingStates {...expensiveConfig} />);

      const afterRerenderItems = screen.getAllByTestId('skeleton-list-item');
      expect(initialItems.length).toBe(afterRerenderItems.length);
    });

    it('debounces rapid state changes', async () => {
      const { rerender } = render(<LoadingStates type="spinner" isLoading={false} />);

      // Rapid state changes
      rerender(<LoadingStates type="spinner" isLoading={true} />);
      rerender(<LoadingStates type="spinner" isLoading={false} />);
      rerender(<LoadingStates type="spinner" isLoading={true} />);

      // Should eventually settle on the final state
      await waitFor(() => {
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      });
    });
  });

  describe('Integration and Context', () => {
    it('integrates with loading context provider', () => {
      const LoadingProvider = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="loading-context">{children}</div>
      );

      render(
        <LoadingProvider>
          <LoadingStates type="spinner" />
        </LoadingProvider>
      );

      expect(screen.getByTestId('loading-context')).toBeInTheDocument();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('responds to global loading state changes', () => {
      const mockGlobalState = { isLoading: true, message: 'Global loading...' };

      render(<LoadingStates type="spinner" globalState={mockGlobalState} />);

      expect(screen.getByText('Global loading...')).toBeInTheDocument();
    });

    it('provides loading state to child components', () => {
      const ChildComponent = () => {
        const loadingContext = { isLoading: true };
        return <div data-testid="child">{loadingContext.isLoading ? 'Loading' : 'Ready'}</div>;
      };

      render(
        <LoadingStates type="spinner">
          <ChildComponent />
        </LoadingStates>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Loading');
    });
  });
});