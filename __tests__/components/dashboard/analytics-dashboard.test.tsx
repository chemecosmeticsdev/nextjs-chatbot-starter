import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';

// Mock Next.js router
const mockRouter = {
  push: jest.fn(),
  pathname: '/dashboard/analytics',
  query: {},
  asPath: '/dashboard/analytics',
  route: '/dashboard/analytics'
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Mock fetch for API calls
global.fetch = jest.fn();

import AnalyticsPage from '@/app/dashboard/analytics/page';

const mockAnalyticsData = {
  overview: {
    totalConversations: 1250,
    totalUsers: 450,
    averageResponseTime: 1.8,
    successRate: 96.5,
    trends: {
      conversations: 12.5,
      users: 8.3,
      responseTime: -5.2,
      successRate: 2.1,
    },
  },
  performance: {
    hourlyData: [
      { hour: '00:00', conversations: 12, responseTime: 1.5, errorRate: 2.1 },
      { hour: '01:00', conversations: 8, responseTime: 1.3, errorRate: 1.8 },
      { hour: '02:00', conversations: 15, responseTime: 2.1, errorRate: 3.2 },
      { hour: '03:00', conversations: 22, responseTime: 1.7, errorRate: 1.5 },
    ],
    topEndpoints: [
      { endpoint: '/api/v1/chat', requests: 850, avgResponseTime: 1.2 },
      { endpoint: '/api/v1/knowledge', requests: 340, avgResponseTime: 2.8 },
      { endpoint: '/api/v1/config', requests: 125, avgResponseTime: 0.8 },
    ],
  },
  sessions: {
    sessionsData: [
      {
        sessionId: 'session-1',
        userId: 'user-1',
        chatbotId: 'bot-1',
        startTime: '2025-10-03T09:00:00Z',
        endTime: '2025-10-03T09:15:00Z',
        messageCount: 8,
        duration: 900,
        averageResponseTime: 1.4,
      },
      {
        sessionId: 'session-2',
        userId: 'user-2',
        chatbotId: 'bot-2',
        startTime: '2025-10-03T10:30:00Z',
        endTime: '2025-10-03T10:45:00Z',
        messageCount: 12,
        duration: 900,
        averageResponseTime: 2.1,
      },
    ],
    aggregates: {
      totalSessions: 156,
      averageDuration: 850,
      averageMessagesPerSession: 9.2,
      uniqueUsers: 89,
    },
  },
};

describe('Analytics Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockAnalyticsData }),
    });
  });

  it('renders the analytics dashboard with all tabs', async () => {
    render(<AnalyticsPage />);

    // Check for main elements
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Monitor your chatbot performance')).toBeInTheDocument();

    await waitFor(() => {
      // Check for tab navigation
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Performance')).toBeInTheDocument();
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('displays overview metrics correctly', async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      // Check for overview metrics
      expect(screen.getByText('Total Conversations')).toBeInTheDocument();
      expect(screen.getByText('1,250')).toBeInTheDocument();

      expect(screen.getByText('Total Users')).toBeInTheDocument();
      expect(screen.getByText('450')).toBeInTheDocument();

      expect(screen.getByText('Avg Response Time')).toBeInTheDocument();
      expect(screen.getByText('1.8s')).toBeInTheDocument();

      expect(screen.getByText('Success Rate')).toBeInTheDocument();
      expect(screen.getByText('96.5%')).toBeInTheDocument();
    });
  });

  it('shows trend indicators with correct colors', async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      // Positive trends should be green
      const conversationsTrend = screen.getByText('+12.5%');
      expect(conversationsTrend).toHaveClass('text-green-500');

      const usersTrend = screen.getByText('+8.3%');
      expect(usersTrend).toHaveClass('text-green-500');

      // Negative response time trend should be green (faster is better)
      const responseTimeTrend = screen.getByText('-5.2%');
      expect(responseTimeTrend).toHaveClass('text-green-500');

      // Positive success rate trend should be green
      const successRateTrend = screen.getByText('+2.1%');
      expect(successRateTrend).toHaveClass('text-green-500');
    });
  });

  it('switches between analytics tabs', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Switch to Performance tab
    const performanceTab = screen.getByText('Performance');
    await user.click(performanceTab);

    // Should show performance metrics
    await waitFor(() => {
      expect(screen.getByText('Response Time Trends')).toBeInTheDocument();
      expect(screen.getByText('Top Endpoints')).toBeInTheDocument();
    });

    // Switch to Sessions tab
    const sessionsTab = screen.getByText('Sessions');
    await user.click(sessionsTab);

    // Should show session data
    await waitFor(() => {
      expect(screen.getByText('Recent Sessions')).toBeInTheDocument();
      expect(screen.getByText('Session Analytics')).toBeInTheDocument();
    });
  });

  it('handles date range selection', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    });

    // Change date range
    const dateRangeSelector = screen.getByText('Last 7 days');
    await user.click(dateRangeSelector);

    const monthOption = screen.getByText('Last 30 days');
    await user.click(monthOption);

    // Should trigger new API call with updated date range
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('timeRange=30d'),
        expect.any(Object)
      );
    });
  });

  it('displays performance charts correctly', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    // Switch to Performance tab
    const performanceTab = screen.getByText('Performance');
    await user.click(performanceTab);

    await waitFor(() => {
      // Check for chart elements
      expect(screen.getByText('Response Time Trends')).toBeInTheDocument();
      expect(screen.getByText('Traffic Distribution')).toBeInTheDocument();

      // Check for top endpoints
      expect(screen.getByText('/api/v1/chat')).toBeInTheDocument();
      expect(screen.getByText('850 requests')).toBeInTheDocument();
      expect(screen.getByText('1.2s avg')).toBeInTheDocument();
    });
  });

  it('shows session details in sessions tab', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Sessions')).toBeInTheDocument();
    });

    // Switch to Sessions tab
    const sessionsTab = screen.getByText('Sessions');
    await user.click(sessionsTab);

    await waitFor(() => {
      // Check for session aggregates
      expect(screen.getByText('Total Sessions')).toBeInTheDocument();
      expect(screen.getByText('156')).toBeInTheDocument();

      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
      expect(screen.getByText('14m 10s')).toBeInTheDocument();

      expect(screen.getByText('Avg Messages/Session')).toBeInTheDocument();
      expect(screen.getByText('9.2')).toBeInTheDocument();

      // Check for individual session data
      expect(screen.getByText('session-1')).toBeInTheDocument();
      expect(screen.getByText('8 messages')).toBeInTheDocument();
      expect(screen.getByText('15m 0s')).toBeInTheDocument();
    });
  });

  it('exports analytics data', async () => {
    const user = userEvent.setup();

    // Mock download functionality
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
    const mockLink = {
      click: jest.fn(),
      setAttribute: jest.fn(),
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    jest.spyOn(document.body, 'appendChild').mockImplementation();
    jest.spyOn(document.body, 'removeChild').mockImplementation();

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    // Click export button
    const exportButton = screen.getByText('Export');
    await user.click(exportButton);

    // Select CSV format
    const csvOption = screen.getByText('CSV');
    await user.click(csvOption);

    // Should trigger download
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('handles real-time updates toggle', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // Switch to Settings tab
    const settingsTab = screen.getByText('Settings');
    await user.click(settingsTab);

    // Toggle real-time updates
    const realtimeToggle = screen.getByRole('switch', { name: /real-time updates/i });
    await user.click(realtimeToggle);

    expect(realtimeToggle).toBeChecked();

    // Should show refresh interval selector
    expect(screen.getByText('Refresh Interval')).toBeInTheDocument();
  });

  it('filters data by chatbot selection', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('All Chatbots')).toBeInTheDocument();
    });

    // Change chatbot filter
    const chatbotFilter = screen.getByText('All Chatbots');
    await user.click(chatbotFilter);

    const specificBot = screen.getByText('Test Chatbot 1');
    await user.click(specificBot);

    // Should trigger new API call with chatbot filter
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('chatbotId=test-chatbot-1'),
        expect.any(Object)
      );
    });
  });

  it('handles API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('Analytics API failed'));

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load analytics data')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('shows loading state during data fetch', () => {
    // Make fetch never resolve to show loading state
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(<AnalyticsPage />);

    // Should show loading indicators
    expect(screen.getByText('Loading analytics...')).toBeInTheDocument();

    // Should show skeleton cards
    const skeletonCards = screen.getAllByTestId('skeleton-metric-card');
    expect(skeletonCards.length).toBeGreaterThan(0);
  });

  it('updates charts when metrics are refreshed', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('1,250')).toBeInTheDocument();
    });

    // Mock updated data
    const updatedData = {
      ...mockAnalyticsData,
      overview: {
        ...mockAnalyticsData.overview,
        totalConversations: 1300,
      },
    };

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: updatedData }),
    });

    // Click refresh button
    const refreshButton = screen.getByText('Refresh');
    await user.click(refreshButton);

    // Should show updated data
    await waitFor(() => {
      expect(screen.getByText('1,300')).toBeInTheDocument();
    });
  });

  it('handles custom date range selection', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    });

    // Select custom date range
    const dateRangeSelector = screen.getByText('Last 7 days');
    await user.click(dateRangeSelector);

    const customOption = screen.getByText('Custom Range');
    await user.click(customOption);

    // Should show date pickers
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();

    // Select custom dates and apply
    const applyButton = screen.getByText('Apply Range');
    await user.click(applyButton);

    // Should trigger API call with custom date range
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate='),
        expect.any(Object)
      );
    });
  });
});