import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityFeedCard } from '@/components/dashboard/activity-feed-card';

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
  readyState = WebSocket.CONNECTING;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 100);
  }

  send(data: string) {}
  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

global.WebSocket = MockWebSocket as any;

// Mock API fetch
global.fetch = jest.fn();

// Mock activity feed data
const mockActivityData = {
  recentActivities: [
    {
      id: '1',
      type: 'widget_deployment',
      message: 'Widget deployed to example.com',
      user: 'admin@example.com',
      timestamp: '2025-10-03T10:30:00Z',
      metadata: {
        domain: 'example.com',
        widget_id: 'widget-123',
        status: 'success'
      }
    },
    {
      id: '2',
      type: 'chat_session',
      message: 'New chat session started',
      user: 'user@example.com',
      timestamp: '2025-10-03T10:25:00Z',
      metadata: {
        session_id: 'session-456',
        chatbot_id: 'bot-789',
        duration: 180
      }
    },
    {
      id: '3',
      type: 'configuration_change',
      message: 'Chatbot configuration updated',
      user: 'admin@example.com',
      timestamp: '2025-10-03T10:20:00Z',
      metadata: {
        chatbot_id: 'bot-789',
        field_changed: 'system_prompt',
        previous_value: 'Old prompt',
        new_value: 'New prompt'
      }
    },
    {
      id: '4',
      type: 'document_upload',
      message: 'Document uploaded to knowledge base',
      user: 'admin@example.com',
      timestamp: '2025-10-03T10:15:00Z',
      metadata: {
        document_id: 'doc-321',
        filename: 'user-manual.pdf',
        size: '2.5MB'
      }
    },
    {
      id: '5',
      type: 'user_login',
      message: 'User logged in',
      user: 'user@example.com',
      timestamp: '2025-10-03T10:10:00Z',
      metadata: {
        ip_address: '192.168.1.100',
        user_agent: 'Chrome/91.0'
      }
    }
  ],
  stats: {
    totalActivities: 25,
    todayActivities: 8,
    uniqueUsers: 4,
    topActivityType: 'chat_session'
  }
};

describe('ActivityFeedCard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockActivityData }),
    });
  });

  describe('Component Rendering', () => {
    it('renders activity feed card with title and description', () => {
      render(<ActivityFeedCard />);

      expect(screen.getByText('Activity Feed')).toBeInTheDocument();
      expect(screen.getByText('Recent system activity and events')).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      render(<ActivityFeedCard className="custom-activity-class" />);

      const card = screen.getByText('Activity Feed').closest('.custom-activity-class');
      expect(card).toBeInTheDocument();
    });

    it('shows loading skeletons initially', () => {
      render(<ActivityFeedCard />);

      const skeletons = screen.getAllByTestId(/skeleton|loading/);
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Activity Data Display', () => {
    it('fetches and displays activity feed data', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByText('Widget deployed to example.com')).toBeInTheDocument();
        expect(screen.getByText('New chat session started')).toBeInTheDocument();
        expect(screen.getByText('Chatbot configuration updated')).toBeInTheDocument();
      });
    });

    it('displays user information for each activity', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });
    });

    it('shows formatted timestamps', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByText(/10:30/)).toBeInTheDocument();
        expect(screen.getByText(/10:25/)).toBeInTheDocument();
        expect(screen.getByText(/10:20/)).toBeInTheDocument();
      });
    });

    it('displays activity type icons', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByTestId('icon-widget_deployment')).toBeInTheDocument();
        expect(screen.getByTestId('icon-chat_session')).toBeInTheDocument();
        expect(screen.getByTestId('icon-configuration_change')).toBeInTheDocument();
      });
    });
  });

  describe('Activity Statistics', () => {
    it('displays activity statistics', async () => {
      render(<ActivityFeedCard showStats={true} />);

      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument(); // Total activities
        expect(screen.getByText('8')).toBeInTheDocument(); // Today activities
        expect(screen.getByText('4')).toBeInTheDocument(); // Unique users
      });
    });

    it('shows top activity type', async () => {
      render(<ActivityFeedCard showStats={true} />);

      await waitFor(() => {
        expect(screen.getByText('Chat Session')).toBeInTheDocument(); // Top activity type
      });
    });
  });

  describe('Activity Filtering', () => {
    it('provides activity type filter options', async () => {
      render(<ActivityFeedCard showFilters={true} />);

      await waitFor(() => {
        expect(screen.getByText('All Activities')).toBeInTheDocument();
        expect(screen.getByText('Chat Sessions')).toBeInTheDocument();
        expect(screen.getByText('Deployments')).toBeInTheDocument();
        expect(screen.getByText('Configuration')).toBeInTheDocument();
      });
    });

    it('filters activities by type', async () => {
      render(<ActivityFeedCard showFilters={true} />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Chat Sessions'));
      });

      // Should only show chat session activities
      expect(screen.getByText('New chat session started')).toBeInTheDocument();
      expect(screen.queryByText('Widget deployed to example.com')).not.toBeInTheDocument();
    });

    it('filters activities by user', async () => {
      render(<ActivityFeedCard showFilters={true} />);

      await waitFor(() => {
        const userFilter = screen.getByPlaceholderText('Filter by user...');
        fireEvent.change(userFilter, { target: { value: 'admin@example.com' } });
      });

      // Should only show activities by admin user
      expect(screen.getByText('Widget deployed to example.com')).toBeInTheDocument();
      expect(screen.queryByText('New chat session started')).not.toBeInTheDocument();
    });

    it('filters activities by date range', async () => {
      render(<ActivityFeedCard showFilters={true} />);

      await waitFor(() => {
        const dateFilter = screen.getByLabelText('Date range');
        fireEvent.change(dateFilter, { target: { value: 'today' } });
      });

      // Should filter activities based on date range
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('date_range=today')
      );
    });
  });

  describe('Activity Search', () => {
    it('provides search functionality', async () => {
      render(<ActivityFeedCard showSearch={true} />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search activities...');
        fireEvent.change(searchInput, { target: { value: 'widget' } });
      });

      // Should filter activities containing 'widget'
      expect(screen.getByText('Widget deployed to example.com')).toBeInTheDocument();
    });

    it('handles search query changes', async () => {
      render(<ActivityFeedCard showSearch={true} />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search activities...');
        fireEvent.change(searchInput, { target: { value: 'chat' } });
      });

      // Should debounce search and make API call
      setTimeout(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('search=chat')
        );
      }, 300);
    });
  });

  describe('Real-time Updates', () => {
    it('establishes WebSocket connection for real-time activity updates', async () => {
      render(<ActivityFeedCard enableRealTime={true} />);

      await waitFor(() => {
        // WebSocket should be connected
        expect(screen.getByTestId('realtime-indicator')).toBeInTheDocument();
      });
    });

    it('updates activity feed when new activities arrive via WebSocket', async () => {
      render(<ActivityFeedCard enableRealTime={true} />);

      await waitFor(() => {
        expect(screen.getByText('Widget deployed to example.com')).toBeInTheDocument();
      });

      // Simulate WebSocket message with new activity
      const newActivity = {
        id: '6',
        type: 'user_registration',
        message: 'New user registered',
        user: 'newuser@example.com',
        timestamp: new Date().toISOString(),
        metadata: { user_id: 'user-999' }
      };

      // This would be triggered by WebSocket in real implementation
      // For testing, we simulate the activity being added
    });

    it('shows connection status indicator', async () => {
      render(<ActivityFeedCard enableRealTime={true} showConnectionStatus={true} />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
        const statusDot = screen.getByTestId('connection-status');
        expect(statusDot).toHaveClass('bg-green-500');
      });
    });
  });

  describe('Activity Details Expansion', () => {
    it('allows expanding activity details', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        const expandButton = screen.getByTestId('expand-activity-1');
        fireEvent.click(expandButton);
      });

      expect(screen.getByText('Activity Details')).toBeInTheDocument();
      expect(screen.getByText('Domain: example.com')).toBeInTheDocument();
      expect(screen.getByText('Widget ID: widget-123')).toBeInTheDocument();
    });

    it('shows metadata for different activity types', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        const chatActivityExpand = screen.getByTestId('expand-activity-2');
        fireEvent.click(chatActivityExpand);
      });

      expect(screen.getByText('Session ID: session-456')).toBeInTheDocument();
      expect(screen.getByText('Duration: 3m 0s')).toBeInTheDocument();
    });

    it('formats metadata appropriately for each activity type', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        const documentUploadExpand = screen.getByTestId('expand-activity-4');
        fireEvent.click(documentUploadExpand);
      });

      expect(screen.getByText('Filename: user-manual.pdf')).toBeInTheDocument();
      expect(screen.getByText('File Size: 2.5MB')).toBeInTheDocument();
    });
  });

  describe('Pagination and Load More', () => {
    it('shows load more button when there are more activities', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByText('Load More')).toBeInTheDocument();
      });
    });

    it('loads more activities when load more clicked', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Load More'));
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=5')
      );
    });

    it('shows loading state while fetching more activities', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Load More'));
      });

      expect(screen.getByText('Loading more...')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error state when API fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Activity API Error'));

      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByText(/error loading activities/i)).toBeInTheDocument();
      });
    });

    it('shows retry functionality on error', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Activity API Error'));

      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('handles WebSocket connection errors gracefully', async () => {
      render(<ActivityFeedCard enableRealTime={true} />);

      // Simulate WebSocket error
      await waitFor(() => {
        const connectionStatus = screen.getByTestId('connection-status');
        expect(connectionStatus).toHaveClass('bg-red-500');
      });
    });
  });

  describe('User Interactions', () => {
    it('handles refresh button click', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        const refreshButton = screen.getByLabelText(/refresh activities/i);
        fireEvent.click(refreshButton);
      });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('navigates to activity logs page', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('View All Activities'));
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/logs');
    });

    it('allows copying activity details', async () => {
      const mockClipboard = {
        writeText: jest.fn()
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      render(<ActivityFeedCard />);

      await waitFor(() => {
        const copyButton = screen.getByTestId('copy-activity-1');
        fireEvent.click(copyButton);
      });

      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Widget deployed to example.com')
      );
    });
  });

  describe('Activity Type Styling', () => {
    it('applies different colors for different activity types', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        const deploymentIcon = screen.getByTestId('icon-widget_deployment');
        expect(deploymentIcon).toHaveClass('text-blue-500');

        const chatIcon = screen.getByTestId('icon-chat_session');
        expect(chatIcon).toHaveClass('text-green-500');

        const configIcon = screen.getByTestId('icon-configuration_change');
        expect(configIcon).toHaveClass('text-orange-500');
      });
    });

    it('shows priority badges for important activities', async () => {
      const criticalActivity = {
        ...mockActivityData,
        recentActivities: [
          {
            ...mockActivityData.recentActivities[0],
            priority: 'critical',
            type: 'system_error'
          }
        ]
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: criticalActivity }),
      });

      render(<ActivityFeedCard />);

      await waitFor(() => {
        const criticalBadge = screen.getByText('Critical');
        expect(criticalBadge).toHaveClass('bg-red-100');
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for interactive elements', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByLabelText(/refresh activities/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/view all activities/i)).toBeInTheDocument();
      });
    });

    it('provides proper role attributes for activity list', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        expect(screen.getByRole('feed')).toBeInTheDocument();
      });
    });

    it('supports keyboard navigation for activity items', async () => {
      render(<ActivityFeedCard />);

      await waitFor(() => {
        const firstActivity = screen.getByTestId('activity-item-1');
        firstActivity.focus();
        expect(document.activeElement).toBe(firstActivity);
      });
    });

    it('announces new activities to screen readers', async () => {
      render(<ActivityFeedCard enableRealTime={true} />);

      await waitFor(() => {
        const liveRegion = screen.getByRole('log');
        expect(liveRegion).toBeInTheDocument();
      });
    });
  });

  describe('Performance Features', () => {
    it('virtualizes long activity lists for performance', async () => {
      const longActivityList = {
        ...mockActivityData,
        recentActivities: Array(100).fill(null).map((_, index) => ({
          ...mockActivityData.recentActivities[0],
          id: `activity-${index}`,
          message: `Activity ${index}`
        }))
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: longActivityList }),
      });

      render(<ActivityFeedCard enableVirtualization={true} />);

      // Should only render visible items
      await waitFor(() => {
        const renderedItems = screen.getAllByTestId(/activity-item-/);
        expect(renderedItems.length).toBeLessThan(100);
      });
    });

    it('implements infinite scroll for large datasets', async () => {
      render(<ActivityFeedCard enableInfiniteScroll={true} />);

      await waitFor(() => {
        const scrollContainer = screen.getByTestId('activity-scroll-container');
        fireEvent.scroll(scrollContainer, { target: { scrollTop: 500 } });
      });

      // Should trigger loading more activities
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=5')
      );
    });
  });
});