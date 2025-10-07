import { renderHook, act } from '@testing-library/react';
import {
  useNavigation,
  useBreadcrumbs,
  useRouteParams,
  useRouteMetadata,
  useNavigationHistory,
  useRoutePermissions,
  useActiveRoute,
  useNavigationAnalytics,
} from '@/utils/navigation/navigation-hooks';

// Mock Next.js router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockForward = jest.fn();
const mockPrefetch = jest.fn();

const mockRouter = {
  pathname: '/dashboard/chatbots/123/edit',
  asPath: '/dashboard/chatbots/123/edit?tab=settings',
  query: { id: '123', tab: 'settings' },
  push: mockPush,
  replace: mockReplace,
  back: mockBack,
  forward: mockForward,
  prefetch: mockPrefetch,
  events: {
    on: jest.fn(),
    off: jest.fn(),
  },
  isReady: true,
};

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// Mock user context for permissions
const mockUser = {
  id: 'user-123',
  role: 'admin',
  permissions: ['read', 'write', 'delete'],
  organizationId: 'org-456',
};

jest.mock('@/contexts/user-context', () => ({
  useUser: () => mockUser,
}));

// Mock analytics service
const mockAnalytics = {
  track: jest.fn(),
  page: jest.fn(),
  identify: jest.fn(),
};

jest.mock('@/services/analytics', () => ({
  analytics: mockAnalytics,
}));

// Mock local storage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('Navigation Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('useNavigation', () => {
    it('provides navigation functions', () => {
      const { result } = renderHook(() => useNavigation());

      expect(result.current.navigate).toBeInstanceOf(Function);
      expect(result.current.replace).toBeInstanceOf(Function);
      expect(result.current.back).toBeInstanceOf(Function);
      expect(result.current.forward).toBeInstanceOf(Function);
      expect(result.current.refresh).toBeInstanceOf(Function);
    });

    it('navigates to specified routes', async () => {
      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        await result.current.navigate('/dashboard/analytics');
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/analytics');
    });

    it('navigates with query parameters', async () => {
      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        await result.current.navigate('/search', { q: 'test', filter: 'recent' });
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/search',
        query: { q: 'test', filter: 'recent' },
      });
    });

    it('handles navigation options', async () => {
      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        await result.current.navigate('/dashboard', {}, { shallow: true, scroll: false });
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard', undefined, {
        shallow: true,
        scroll: false,
      });
    });

    it('replaces current route', async () => {
      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        await result.current.replace('/new-route');
      });

      expect(mockReplace).toHaveBeenCalledWith('/new-route');
    });

    it('handles browser back and forward', () => {
      const { result } = renderHook(() => useNavigation());

      act(() => {
        result.current.back();
      });

      expect(mockBack).toHaveBeenCalled();

      act(() => {
        result.current.forward();
      });

      expect(mockForward).toHaveBeenCalled();
    });

    it('refreshes current page', async () => {
      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockReplace).toHaveBeenCalledWith(mockRouter.asPath);
    });

    it('checks if navigation is in progress', () => {
      const { result } = renderHook(() => useNavigation());

      expect(result.current.isNavigating).toBe(false);

      act(() => {
        result.current.navigate('/test');
      });

      // Navigation state should be tracked
      expect(typeof result.current.isNavigating).toBe('boolean');
    });

    it('prefetches routes', async () => {
      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        await result.current.prefetch('/dashboard/analytics');
      });

      expect(mockPrefetch).toHaveBeenCalledWith('/dashboard/analytics');
    });

    it('handles navigation errors gracefully', async () => {
      mockPush.mockRejectedValueOnce(new Error('Navigation failed'));

      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        try {
          await result.current.navigate('/invalid-route');
        } catch (error) {
          expect(error.message).toBe('Navigation failed');
        }
      });
    });
  });

  describe('useBreadcrumbs', () => {
    it('generates breadcrumbs from current route', () => {
      const { result } = renderHook(() => useBreadcrumbs());

      expect(result.current.breadcrumbs).toEqual([
        expect.objectContaining({
          label: 'Dashboard',
          href: '/dashboard',
          isActive: false,
        }),
        expect.objectContaining({
          label: 'Chatbots',
          href: '/dashboard/chatbots',
          isActive: false,
        }),
        expect.objectContaining({
          label: 'Edit',
          href: '/dashboard/chatbots/123/edit',
          isActive: true,
        }),
      ]);
    });

    it('applies custom breadcrumb configuration', () => {
      const config = {
        '/dashboard/chatbots': {
          label: 'AI Chatbots',
          icon: 'robot',
        },
      };

      const { result } = renderHook(() => useBreadcrumbs(config));

      const chatbotsItem = result.current.breadcrumbs.find(b => b.href === '/dashboard/chatbots');
      expect(chatbotsItem.label).toBe('AI Chatbots');
      expect(chatbotsItem.icon).toBe('robot');
    });

    it('provides breadcrumb navigation functions', async () => {
      const { result } = renderHook(() => useBreadcrumbs());

      await act(async () => {
        await result.current.navigateToBreadcrumb('/dashboard');
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('optimizes breadcrumb length', () => {
      // Mock a deep route
      mockRouter.pathname = '/level1/level2/level3/level4/level5/level6';

      const { result } = renderHook(() => useBreadcrumbs({}, { maxItems: 4 }));

      expect(result.current.breadcrumbs.length).toBeLessThanOrEqual(4);
      expect(result.current.breadcrumbs.some(b => b.isEllipsis)).toBe(true);
    });

    it('handles dynamic breadcrumb titles', () => {
      const dynamicConfig = {
        '/dashboard/chatbots/:id': {
          label: (params) => `Chatbot ${params.id}`,
        },
      };

      const { result } = renderHook(() => useBreadcrumbs(dynamicConfig));

      const dynamicItem = result.current.breadcrumbs.find(b =>
        b.href === '/dashboard/chatbots/123'
      );
      expect(dynamicItem?.label).toBe('Chatbot 123');
    });

    it('updates breadcrumbs on route change', () => {
      const { result, rerender } = renderHook(() => useBreadcrumbs());

      // Change route
      mockRouter.pathname = '/dashboard/analytics';

      rerender();

      expect(result.current.breadcrumbs).toEqual([
        expect.objectContaining({
          label: 'Dashboard',
          href: '/dashboard',
          isActive: false,
        }),
        expect.objectContaining({
          label: 'Analytics',
          href: '/dashboard/analytics',
          isActive: true,
        }),
      ]);
    });
  });

  describe('useRouteParams', () => {
    it('extracts parameters from current route', () => {
      const { result } = renderHook(() => useRouteParams());

      expect(result.current.params).toEqual({
        id: '123',
        tab: 'settings',
      });
    });

    it('provides typed parameter access', () => {
      const { result } = renderHook(() => useRouteParams<{ id: string; tab: string }>());

      expect(result.current.getParam('id')).toBe('123');
      expect(result.current.getParam('tab')).toBe('settings');
      expect(result.current.getParam('nonexistent' as any)).toBeUndefined();
    });

    it('validates parameter types', () => {
      const { result } = renderHook(() => useRouteParams());

      expect(result.current.getNumberParam('id')).toBe(123);
      expect(result.current.getBooleanParam('active')).toBeUndefined();
      expect(result.current.getArrayParam('tags')).toEqual([]);
    });

    it('provides parameter existence checks', () => {
      const { result } = renderHook(() => useRouteParams());

      expect(result.current.hasParam('id')).toBe(true);
      expect(result.current.hasParam('nonexistent')).toBe(false);
    });

    it('updates parameters with navigation', async () => {
      const { result } = renderHook(() => useRouteParams());

      await act(async () => {
        await result.current.updateParams({ tab: 'general', newParam: 'value' });
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: mockRouter.pathname,
        query: { id: '123', tab: 'general', newParam: 'value' },
      });
    });

    it('removes parameters', async () => {
      const { result } = renderHook(() => useRouteParams());

      await act(async () => {
        await result.current.removeParam('tab');
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: mockRouter.pathname,
        query: { id: '123' },
      });
    });

    it('clears all parameters', async () => {
      const { result } = renderHook(() => useRouteParams());

      await act(async () => {
        await result.current.clearParams();
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: mockRouter.pathname,
        query: {},
      });
    });
  });

  describe('useRouteMetadata', () => {
    it('provides current route metadata', () => {
      const { result } = renderHook(() => useRouteMetadata());

      expect(result.current.metadata).toMatchObject({
        pathname: '/dashboard/chatbots/123/edit',
        depth: 4,
        isNested: true,
        hasParameters: true,
      });
    });

    it('identifies route types', () => {
      mockRouter.pathname = '/api/v1/users';

      const { result } = renderHook(() => useRouteMetadata());

      expect(result.current.metadata.isApiRoute).toBe(true);
    });

    it('provides route configuration', () => {
      const config = {
        '/dashboard/chatbots/123/edit': {
          title: 'Edit Chatbot',
          description: 'Edit chatbot configuration',
          permissions: ['chatbot:write'],
        },
      };

      const { result } = renderHook(() => useRouteMetadata(config));

      expect(result.current.metadata.title).toBe('Edit Chatbot');
      expect(result.current.metadata.permissions).toEqual(['chatbot:write']);
    });

    it('calculates route relationships', () => {
      const { result } = renderHook(() => useRouteMetadata());

      expect(result.current.metadata.parentRoute).toBe('/dashboard/chatbots/123');
      expect(result.current.metadata.rootRoute).toBe('/dashboard');
    });

    it('provides route validation', () => {
      const { result } = renderHook(() => useRouteMetadata());

      expect(result.current.isValidRoute).toBe(true);
      expect(result.current.validateRoute('/invalid')).toBe(false);
    });
  });

  describe('useNavigationHistory', () => {
    beforeEach(() => {
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify([
        { path: '/dashboard', timestamp: Date.now() - 10000 },
        { path: '/dashboard/chatbots', timestamp: Date.now() - 5000 },
      ]));
    });

    it('tracks navigation history', () => {
      const { result } = renderHook(() => useNavigationHistory());

      expect(result.current.history).toHaveLength(2);
      expect(result.current.history[0].path).toBe('/dashboard');
    });

    it('provides navigation history functions', () => {
      const { result } = renderHook(() => useNavigationHistory());

      expect(result.current.canGoBack).toBe(true);
      expect(result.current.canGoForward).toBe(false);
    });

    it('navigates to previous route', async () => {
      const { result } = renderHook(() => useNavigationHistory());

      await act(async () => {
        await result.current.goToPrevious();
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots');
    });

    it('clears navigation history', () => {
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.history).toHaveLength(0);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('navigation-history');
    });

    it('limits history size', () => {
      const longHistory = Array.from({ length: 150 }, (_, i) => ({
        path: `/page-${i}`,
        timestamp: Date.now() - i * 1000,
      }));

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(longHistory));

      const { result } = renderHook(() => useNavigationHistory({ maxHistory: 100 }));

      expect(result.current.history.length).toBeLessThanOrEqual(100);
    });

    it('filters history by pattern', () => {
      const { result } = renderHook(() => useNavigationHistory({
        filterPattern: /^\/dashboard/,
      }));

      const dashboardHistory = result.current.getFilteredHistory(/^\/dashboard/);
      expect(dashboardHistory.every(item => item.path.startsWith('/dashboard'))).toBe(true);
    });

    it('provides history statistics', () => {
      const { result } = renderHook(() => useNavigationHistory());

      expect(result.current.getHistoryStats()).toMatchObject({
        totalVisits: expect.any(Number),
        uniquePages: expect.any(Number),
        averageSessionLength: expect.any(Number),
        mostVisitedPages: expect.any(Array),
      });
    });
  });

  describe('useRoutePermissions', () => {
    it('checks current route permissions', () => {
      const permissions = {
        '/dashboard/chatbots/123/edit': ['chatbot:write', 'chatbot:read'],
      };

      const { result } = renderHook(() => useRoutePermissions(permissions));

      expect(result.current.hasPermission('chatbot:write')).toBe(true);
      expect(result.current.hasPermission('chatbot:delete')).toBe(false);
    });

    it('checks multiple permissions', () => {
      const permissions = {
        '/dashboard/chatbots/123/edit': ['chatbot:write', 'chatbot:read'],
      };

      const { result } = renderHook(() => useRoutePermissions(permissions));

      expect(result.current.hasAllPermissions(['chatbot:read', 'chatbot:write'])).toBe(true);
      expect(result.current.hasAnyPermissions(['chatbot:delete', 'chatbot:read'])).toBe(true);
      expect(result.current.hasAllPermissions(['chatbot:delete', 'chatbot:admin'])).toBe(false);
    });

    it('handles role-based permissions', () => {
      const permissions = {
        '/dashboard/chatbots/123/edit': {
          roles: ['admin', 'editor'],
          permissions: ['chatbot:write'],
        },
      };

      const { result } = renderHook(() => useRoutePermissions(permissions));

      expect(result.current.hasRole('admin')).toBe(true);
      expect(result.current.hasRole('viewer')).toBe(false);
    });

    it('checks route accessibility', () => {
      const permissions = {
        '/dashboard/chatbots/123/edit': ['chatbot:write'],
        '/admin/system': ['admin:system'],
      };

      const { result } = renderHook(() => useRoutePermissions(permissions));

      expect(result.current.canAccessRoute('/dashboard/chatbots/123/edit')).toBe(true);
      expect(result.current.canAccessRoute('/admin/system')).toBe(false);
    });

    it('provides permission-filtered navigation', () => {
      const permissions = {
        '/dashboard': ['dashboard:read'],
        '/admin': ['admin:access'],
      };

      const { result } = renderHook(() => useRoutePermissions(permissions));

      const accessibleRoutes = result.current.getAccessibleRoutes([
        '/dashboard',
        '/admin',
        '/public',
      ]);

      expect(accessibleRoutes).toContain('/dashboard');
      expect(accessibleRoutes).not.toContain('/admin');
    });
  });

  describe('useActiveRoute', () => {
    it('identifies active routes', () => {
      const { result } = renderHook(() => useActiveRoute());

      expect(result.current.isActive('/dashboard/chatbots/123/edit')).toBe(true);
      expect(result.current.isActive('/dashboard', { exact: false })).toBe(true);
      expect(result.current.isActive('/different')).toBe(false);
    });

    it('handles pattern matching', () => {
      const { result } = renderHook(() => useActiveRoute());

      expect(result.current.isActivePattern('/dashboard/*')).toBe(true);
      expect(result.current.isActivePattern('/admin/*')).toBe(false);
    });

    it('provides active route metadata', () => {
      const { result } = renderHook(() => useActiveRoute());

      expect(result.current.activeRoute).toBe('/dashboard/chatbots/123/edit');
      expect(result.current.activeSection).toBe('dashboard');
      expect(result.current.activeDepth).toBe(4);
    });

    it('tracks route changes', () => {
      const mockOnChange = jest.fn();
      renderHook(() => useActiveRoute({ onChange: mockOnChange }));

      // Simulate route change
      mockRouter.pathname = '/dashboard/analytics';

      expect(mockOnChange).toHaveBeenCalledWith({
        from: '/dashboard/chatbots/123/edit',
        to: '/dashboard/analytics',
      });
    });

    it('provides route comparison utilities', () => {
      const { result } = renderHook(() => useActiveRoute());

      expect(result.current.isSameSection('/dashboard/analytics')).toBe(true);
      expect(result.current.isSameSection('/admin/users')).toBe(false);
      expect(result.current.isChildRoute('/dashboard/chatbots/123')).toBe(true);
      expect(result.current.isParentRoute('/dashboard/chatbots/123/edit/advanced')).toBe(true);
    });
  });

  describe('useNavigationAnalytics', () => {
    it('tracks page views', () => {
      renderHook(() => useNavigationAnalytics());

      expect(mockAnalytics.page).toHaveBeenCalledWith({
        path: '/dashboard/chatbots/123/edit',
        title: expect.any(String),
        timestamp: expect.any(Number),
      });
    });

    it('tracks navigation events', async () => {
      const { result } = renderHook(() => useNavigationAnalytics());

      await act(async () => {
        result.current.trackNavigation({
          from: '/dashboard',
          to: '/dashboard/chatbots',
          method: 'click',
        });
      });

      expect(mockAnalytics.track).toHaveBeenCalledWith('navigation', {
        from: '/dashboard',
        to: '/dashboard/chatbots',
        method: 'click',
        timestamp: expect.any(Number),
      });
    });

    it('tracks user engagement', () => {
      const { result } = renderHook(() => useNavigationAnalytics());

      act(() => {
        result.current.trackEngagement({
          action: 'click',
          element: 'breadcrumb',
          value: '/dashboard',
        });
      });

      expect(mockAnalytics.track).toHaveBeenCalledWith('engagement', {
        action: 'click',
        element: 'breadcrumb',
        value: '/dashboard',
        path: mockRouter.pathname,
      });
    });

    it('measures performance metrics', () => {
      const { result } = renderHook(() => useNavigationAnalytics());

      act(() => {
        result.current.trackPerformance({
          metric: 'route_change_duration',
          value: 150,
          route: '/dashboard/analytics',
        });
      });

      expect(mockAnalytics.track).toHaveBeenCalledWith('performance', {
        metric: 'route_change_duration',
        value: 150,
        route: '/dashboard/analytics',
      });
    });

    it('provides analytics session management', () => {
      const { result } = renderHook(() => useNavigationAnalytics());

      expect(result.current.sessionId).toBeDefined();
      expect(result.current.sessionStartTime).toBeInstanceOf(Date);

      act(() => {
        result.current.endSession();
      });

      expect(mockAnalytics.track).toHaveBeenCalledWith('session_end', {
        sessionId: result.current.sessionId,
        duration: expect.any(Number),
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles router not ready state', () => {
      mockRouter.isReady = false;

      const { result } = renderHook(() => useNavigation());

      expect(result.current.isReady).toBe(false);
    });

    it('handles navigation failures gracefully', async () => {
      mockPush.mockRejectedValueOnce(new Error('Navigation failed'));

      const { result } = renderHook(() => useNavigation());

      await act(async () => {
        try {
          await result.current.navigate('/invalid');
        } catch (error) {
          expect(error.message).toBe('Navigation failed');
        }
      });

      expect(result.current.lastError).toBeTruthy();
    });

    it('handles localStorage unavailability', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.addToHistory('/new-route');
      });

      // Should not crash
      expect(result.current.history).toBeDefined();
    });

    it('handles malformed stored data', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid-json');

      const { result } = renderHook(() => useNavigationHistory());

      expect(result.current.history).toEqual([]);
    });

    it('handles missing user context', () => {
      jest.mocked(require('@/contexts/user-context').useUser).mockReturnValue(null);

      const { result } = renderHook(() => useRoutePermissions({}));

      expect(result.current.hasPermission('any')).toBe(false);
    });
  });
});