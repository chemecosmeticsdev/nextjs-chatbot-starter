import { render, screen, waitFor, act } from '@testing-library/react';
import { PageTransition } from '@/components/ui/page-transition';

// Mock framer-motion for animation testing
const mockMotionDiv = jest.fn(({ children, ...props }) => <div {...props}>{children}</div>);
const mockAnimatePresence = jest.fn(({ children }) => children);

jest.mock('framer-motion', () => ({
  motion: {
    div: mockMotionDiv,
  },
  AnimatePresence: mockAnimatePresence,
  usePresence: () => [true, () => {}],
}));

// Mock Next.js router
const mockRouter = {
  asPath: '/dashboard',
  pathname: '/dashboard',
  query: {},
  push: jest.fn(),
  replace: jest.fn(),
  events: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  },
};

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByName: jest.fn(() => []),
  },
});

// Test components
const PageOne = () => <div data-testid="page-one">Page One Content</div>;
const PageTwo = () => <div data-testid="page-two">Page Two Content</div>;
const LoadingComponent = () => <div data-testid="loading-component">Loading...</div>;

describe('PageTransition Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Basic Transition Rendering', () => {
    it('renders page content with transition wrapper', () => {
      render(
        <PageTransition>
          <PageOne />
        </PageTransition>
      );

      expect(screen.getByTestId('page-transition')).toBeInTheDocument();
      expect(screen.getByTestId('page-one')).toBeInTheDocument();
    });

    it('applies default transition animations', () => {
      render(
        <PageTransition>
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: expect.objectContaining({ opacity: 0 }),
          animate: expect.objectContaining({ opacity: 1 }),
          exit: expect.objectContaining({ opacity: 0 }),
        }),
        expect.any(Object)
      );
    });

    it('wraps content in AnimatePresence', () => {
      render(
        <PageTransition>
          <PageOne />
        </PageTransition>
      );

      expect(mockAnimatePresence).toHaveBeenCalled();
    });

    it('applies custom transition key', () => {
      render(
        <PageTransition transitionKey="custom-key">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'custom-key',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Transition Types', () => {
    it('applies fade transition', () => {
      render(
        <PageTransition type="fade">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
        }),
        expect.any(Object)
      );
    });

    it('applies slide transition', () => {
      render(
        <PageTransition type="slide" direction="left">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { x: '100%' },
          animate: { x: 0 },
          exit: { x: '-100%' },
        }),
        expect.any(Object)
      );
    });

    it('applies scale transition', () => {
      render(
        <PageTransition type="scale">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { scale: 0.9, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          exit: { scale: 0.9, opacity: 0 },
        }),
        expect.any(Object)
      );
    });

    it('applies flip transition', () => {
      render(
        <PageTransition type="flip">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { rotateY: 90 },
          animate: { rotateY: 0 },
          exit: { rotateY: -90 },
        }),
        expect.any(Object)
      );
    });

    it('applies rotate transition', () => {
      render(
        <PageTransition type="rotate">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { rotate: 180, opacity: 0 },
          animate: { rotate: 0, opacity: 1 },
          exit: { rotate: -180, opacity: 0 },
        }),
        expect.any(Object)
      );
    });
  });

  describe('Transition Directions', () => {
    it('handles slide left direction', () => {
      render(
        <PageTransition type="slide" direction="left">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { x: '100%' },
          exit: { x: '-100%' },
        }),
        expect.any(Object)
      );
    });

    it('handles slide right direction', () => {
      render(
        <PageTransition type="slide" direction="right">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { x: '-100%' },
          exit: { x: '100%' },
        }),
        expect.any(Object)
      );
    });

    it('handles slide up direction', () => {
      render(
        <PageTransition type="slide" direction="up">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { y: '100%' },
          exit: { y: '-100%' },
        }),
        expect.any(Object)
      );
    });

    it('handles slide down direction', () => {
      render(
        <PageTransition type="slide" direction="down">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { y: '-100%' },
          exit: { y: '100%' },
        }),
        expect.any(Object)
      );
    });
  });

  describe('Animation Duration and Timing', () => {
    it('applies custom duration', () => {
      render(
        <PageTransition duration={0.8}>
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          transition: expect.objectContaining({
            duration: 0.8,
          }),
        }),
        expect.any(Object)
      );
    });

    it('applies custom easing', () => {
      render(
        <PageTransition ease="easeInOut">
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          transition: expect.objectContaining({
            ease: 'easeInOut',
          }),
        }),
        expect.any(Object)
      );
    });

    it('applies custom spring configuration', () => {
      const springConfig = { stiffness: 100, damping: 15 };

      render(
        <PageTransition spring={springConfig}>
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          transition: expect.objectContaining(springConfig),
        }),
        expect.any(Object)
      );
    });

    it('handles delayed transitions', () => {
      render(
        <PageTransition delay={0.2}>
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          transition: expect.objectContaining({
            delay: 0.2,
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Loading States and Transition Behavior', () => {
    it('shows loading component during transitions', () => {
      render(
        <PageTransition
          isLoading={true}
          loadingComponent={<LoadingComponent />}
        >
          <PageOne />
        </PageTransition>
      );

      expect(screen.getByTestId('loading-component')).toBeInTheDocument();
      expect(screen.queryByTestId('page-one')).not.toBeInTheDocument();
    });

    it('transitions from loading to content', async () => {
      const { rerender } = render(
        <PageTransition
          isLoading={true}
          loadingComponent={<LoadingComponent />}
        >
          <PageOne />
        </PageTransition>
      );

      expect(screen.getByTestId('loading-component')).toBeInTheDocument();

      rerender(
        <PageTransition
          isLoading={false}
          loadingComponent={<LoadingComponent />}
        >
          <PageOne />
        </PageTransition>
      );

      await waitFor(() => {
        expect(screen.getByTestId('page-one')).toBeInTheDocument();
        expect(screen.queryByTestId('loading-component')).not.toBeInTheDocument();
      });
    });

    it('handles minimum loading duration', async () => {
      const { rerender } = render(
        <PageTransition
          isLoading={true}
          minLoadingDuration={500}
          loadingComponent={<LoadingComponent />}
        >
          <PageOne />
        </PageTransition>
      );

      // Try to stop loading immediately
      rerender(
        <PageTransition
          isLoading={false}
          minLoadingDuration={500}
          loadingComponent={<LoadingComponent />}
        >
          <PageOne />
        </PageTransition>
      );

      // Should still be loading due to minimum duration
      expect(screen.getByTestId('loading-component')).toBeInTheDocument();

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByTestId('page-one')).toBeInTheDocument();
      });
    });

    it('preloads next page content', () => {
      render(
        <PageTransition preloadNext={true}>
          <PageOne />
        </PageTransition>
      );

      expect(screen.getByTestId('preload-container')).toBeInTheDocument();
    });
  });

  describe('Router Integration', () => {
    it('responds to route changes', () => {
      render(
        <PageTransition routeChangeDetection={true}>
          <PageOne />
        </PageTransition>
      );

      expect(mockRouter.events.on).toHaveBeenCalledWith('routeChangeStart', expect.any(Function));
      expect(mockRouter.events.on).toHaveBeenCalledWith('routeChangeComplete', expect.any(Function));
    });

    it('shows loading during route changes', () => {
      const { rerender } = render(
        <PageTransition routeChangeDetection={true}>
          <PageOne />
        </PageTransition>
      );

      // Simulate route change start
      const routeChangeStart = mockRouter.events.on.mock.calls
        .find(call => call[0] === 'routeChangeStart')[1];

      act(() => {
        routeChangeStart();
      });

      expect(screen.getByTestId('route-loading')).toBeInTheDocument();
    });

    it('determines transition direction from route', () => {
      mockRouter.asPath = '/dashboard/settings';
      mockRouter.pathname = '/dashboard/settings';

      render(
        <PageTransition
          routeChangeDetection={true}
          autoDirection={true}
        >
          <PageOne />
        </PageTransition>
      );

      // Should detect deeper navigation
      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { x: '100%' }, // Slide from right for deeper routes
        }),
        expect.any(Object)
      );
    });

    it('handles browser back navigation', () => {
      render(
        <PageTransition
          routeChangeDetection={true}
          handleBackNavigation={true}
        >
          <PageOne />
        </PageTransition>
      );

      // Simulate popstate event
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: { x: '-100%' }, // Slide from left for back navigation
        }),
        expect.any(Object)
      );
    });
  });

  describe('Performance Monitoring', () => {
    it('measures transition performance', () => {
      render(
        <PageTransition
          measurePerformance={true}
          onPerformanceMeasure={jest.fn()}
        >
          <PageOne />
        </PageTransition>
      );

      expect(window.performance.mark).toHaveBeenCalledWith('page-transition-start');
    });

    it('reports transition metrics', async () => {
      const mockOnPerformanceMeasure = jest.fn();

      render(
        <PageTransition
          measurePerformance={true}
          onPerformanceMeasure={mockOnPerformanceMeasure}
        >
          <PageOne />
        </PageTransition>
      );

      // Simulate transition completion
      act(() => {
        jest.advanceTimersByTime(300); // Default transition duration
      });

      await waitFor(() => {
        expect(mockOnPerformanceMeasure).toHaveBeenCalledWith({
          transitionDuration: expect.any(Number),
          renderTime: expect.any(Number),
          routePath: '/dashboard',
        });
      });
    });

    it('tracks transition analytics', () => {
      const mockTrackTransition = jest.fn();

      render(
        <PageTransition
          analytics={true}
          onTransitionTrack={mockTrackTransition}
        >
          <PageOne />
        </PageTransition>
      );

      expect(mockTrackTransition).toHaveBeenCalledWith({
        event: 'page_transition_start',
        transitionType: 'fade',
        fromRoute: undefined,
        toRoute: '/dashboard',
      });
    });
  });

  describe('Accessibility Features', () => {
    it('announces page changes to screen readers', () => {
      render(
        <PageTransition announcePageChanges={true}>
          <PageOne />
        </PageTransition>
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('manages focus during transitions', async () => {
      render(
        <PageTransition manageFocus={true}>
          <PageOne />
        </PageTransition>
      );

      await waitFor(() => {
        const mainContent = screen.getByRole('main') || screen.getByTestId('page-one');
        expect(document.activeElement).toBe(mainContent);
      });
    });

    it('respects reduced motion preferences', () => {
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

      render(
        <PageTransition respectReducedMotion={true}>
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          transition: expect.objectContaining({
            duration: 0, // No animation with reduced motion
          }),
        }),
        expect.any(Object)
      );
    });

    it('provides skip link for keyboard users', () => {
      render(
        <PageTransition showSkipLink={true}>
          <PageOne />
        </PageTransition>
      );

      expect(screen.getByText('Skip to main content')).toBeInTheDocument();
    });
  });

  describe('Custom Transitions and Variants', () => {
    it('applies custom transition variants', () => {
      const customVariants = {
        enter: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.8 },
      };

      render(
        <PageTransition variants={customVariants}>
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          variants: customVariants,
          initial: 'exit',
          animate: 'enter',
          exit: 'exit',
        }),
        expect.any(Object)
      );
    });

    it('supports staggered child animations', () => {
      render(
        <PageTransition staggerChildren={0.1}>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          transition: expect.objectContaining({
            staggerChildren: 0.1,
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles gesture-based transitions', () => {
      render(
        <PageTransition
          dragEnabled={true}
          dragThreshold={100}
          onDragEnd={jest.fn()}
        >
          <PageOne />
        </PageTransition>
      );

      expect(mockMotionDiv).toHaveBeenCalledWith(
        expect.objectContaining({
          drag: 'x',
          dragConstraints: { left: 0, right: 0 },
          onDragEnd: expect.any(Function),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles animation errors gracefully', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      // Mock framer-motion to throw error
      mockMotionDiv.mockImplementationOnce(() => {
        throw new Error('Animation error');
      });

      render(
        <PageTransition fallback={<div data-testid="fallback">Fallback</div>}>
          <PageOne />
        </PageTransition>
      );

      expect(screen.getByTestId('fallback')).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('handles missing children gracefully', () => {
      render(<PageTransition>{null}</PageTransition>);

      expect(screen.getByTestId('page-transition')).toBeInTheDocument();
    });

    it('handles rapid route changes', () => {
      const { rerender } = render(
        <PageTransition routeChangeDetection={true}>
          <PageOne />
        </PageTransition>
      );

      // Rapid re-renders
      rerender(
        <PageTransition routeChangeDetection={true}>
          <PageTwo />
        </PageTransition>
      );

      rerender(
        <PageTransition routeChangeDetection={true}>
          <PageOne />
        </PageTransition>
      );

      // Should handle gracefully without errors
      expect(screen.getByTestId('page-one')).toBeInTheDocument();
    });

    it('cleans up event listeners on unmount', () => {
      const { unmount } = render(
        <PageTransition routeChangeDetection={true}>
          <PageOne />
        </PageTransition>
      );

      unmount();

      expect(mockRouter.events.off).toHaveBeenCalledWith('routeChangeStart', expect.any(Function));
      expect(mockRouter.events.off).toHaveBeenCalledWith('routeChangeComplete', expect.any(Function));
    });
  });

  describe('Memory Management and Performance', () => {
    it('disposes of animation resources on unmount', () => {
      const { unmount } = render(
        <PageTransition>
          <PageOne />
        </PageTransition>
      );

      const mockDispose = jest.fn();
      // Mock animation cleanup
      (window as any).animationCleanup = mockDispose;

      unmount();

      expect(mockDispose).toHaveBeenCalled();
    });

    it('throttles resize event handlers', () => {
      const mockOnResize = jest.fn();

      render(
        <PageTransition
          responsiveTransitions={true}
          onResize={mockOnResize}
        >
          <PageOne />
        </PageTransition>
      );

      // Rapid resize events
      act(() => {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
      });

      // Should throttle calls
      expect(mockOnResize).toHaveBeenCalledTimes(1);
    });

    it('uses requestAnimationFrame for smooth animations', () => {
      const mockRAF = jest.spyOn(window, 'requestAnimationFrame');

      render(
        <PageTransition useRAF={true}>
          <PageOne />
        </PageTransition>
      );

      expect(mockRAF).toHaveBeenCalled();

      mockRAF.mockRestore();
    });
  });
});