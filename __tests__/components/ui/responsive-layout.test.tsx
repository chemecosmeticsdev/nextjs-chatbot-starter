import { render, screen, fireEvent, act } from '@testing-library/react';
import { ResponsiveLayout } from '@/components/ui/responsive-layout';

// Mock window.matchMedia for responsive testing
const mockMatchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
});

// Mock ResizeObserver for layout testing
const mockResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver for visibility testing
const mockIntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.ResizeObserver = mockResizeObserver;
global.IntersectionObserver = mockIntersectionObserver;

// Mock viewport dimensions
const mockViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });

  // Mock media queries based on viewport
  window.matchMedia = jest.fn().mockImplementation((query) => {
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;
    const isLargeDesktop = width >= 1440;

    let matches = false;
    if (query.includes('max-width: 767px')) matches = isMobile;
    if (query.includes('min-width: 768px') && query.includes('max-width: 1023px')) matches = isTablet;
    if (query.includes('min-width: 1024px')) matches = isDesktop;
    if (query.includes('min-width: 1440px')) matches = isLargeDesktop;

    return {
      ...mockMatchMedia(query),
      matches,
    };
  });
};

// Test content components
const SidebarContent = () => <div data-testid="sidebar-content">Sidebar</div>;
const MainContent = () => <div data-testid="main-content">Main Content</div>;
const HeaderContent = () => <div data-testid="header-content">Header</div>;
const FooterContent = () => <div data-testid="footer-content">Footer</div>;

describe('ResponsiveLayout Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockViewport(1024, 768); // Default desktop viewport
  });

  describe('Basic Layout Rendering', () => {
    it('renders basic layout structure', () => {
      render(
        <ResponsiveLayout>
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('responsive-layout')).toBeInTheDocument();
      expect(screen.getByTestId('main-content')).toBeInTheDocument();
    });

    it('renders with sidebar', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('sidebar-content')).toBeInTheDocument();
      expect(screen.getByTestId('main-content')).toBeInTheDocument();
    });

    it('renders with header and footer', () => {
      render(
        <ResponsiveLayout
          header={<HeaderContent />}
          footer={<FooterContent />}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('header-content')).toBeInTheDocument();
      expect(screen.getByTestId('footer-content')).toBeInTheDocument();
      expect(screen.getByTestId('main-content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <ResponsiveLayout className="custom-layout">
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('responsive-layout')).toHaveClass('custom-layout');
    });
  });

  describe('Mobile Layout (< 768px)', () => {
    beforeEach(() => {
      mockViewport(375, 812); // Mobile viewport
    });

    it('adapts to mobile layout', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('layout-mobile');
    });

    it('hides sidebar by default on mobile', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');
      expect(sidebar).toHaveClass('sidebar-hidden');
    });

    it('shows mobile menu toggle', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('mobile-menu-toggle')).toBeInTheDocument();
      expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument();
    });

    it('toggles sidebar visibility on mobile menu click', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const menuToggle = screen.getByTestId('mobile-menu-toggle');
      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');

      expect(sidebar).toHaveClass('sidebar-hidden');

      fireEvent.click(menuToggle);
      expect(sidebar).toHaveClass('sidebar-visible');

      fireEvent.click(menuToggle);
      expect(sidebar).toHaveClass('sidebar-hidden');
    });

    it('uses stacked layout for content', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const contentArea = screen.getByTestId('content-area');
      expect(contentArea).toHaveClass('content-stacked');
    });

    it('hides sidebar on outside click', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const menuToggle = screen.getByTestId('mobile-menu-toggle');
      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');
      const overlay = screen.getByTestId('mobile-overlay');

      // Open sidebar
      fireEvent.click(menuToggle);
      expect(sidebar).toHaveClass('sidebar-visible');

      // Click overlay to close
      fireEvent.click(overlay);
      expect(sidebar).toHaveClass('sidebar-hidden');
    });
  });

  describe('Tablet Layout (768px - 1023px)', () => {
    beforeEach(() => {
      mockViewport(768, 1024); // Tablet viewport
    });

    it('adapts to tablet layout', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('layout-tablet');
    });

    it('shows collapsed sidebar by default', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');
      expect(sidebar).toHaveClass('sidebar-collapsed');
    });

    it('allows sidebar expansion on tablet', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const sidebarToggle = screen.getByTestId('sidebar-toggle');
      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');

      fireEvent.click(sidebarToggle);
      expect(sidebar).toHaveClass('sidebar-expanded');
    });

    it('adjusts content width for collapsed sidebar', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const contentArea = screen.getByTestId('content-area');
      expect(contentArea).toHaveClass('content-with-collapsed-sidebar');
    });
  });

  describe('Desktop Layout (≥ 1024px)', () => {
    beforeEach(() => {
      mockViewport(1024, 768); // Desktop viewport
    });

    it('adapts to desktop layout', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('layout-desktop');
    });

    it('shows expanded sidebar by default', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');
      expect(sidebar).toHaveClass('sidebar-expanded');
    });

    it('maintains sidebar state on desktop', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const sidebarToggle = screen.getByTestId('sidebar-toggle');
      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');

      fireEvent.click(sidebarToggle);
      expect(sidebar).toHaveClass('sidebar-collapsed');

      fireEvent.click(sidebarToggle);
      expect(sidebar).toHaveClass('sidebar-expanded');
    });

    it('uses side-by-side layout', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const contentArea = screen.getByTestId('content-area');
      expect(contentArea).toHaveClass('content-side-by-side');
    });
  });

  describe('Large Desktop Layout (≥ 1440px)', () => {
    beforeEach(() => {
      mockViewport(1440, 900); // Large desktop viewport
    });

    it('adapts to large desktop layout', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('layout-large-desktop');
    });

    it('provides wider content area', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const contentArea = screen.getByTestId('content-area');
      expect(contentArea).toHaveClass('content-wide');
    });

    it('shows additional navigation options', () => {
      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          showSecondaryNav={true}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('secondary-navigation')).toBeInTheDocument();
    });
  });

  describe('Responsive Breakpoint Handling', () => {
    it('updates layout on viewport resize', () => {
      const { rerender } = render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('layout-desktop');

      // Simulate resize to mobile
      act(() => {
        mockViewport(375, 812);
        window.dispatchEvent(new Event('resize'));
      });

      rerender(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      expect(layout).toHaveClass('layout-mobile');
    });

    it('debounces resize events', () => {
      const mockResizeHandler = jest.fn();

      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          onResize={mockResizeHandler}
          resizeDebounce={100}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      // Rapid resize events
      act(() => {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
      });

      // Should only call once after debounce
      expect(mockResizeHandler).toHaveBeenCalledTimes(1);
    });

    it('maintains state across breakpoint changes', () => {
      const { rerender } = render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      // Collapse sidebar on desktop
      const sidebarToggle = screen.getByTestId('sidebar-toggle');
      fireEvent.click(sidebarToggle);

      // Resize to tablet
      act(() => {
        mockViewport(768, 1024);
        window.dispatchEvent(new Event('resize'));
      });

      rerender(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      // Sidebar should remain collapsed
      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');
      expect(sidebar).toHaveClass('sidebar-collapsed');
    });
  });

  describe('Accessibility Features', () => {
    it('provides proper ARIA labels', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByLabelText('Toggle sidebar')).toBeInTheDocument();
    });

    it('manages focus properly on sidebar toggle', () => {
      mockViewport(375, 812); // Mobile

      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const menuToggle = screen.getByTestId('mobile-menu-toggle');
      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');

      // Open sidebar and check focus
      fireEvent.click(menuToggle);
      expect(sidebar?.querySelector('[tabindex="0"]')).toBe(document.activeElement);
    });

    it('supports keyboard navigation', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const sidebarToggle = screen.getByTestId('sidebar-toggle');

      // Test keyboard activation
      fireEvent.keyDown(sidebarToggle, { key: 'Enter' });
      expect(screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]'))
        .toHaveClass('sidebar-collapsed');

      fireEvent.keyDown(sidebarToggle, { key: ' ' });
      expect(screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]'))
        .toHaveClass('sidebar-expanded');
    });

    it('announces layout changes to screen readers', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByRole('status')).toBeInTheDocument();

      const sidebarToggle = screen.getByTestId('sidebar-toggle');
      fireEvent.click(sidebarToggle);

      expect(screen.getByRole('status')).toHaveTextContent('Sidebar collapsed');
    });

    it('supports reduced motion preferences', () => {
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
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('motion-reduce');
    });
  });

  describe('Content Overflow and Scrolling', () => {
    it('handles content overflow properly', () => {
      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <div style={{ height: '2000px' }}>
            <MainContent />
          </div>
        </ResponsiveLayout>
      );

      const contentArea = screen.getByTestId('content-area');
      expect(contentArea).toHaveClass('overflow-auto');
    });

    it('maintains scroll position on layout changes', () => {
      const { rerender } = render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <div style={{ height: '2000px' }}>
            <MainContent />
          </div>
        </ResponsiveLayout>
      );

      const contentArea = screen.getByTestId('content-area');

      // Set scroll position
      Object.defineProperty(contentArea, 'scrollTop', {
        value: 500,
        writable: true
      });

      // Toggle sidebar
      const sidebarToggle = screen.getByTestId('sidebar-toggle');
      fireEvent.click(sidebarToggle);

      // Scroll position should be maintained
      expect(contentArea.scrollTop).toBe(500);
    });

    it('provides smooth scrolling behavior', () => {
      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          smoothScrolling={true}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      const contentArea = screen.getByTestId('content-area');
      expect(contentArea).toHaveStyle('scroll-behavior: smooth');
    });
  });

  describe('Performance Optimizations', () => {
    it('virtualizes off-screen content on mobile', () => {
      mockViewport(375, 812); // Mobile

      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          virtualizeContent={true}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('virtual-content-container')).toBeInTheDocument();
    });

    it('lazy loads sidebar content', () => {
      const LazySidebar = () => <div data-testid="lazy-sidebar">Lazy Sidebar</div>;

      render(
        <ResponsiveLayout
          sidebar={<LazySidebar />}
          lazySidebar={true}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      // Sidebar should not be rendered initially
      expect(screen.queryByTestId('lazy-sidebar')).not.toBeInTheDocument();

      // Open sidebar to trigger lazy loading
      const sidebarToggle = screen.getByTestId('sidebar-toggle');
      fireEvent.click(sidebarToggle);

      expect(screen.getByTestId('lazy-sidebar')).toBeInTheDocument();
    });

    it('memoizes layout calculations', () => {
      const mockCalculateLayout = jest.fn();

      const { rerender } = render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          onLayoutCalculation={mockCalculateLayout}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      expect(mockCalculateLayout).toHaveBeenCalledTimes(1);

      // Re-render with same props
      rerender(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          onLayoutCalculation={mockCalculateLayout}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      // Should not recalculate
      expect(mockCalculateLayout).toHaveBeenCalledTimes(1);
    });
  });

  describe('Custom Breakpoints and Configuration', () => {
    it('supports custom breakpoints', () => {
      const customBreakpoints = {
        mobile: 480,
        tablet: 768,
        desktop: 1200,
        large: 1600
      };

      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          breakpoints={customBreakpoints}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveAttribute('data-breakpoints', JSON.stringify(customBreakpoints));
    });

    it('allows layout behavior customization', () => {
      const layoutConfig = {
        sidebarCollapsedWidth: 60,
        sidebarExpandedWidth: 280,
        animationDuration: 200,
        mobileBreakpoint: 768
      };

      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          config={layoutConfig}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      const sidebar = screen.getByTestId('sidebar-content').closest('[data-testid="sidebar"]');
      expect(sidebar).toHaveStyle('--sidebar-collapsed-width: 60px');
      expect(sidebar).toHaveStyle('--sidebar-expanded-width: 280px');
    });

    it('supports multiple layout modes', () => {
      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          mode="push" // vs 'overlay' or 'reveal'
        >
          <MainContent />
        </ResponsiveLayout>
      );

      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('layout-mode-push');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles missing sidebar gracefully', () => {
      render(
        <ResponsiveLayout>
          <MainContent />
        </ResponsiveLayout>
      );

      expect(screen.getByTestId('main-content')).toBeInTheDocument();
      expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    });

    it('handles invalid breakpoint values', () => {
      const invalidBreakpoints = {
        mobile: -100,
        tablet: 'invalid',
        desktop: null
      };

      render(
        <ResponsiveLayout
          sidebar={<SidebarContent />}
          breakpoints={invalidBreakpoints as any}
        >
          <MainContent />
        </ResponsiveLayout>
      );

      // Should fallback to default breakpoints
      const layout = screen.getByTestId('responsive-layout');
      expect(layout).toHaveClass('layout-desktop'); // Default for 1024px
    });

    it('recovers from resize observer errors', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      // Mock ResizeObserver to throw error
      global.ResizeObserver = jest.fn(() => ({
        observe: jest.fn(() => { throw new Error('ResizeObserver error'); }),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
      }));

      render(
        <ResponsiveLayout sidebar={<SidebarContent />}>
          <MainContent />
        </ResponsiveLayout>
      );

      // Should not crash
      expect(screen.getByTestId('main-content')).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});