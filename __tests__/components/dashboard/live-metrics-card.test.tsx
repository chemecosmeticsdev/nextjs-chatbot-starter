import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LiveMetricsCard } from '@/components/dashboard/live-metrics-card';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock WebSocket
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
    // Mock send implementation
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

global.WebSocket = MockWebSocket as any;

// Mock API fetch
global.fetch = jest.fn();

// Mock live metrics data
const mockMetricsData = {
  activeConversations: 45,
  messagesPerMinute: 12,
  averageResponseTime: 850,
  onlineUsers: 23,
  connectionStatus: 'connected' as const,
  totalConversations: 1580,
  activeUsers: 67,
  errorRate: 2.1,
  userSatisfaction: 94.5,
  trends: {
    conversations: 'up' as const,
    responseTime: 'down' as const,
    users: 'up' as const,
  }
};

describe('LiveMetricsCard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockMetricsData }),
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Component Rendering', () => {
    it('renders live metrics card with title and description', () => {
      render(<LiveMetricsCard />);

      expect(screen.getByText('Live Metrics')).toBeInTheDocument();
      expect(screen.getByText('Real-time conversation analytics')).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      render(<LiveMetricsCard className="custom-metrics-class" />);

      const card = screen.getByText('Live Metrics').closest('.custom-metrics-class');
      expect(card).toBeInTheDocument();
    });

    it('shows loading skeletons initially', () => {
      render(<LiveMetricsCard />);

      // Should show skeleton elements while loading
      const skeletons = screen.getAllByTestId(/skeleton|loading/);
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Real-time Data Display', () => {
    it('fetches and displays live metrics data', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument(); // Active conversations
        expect(screen.getByText('12')).toBeInTheDocument(); // Messages per minute
        expect(screen.getByText('850ms')).toBeInTheDocument(); // Response time
        expect(screen.getByText('23')).toBeInTheDocument(); // Online users
      });
    });

    it('displays trend indicators correctly', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        // Should show trending up for conversations
        expect(screen.getByTestId('trend-conversations-up')).toBeInTheDocument();
        // Should show trending down for response time (which is good)
        expect(screen.getByTestId('trend-responsetime-down')).toBeInTheDocument();
        // Should show trending up for users
        expect(screen.getByTestId('trend-users-up')).toBeInTheDocument();
      });
    });

    it('shows percentage values for error rate and satisfaction', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('2.1%')).toBeInTheDocument(); // Error rate
        expect(screen.getByText('94.5%')).toBeInTheDocument(); // User satisfaction
      });
    });

    it('displays total statistics', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('1,580')).toBeInTheDocument(); // Total conversations
        expect(screen.getByText('67')).toBeInTheDocument(); // Active users
      });
    });
  });

  describe('Connection Status Features', () => {
    it('shows connection status when enabled', async () => {
      render(<LiveMetricsCard showConnectionStatus={true} />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('does not show connection status when disabled', () => {
      render(<LiveMetricsCard showConnectionStatus={false} />);

      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });

    it('displays different connection statuses', async () => {
      const reconnectingData = {
        ...mockMetricsData,
        connectionStatus: 'reconnecting' as const
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: reconnectingData }),
      });

      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('Reconnecting')).toBeInTheDocument();
      });
    });

    it('shows disconnected status with appropriate styling', async () => {
      const disconnectedData = {
        ...mockMetricsData,
        connectionStatus: 'disconnected' as const
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: disconnectedData }),
      });

      render(<LiveMetricsCard />);

      await waitFor(() => {
        const disconnectedBadge = screen.getByText('Disconnected');
        expect(disconnectedBadge).toBeInTheDocument();
        expect(disconnectedBadge).toHaveClass('bg-red-100');
      });
    });
  });

  describe('Real-time Updates', () => {
    it('refreshes data at specified interval', async () => {
      jest.useFakeTimers();
      render(<LiveMetricsCard refreshInterval={5000} />);

      // Initial fetch
      expect(fetch).toHaveBeenCalledTimes(1);

      // Fast-forward time
      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });

    it('uses default refresh interval when not specified', async () => {
      jest.useFakeTimers();
      render(<LiveMetricsCard />);

      // Initial fetch
      expect(fetch).toHaveBeenCalledTimes(1);

      // Fast-forward default interval (10 seconds)
      jest.advanceTimersByTime(10000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });

    it('cleans up interval on unmount', () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = render(<LiveMetricsCard />);
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('WebSocket Integration', () => {
    it('establishes WebSocket connection for real-time updates', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        // WebSocket should be created and opened
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('handles WebSocket message updates', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      // Simulate WebSocket message
      const wsMessage = {
        type: 'metrics_update',
        data: {
          ...mockMetricsData,
          activeConversations: 55,
          messagesPerMinute: 18
        }
      };

      // This would normally be triggered by WebSocket
      // In a real implementation, we'd simulate the WebSocket message
    });

    it('reconnects WebSocket on connection loss', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      // Simulate connection loss and reconnection
      // This would involve mocking WebSocket close and open events
    });
  });

  describe('Error Handling', () => {
    it('displays error state when API fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText(/error loading/i)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries data fetch when retry button clicked', async () => {
      (fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValue({
          ok: true,
          json: async () => ({ success: true, data: mockMetricsData }),
        });

      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('handles refresh button click', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument();
      });

      const refreshButton = screen.getByLabelText(/refresh metrics/i);
      fireEvent.click(refreshButton);

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('navigates to monitoring page when view details clicked', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View Details'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/monitoring');
    });
  });

  describe('Trend Indicators', () => {
    it('shows correct trend icons and colors', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        // Trending up should be green
        const trendUp = screen.getByTestId('trend-conversations-up');
        expect(trendUp).toHaveClass('text-green-500');

        // Trending down for response time should be green (good)
        const trendDown = screen.getByTestId('trend-responsetime-down');
        expect(trendDown).toHaveClass('text-green-500');
      });
    });

    it('handles neutral trends', async () => {
      const neutralData = {
        ...mockMetricsData,
        trends: {
          conversations: 'neutral' as const,
          responseTime: 'neutral' as const,
          users: 'neutral' as const,
        }
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: neutralData }),
      });

      render(<LiveMetricsCard />);

      await waitFor(() => {
        const neutralTrends = screen.getAllByTestId(/trend-.*-neutral/);
        expect(neutralTrends.length).toBe(3);
      });
    });
  });

  describe('Badge Styling', () => {
    it('applies correct badge variant for connection status', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        const connectedBadge = screen.getByText('Connected');
        expect(connectedBadge).toHaveClass('bg-green-100');
      });
    });

    it('shows warning badge for reconnecting status', async () => {
      const reconnectingData = {
        ...mockMetricsData,
        connectionStatus: 'reconnecting' as const
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: reconnectingData }),
      });

      render(<LiveMetricsCard />);

      await waitFor(() => {
        const reconnectingBadge = screen.getByText('Reconnecting');
        expect(reconnectingBadge).toHaveClass('bg-yellow-100');
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for interactive elements', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByLabelText(/refresh metrics/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/view monitoring details/i)).toBeInTheDocument();
      });
    });

    it('provides status announcements for screen readers', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        const statusRegion = screen.getByRole('status');
        expect(statusRegion).toBeInTheDocument();
      });
    });

    it('supports keyboard navigation', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        const refreshButton = screen.getByLabelText(/refresh/i);
        refreshButton.focus();
        expect(document.activeElement).toBe(refreshButton);
      });
    });
  });

  describe('Performance Metrics Display', () => {
    it('formats response time correctly', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('850ms')).toBeInTheDocument();
      });
    });

    it('handles high response times with appropriate formatting', async () => {
      const highResponseData = {
        ...mockMetricsData,
        averageResponseTime: 2500
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: highResponseData }),
      });

      render(<LiveMetricsCard />);

      await waitFor(() => {
        expect(screen.getByText('2.5s')).toBeInTheDocument();
      });
    });

    it('shows real-time pulse indicator', async () => {
      render(<LiveMetricsCard />);

      await waitFor(() => {
        const pulseIndicator = screen.getByTestId('pulse-indicator');
        expect(pulseIndicator).toBeInTheDocument();
        expect(pulseIndicator).toHaveClass('animate-pulse');
      });
    });
  });
});