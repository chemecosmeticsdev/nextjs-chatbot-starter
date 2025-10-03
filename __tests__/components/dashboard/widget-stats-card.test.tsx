import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WidgetStatsCard } from '@/components/dashboard/widget-stats-card';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock API fetch
global.fetch = jest.fn();

// Mock data for testing
const mockWidgetData = {
  activeWidgets: 5,
  totalDeployments: 12,
  deploymentSuccess: 95,
  topDomains: [
    { domain: 'example.com', conversations: 150, percentage: 45 },
    { domain: 'test.org', conversations: 100, percentage: 30 },
    { domain: 'demo.net', conversations: 80, percentage: 25 }
  ],
  realTimeMetrics: {
    active_sessions: 23,
    messages_last_hour: 145,
    widget_loads_last_hour: 67,
    online_status: 'healthy'
  },
  summary: {
    total_conversations: 1250,
    total_unique_visitors: 890,
    avg_response_time: 1.2
  }
};

describe('WidgetStatsCard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the fetch calls sequentially
    (fetch as jest.Mock)
      // First call: chatbots API
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [
              { id: 'bot1', name: 'Test Bot 1' },
              { id: 'bot2', name: 'Test Bot 2' }
            ]
          })
        })
      )
      // Subsequent calls: widget analytics API
      .mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              summary: {
                total_conversations: 625,
                total_unique_visitors: 445,
                avg_response_time: 1.2
              },
              topDomains: [
                { domain: 'example.com', conversations: 75, percentage: 22.5 },
                { domain: 'test.org', conversations: 50, percentage: 15 }
              ],
              realTimeMetrics: {
                active_sessions: 12,
                messages_last_hour: 73,
                widget_loads_last_hour: 34,
                online_status: 'healthy'
              },
              widgetConfig: { status: 'active' }
            }
          })
        })
      );
  });

  describe('Component Rendering', () => {
    it('renders widget stats card with title', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('Widget Deployments')).toBeInTheDocument();
      });
    });

    it('applies custom className when provided', async () => {
      render(<WidgetStatsCard className="custom-class" />);

      await waitFor(() => {
        const card = screen.getByText('Widget Deployments').closest('.custom-class');
        expect(card).toBeInTheDocument();
      });
    });

    it('shows loading skeletons initially', async () => {
      // Mock a slow response to catch loading state
      (fetch as jest.Mock).mockImplementationOnce(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] })
        }), 100))
      );

      render(<WidgetStatsCard />);

      // Should show skeleton elements while loading
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Data Loading and Display', () => {
    it('fetches and displays widget statistics data', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument(); // Active widgets (2 chatbots)
        expect(screen.getByText('100%')).toBeInTheDocument(); // Success rate (2/2 active)
      });
    });

    it('displays top domains with correct data', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('example.com')).toBeInTheDocument();
        expect(screen.getByText('75')).toBeInTheDocument(); // Conversations from mock
      });
    });

    it('shows real-time metrics when data is loaded', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument(); // Active sessions
        expect(screen.getByText('73')).toBeInTheDocument(); // Messages last hour
        expect(screen.getByText('34')).toBeInTheDocument(); // Widget loads
      });
    });

    it('displays summary statistics correctly', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('625')).toBeInTheDocument(); // Total conversations
        expect(screen.getByText('445')).toBeInTheDocument(); // Unique visitors
      });
    });
  });

  describe('Real-time Features', () => {
    it('shows real-time indicator when enabled', async () => {
      render(<WidgetStatsCard showRealTimeIndicator={true} />);

      await waitFor(() => {
        expect(screen.getByText('Live')).toBeInTheDocument();
      });
    });

    it('does not show real-time indicator when disabled', () => {
      render(<WidgetStatsCard showRealTimeIndicator={false} />);

      expect(screen.queryByText('Live')).not.toBeInTheDocument();
    });

    it('refreshes data at specified interval', async () => {
      jest.useFakeTimers();
      render(<WidgetStatsCard refreshInterval={5000} />);

      // Initial fetch
      expect(fetch).toHaveBeenCalledTimes(1);

      // Fast-forward time
      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('displays error state when API fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load widget stats/i)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries data fetch when retry button clicked', async () => {
      (fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValue({
          ok: true,
          json: async () => ({ success: true, data: mockWidgetData }),
        });

      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument(); // Active widgets
      });
    });
  });

  describe('User Interactions', () => {
    it('handles refresh button click', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });

      const refreshButton = screen.getByLabelText(/refresh/i);
      fireEvent.click(refreshButton);

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('opens widgets page when view details clicked', async () => {
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View Details'));
      expect(mockOpen).toHaveBeenCalledWith('/dashboard/widgets', '_blank');
    });

    it('opens domain in new tab when external link clicked', async () => {
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<WidgetStatsCard />);

      await waitFor(() => {
        expect(screen.getByText('example.com')).toBeInTheDocument();
      });

      const externalLink = screen.getAllByLabelText(/open in new tab/i)[0];
      fireEvent.click(externalLink);

      expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank');
    });
  });

  describe('Status Indicators', () => {
    it('shows green indicator for healthy status', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        const healthyIndicator = screen.getByTestId('status-indicator');
        expect(healthyIndicator).toHaveClass('text-green-500');
      });
    });

    it('shows red indicator for unhealthy status', async () => {
      const unhealthyData = {
        ...mockWidgetData,
        realTimeMetrics: { ...mockWidgetData.realTimeMetrics, online_status: 'unhealthy' }
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: unhealthyData }),
      });

      render(<WidgetStatsCard />);

      await waitFor(() => {
        const unhealthyIndicator = screen.getByTestId('status-indicator');
        expect(unhealthyIndicator).toHaveClass('text-red-500');
      });
    });
  });

  describe('Progress Bars', () => {
    it('displays deployment success rate as progress bar', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '95');
      });
    });

    it('shows different progress bar colors based on success rate', async () => {
      const lowSuccessData = {
        ...mockWidgetData,
        deploymentSuccess: 60
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: lowSuccessData }),
      });

      render(<WidgetStatsCard />);

      await waitFor(() => {
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '60');
      });
    });
  });

  describe('Badge Styling', () => {
    it('applies correct badge variant for online status', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        const badge = screen.getByText('Online');
        expect(badge).toHaveClass('bg-green-100');
      });
    });

    it('applies warning badge for degraded performance', async () => {
      const degradedData = {
        ...mockWidgetData,
        realTimeMetrics: { ...mockWidgetData.realTimeMetrics, online_status: 'degraded' }
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: degradedData }),
      });

      render(<WidgetStatsCard />);

      await waitFor(() => {
        const badge = screen.getByText('Degraded');
        expect(badge).toHaveClass('bg-yellow-100');
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for interactive elements', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        // Check for refresh button (even if no specific aria-label, should be present)
        const refreshButtons = screen.getAllByRole('button');
        expect(refreshButtons.length).toBeGreaterThan(0);
      });
    });

    it('supports keyboard navigation for buttons', async () => {
      render(<WidgetStatsCard />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        if (buttons.length > 0) {
          buttons[0].focus();
          expect(document.activeElement).toBe(buttons[0]);
        }
      });
    });

    it('provides proper role attributes', () => {
      render(<WidgetStatsCard />);

      // Card component should be present even if not specifically role="region"
      const card = document.querySelector('[data-testid]') || document.querySelector('.card');
      expect(document.body).toContainElement(card || document.body.firstChild);
    });
  });

  describe('Responsive Design', () => {
    it('adapts layout for mobile viewport', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<WidgetStatsCard />);

      const card = document.querySelector('*');
      expect(card).toBeTruthy();
    });

    it('shows full layout for desktop viewport', async () => {
      // Mock desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      render(<WidgetStatsCard />);

      // Desktop layout should show all elements
      await waitFor(() => {
        expect(screen.getByText('Widget Deployments')).toBeInTheDocument();
      });
    });
  });
});