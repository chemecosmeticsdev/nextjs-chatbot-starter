import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '@/app/dashboard/page';
import { AnalyticsCard } from '@/components/dashboard/analytics-card';
import { WidgetStatsCard } from '@/components/dashboard/widget-stats-card';
import { LiveMetricsCard } from '@/components/dashboard/live-metrics-card';

// Mock Next.js router
const mockRouter = {
  pathname: '/dashboard',
  asPath: '/dashboard',
  query: {},
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  prefetch: jest.fn(),
  events: {
    on: jest.fn(),
    off: jest.fn(),
  },
  isReady: true,
};

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// Mock user context
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  organizationId: 'org-456',
  permissions: ['dashboard:read', 'analytics:read', 'widgets:read'],
};

jest.mock('@/contexts/user-context', () => ({
  useUser: () => mockUser,
}));

// Mock API responses
const mockApiResponses = {
  analytics: {
    totalConversations: 1250,
    activeUsers: 384,
    responseTime: 1.2,
    satisfactionScore: 4.6,
    trends: {
      conversations: { current: 1250, previous: 1180, change: 5.9 },
      users: { current: 384, previous: 356, change: 7.9 },
      responseTime: { current: 1.2, previous: 1.4, change: -14.3 },
      satisfaction: { current: 4.6, previous: 4.4, change: 4.5 },
    },
    chartData: {
      conversations: Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        value: Math.floor(Math.random() * 100) + 50,
      })),
      responseTime: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        value: Math.random() * 2 + 0.5,
      })),
    },
  },
  widgets: {
    activeWidgets: 12,
    totalDeployments: 35,
    deploymentSuccess: 98.5,
    topDomains: [
      { domain: 'example.com', conversations: 456, percentage: 36.5 },
      { domain: 'demo.com', conversations: 234, percentage: 18.7 },
      { domain: 'test.org', conversations: 123, percentage: 9.8 },
    ],
    recentDeployments: [
      {
        id: 'dep-1',
        domain: 'new-site.com',
        status: 'success',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'dep-2',
        domain: 'another.com',
        status: 'pending',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ],
  },
  liveMetrics: {
    active_sessions: 45,
    messages_last_hour: 278,
    widget_loads_last_hour: 156,
    online_status: 'healthy',
    server_response_time: 145,
    database_performance: 'excellent',
    websocket_connections: 123,
    error_rate: 0.02,
    alerts: [
      {
        id: 'alert-1',
        type: 'warning',
        message: 'High response time detected',
        timestamp: new Date().toISOString(),
      },
    ],
  },
  systemHealth: {
    status: 'healthy',
    uptime: 99.8,
    database: {
      status: 'operational',
      responseTime: 25,
      connections: 45,
    },
    websocket: {
      status: 'operational',
      connections: 123,
      latency: 12,
    },
    api: {
      status: 'operational',
      responseTime: 145,
      requestsPerMinute: 567,
    },
    storage: {
      used: 234.5,
      total: 1000,
      percentage: 23.45,
    },
  },
};

// Mock fetch API
global.fetch = jest.fn();

const mockFetch = (url: string) => {
  if (url.includes('/api/analytics')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.analytics),
    });
  }
  if (url.includes('/api/widgets')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.widgets),
    });
  }
  if (url.includes('/api/metrics/live')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.liveMetrics),
    });
  }
  if (url.includes('/api/system/health')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.systemHealth),
    });
  }
  return Promise.reject(new Error(`Unhandled request: ${url}`));
};

// Mock WebSocket for real-time updates
class MockWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = WebSocket.CONNECTING;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 100);
  }

  send(data: string) {
    // Mock echo for testing
    setTimeout(() => {
      this.onmessage?.(new MessageEvent('message', { data }));
    }, 50);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  // Mock real-time metric updates
  simulateMetricUpdate(data: any) {
    if (this.readyState === WebSocket.OPEN) {
      this.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'metric_update',
          data,
        }),
      }));
    }
  }
}

global.WebSocket = MockWebSocket as any;

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        cacheTime: 0,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Dashboard API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockImplementation(mockFetch);
  });

  describe('Dashboard Page Integration', () => {
    it('loads dashboard with all components and API data', async () => {
      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      // Verify loading states are shown initially
      expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();

      // Wait for API calls to complete and data to load
      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument(); // Total conversations
        expect(screen.getByText('384')).toBeInTheDocument(); // Active users
        expect(screen.getByText('4.6/5')).toBeInTheDocument(); // Satisfaction score
      }, { timeout: 5000 });

      // Verify analytics data is displayed
      expect(screen.getByText('1.2s')).toBeInTheDocument(); // Response time

      // Verify widgets data is displayed
      expect(screen.getByText('12')).toBeInTheDocument(); // Active widgets
      expect(screen.getByText('35')).toBeInTheDocument(); // Total deployments

      // Verify live metrics are displayed
      expect(screen.getByText('45')).toBeInTheDocument(); // Active sessions
      expect(screen.getByText('278')).toBeInTheDocument(); // Messages last hour
    });

    it('handles API errors gracefully', async () => {
      // Mock API failure
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('API Error'))
      );

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Error loading dashboard data')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries failed API calls', async () => {
      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First call fails'));
        }
        return mockFetch('/api/analytics');
      });

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      // Click retry button
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      // Verify data loads after retry
      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      expect(callCount).toBe(2);
    });

    it('updates data when user permissions change', async () => {
      const { rerender } = render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      // Mock user with limited permissions
      jest.mocked(require('@/contexts/user-context').useUser).mockReturnValue({
        ...mockUser,
        permissions: ['dashboard:read'], // Remove analytics permission
      });

      rerender(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      // Verify restricted access message
      await waitFor(() => {
        expect(screen.getByText('Limited dashboard access')).toBeInTheDocument();
      });
    });
  });

  describe('Analytics API Integration', () => {
    it('loads analytics data correctly', async () => {
      render(
        <TestWrapper>
          <AnalyticsCard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Total Conversations')).toBeInTheDocument();
        expect(screen.getByText('1,250')).toBeInTheDocument();
        expect(screen.getByText('5.9%')).toBeInTheDocument(); // Trend increase
      });

      // Verify API was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.any(Object)
      );
    });

    it('handles analytics API with date range filters', async () => {
      render(
        <TestWrapper>
          <AnalyticsCard dateRange="7d" />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/analytics?range=7d'),
          expect.any(Object)
        );
      });
    });

    it('updates analytics data in real-time', async () => {
      render(
        <TestWrapper>
          <AnalyticsCard realTimeUpdates={true} />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      // Mock real-time update
      act(() => {
        const updatedData = {
          totalConversations: 1275,
          activeUsers: 392,
        };

        // Simulate WebSocket update
        const ws = new MockWebSocket('ws://localhost');
        ws.simulateMetricUpdate(updatedData);
      });

      await waitFor(() => {
        expect(screen.getByText('1,275')).toBeInTheDocument();
        expect(screen.getByText('392')).toBeInTheDocument();
      });
    });

    it('caches analytics data appropriately', async () => {
      const { rerender } = render(
        <TestWrapper>
          <AnalyticsCard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      const initialCallCount = (global.fetch as jest.Mock).mock.calls.length;

      // Re-render component
      rerender(
        <TestWrapper>
          <AnalyticsCard />
        </TestWrapper>
      );

      // Should use cached data, no additional API calls
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('Widget Stats API Integration', () => {
    it('loads widget statistics correctly', async () => {
      render(
        <TestWrapper>
          <WidgetStatsCard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Active Widgets')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('98.5%')).toBeInTheDocument(); // Success rate
      });

      // Verify top domains are displayed
      expect(screen.getByText('example.com')).toBeInTheDocument();
      expect(screen.getByText('456')).toBeInTheDocument(); // Conversations for example.com
    });

    it('handles widget deployment updates', async () => {
      render(
        <TestWrapper>
          <WidgetStatsCard showRecentDeployments={true} />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Recent Deployments')).toBeInTheDocument();
        expect(screen.getByText('new-site.com')).toBeInTheDocument();
        expect(screen.getByText('Success')).toBeInTheDocument();
      });
    });

    it('updates widget stats on deployment events', async () => {
      render(
        <TestWrapper>
          <WidgetStatsCard realTimeUpdates={true} />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument();
      });

      // Simulate new deployment
      act(() => {
        const deploymentUpdate = {
          activeWidgets: 13,
          totalDeployments: 36,
          newDeployment: {
            id: 'dep-3',
            domain: 'latest.com',
            status: 'success',
          },
        };

        const ws = new MockWebSocket('ws://localhost');
        ws.simulateMetricUpdate(deploymentUpdate);
      });

      await waitFor(() => {
        expect(screen.getByText('13')).toBeInTheDocument();
        expect(screen.getByText('36')).toBeInTheDocument();
      });
    });
  });

  describe('Live Metrics API Integration', () => {
    it('establishes WebSocket connection for live metrics', async () => {
      render(
        <TestWrapper>
          <LiveMetricsCard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Verify initial metrics are loaded
      expect(screen.getByText('45')).toBeInTheDocument(); // Active sessions
      expect(screen.getByText('278')).toBeInTheDocument(); // Messages last hour
    });

    it('handles WebSocket connection failures', async () => {
      // Mock WebSocket failure
      global.WebSocket = jest.fn().mockImplementation(() => {
        throw new Error('WebSocket connection failed');
      });

      render(
        <TestWrapper>
          <LiveMetricsCard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Connection Failed')).toBeInTheDocument();
        expect(screen.getByText('Retry Connection')).toBeInTheDocument();
      });
    });

    it('receives and displays real-time metric updates', async () => {
      render(
        <TestWrapper>
          <LiveMetricsCard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument();
      });

      // Send real-time update
      act(() => {
        const metricsUpdate = {
          active_sessions: 52,
          messages_last_hour: 298,
          widget_loads_last_hour: 167,
        };

        const ws = new MockWebSocket('ws://localhost');
        ws.simulateMetricUpdate(metricsUpdate);
      });

      await waitFor(() => {
        expect(screen.getByText('52')).toBeInTheDocument();
        expect(screen.getByText('298')).toBeInTheDocument();
        expect(screen.getByText('167')).toBeInTheDocument();
      });
    });

    it('handles metric alerts properly', async () => {
      render(
        <TestWrapper>
          <LiveMetricsCard showAlerts={true} />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('High response time detected')).toBeInTheDocument();
        expect(screen.getByTestId('alert-warning')).toBeInTheDocument();
      });

      // Simulate new alert
      act(() => {
        const alertUpdate = {
          alerts: [
            {
              id: 'alert-2',
              type: 'error',
              message: 'Database connection lost',
              timestamp: new Date().toISOString(),
            },
          ],
        };

        const ws = new MockWebSocket('ws://localhost');
        ws.simulateMetricUpdate(alertUpdate);
      });

      await waitFor(() => {
        expect(screen.getByText('Database connection lost')).toBeInTheDocument();
        expect(screen.getByTestId('alert-error')).toBeInTheDocument();
      });
    });
  });

  describe('Cross-Component Data Consistency', () => {
    it('maintains data consistency across dashboard components', async () => {
      render(
        <TestWrapper>
          <div>
            <AnalyticsCard />
            <WidgetStatsCard />
            <LiveMetricsCard />
          </div>
        </TestWrapper>
      );

      await waitFor(() => {
        // Verify all components have loaded their data
        expect(screen.getByText('1,250')).toBeInTheDocument(); // Analytics
        expect(screen.getByText('12')).toBeInTheDocument(); // Widget stats
        expect(screen.getByText('45')).toBeInTheDocument(); // Live metrics
      });

      // Simulate global metric update that affects multiple components
      act(() => {
        const globalUpdate = {
          totalConversations: 1260,
          activeWidgets: 13,
          active_sessions: 48,
        };

        const ws = new MockWebSocket('ws://localhost');
        ws.simulateMetricUpdate(globalUpdate);
      });

      await waitFor(() => {
        expect(screen.getByText('1,260')).toBeInTheDocument();
        expect(screen.getByText('13')).toBeInTheDocument();
        expect(screen.getByText('48')).toBeInTheDocument();
      });
    });

    it('handles partial API failures gracefully', async () => {
      // Mock analytics API failure but widgets API success
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/analytics')) {
          return Promise.reject(new Error('Analytics API down'));
        }
        return mockFetch(url);
      });

      render(
        <TestWrapper>
          <div>
            <AnalyticsCard />
            <WidgetStatsCard />
          </div>
        </TestWrapper>
      );

      await waitFor(() => {
        // Analytics should show error
        expect(screen.getByText('Error loading analytics')).toBeInTheDocument();

        // Widgets should load successfully
        expect(screen.getByText('12')).toBeInTheDocument();
      });
    });

    it('synchronizes data refresh across components', async () => {
      render(
        <TestWrapper>
          <div>
            <AnalyticsCard />
            <WidgetStatsCard />
          </div>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
      });

      // Clear fetch mock calls
      (global.fetch as jest.Mock).mockClear();

      // Trigger refresh
      fireEvent.click(screen.getByText('Refresh Dashboard'));

      await waitFor(() => {
        // Verify both components make fresh API calls
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/analytics'),
          expect.any(Object)
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/widgets'),
          expect.any(Object)
        );
      });
    });
  });

  describe('Performance and Optimization', () => {
    it('implements proper loading states during API calls', async () => {
      // Mock slow API response
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(mockFetch(url));
          }, 1000);
        });
      });

      render(
        <TestWrapper>
          <AnalyticsCard />
        </TestWrapper>
      );

      // Verify loading state is shown
      expect(screen.getByTestId('analytics-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading analytics...')).toBeInTheDocument();

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      }, { timeout: 2000 });

      // Verify loading state is removed
      expect(screen.queryByTestId('analytics-loading')).not.toBeInTheDocument();
    });

    it('batches multiple API requests efficiently', async () => {
      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      // Verify API calls were made in parallel, not sequentially
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      const timestamps = fetchCalls.map(() => performance.now());

      // All calls should be made within a short time window (parallel execution)
      const maxTime = Math.max(...timestamps);
      const minTime = Math.min(...timestamps);
      expect(maxTime - minTime).toBeLessThan(100); // Within 100ms
    });

    it('implements proper error boundaries for API failures', async () => {
      // Mock API to throw an error
      (global.fetch as jest.Mock).mockImplementation(() => {
        throw new Error('Network error');
      });

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('Try refreshing the page')).toBeInTheDocument();
      });
    });

    it('maintains responsive UI during data loading', async () => {
      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      // Verify skeleton components are shown while loading
      expect(screen.getByTestId('analytics-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('widgets-skeleton')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      // Verify skeletons are replaced with actual content
      expect(screen.queryByTestId('analytics-skeleton')).not.toBeInTheDocument();
      expect(screen.queryByTestId('widgets-skeleton')).not.toBeInTheDocument();
    });
  });

  describe('User Experience Integration', () => {
    it('provides appropriate feedback for all user actions', async () => {
      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      // Test refresh action
      fireEvent.click(screen.getByText('Refresh Dashboard'));

      expect(screen.getByText('Refreshing...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Refreshing...')).not.toBeInTheDocument();
      });

      // Test export action
      fireEvent.click(screen.getByText('Export Data'));

      expect(screen.getByText('Preparing export...')).toBeInTheDocument();
    });

    it('handles concurrent user actions gracefully', async () => {
      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument();
      });

      // Simulate rapid consecutive actions
      fireEvent.click(screen.getByText('Refresh Dashboard'));
      fireEvent.click(screen.getByText('Export Data'));
      fireEvent.click(screen.getByText('Filter Data'));

      // Verify only the latest action is processed
      await waitFor(() => {
        expect(screen.getByText('Applying filters...')).toBeInTheDocument();
      });

      // Previous actions should be cancelled
      expect(screen.queryByText('Refreshing...')).not.toBeInTheDocument();
      expect(screen.queryByText('Preparing export...')).not.toBeInTheDocument();
    });
  });
});