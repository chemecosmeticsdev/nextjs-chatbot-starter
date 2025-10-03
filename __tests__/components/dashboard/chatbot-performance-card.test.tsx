import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatbotPerformanceCard } from '@/components/dashboard/chatbot-performance-card';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock API fetch
global.fetch = jest.fn();

// Mock chatbot performance data
const mockPerformanceData = {
  totalChatbots: 8,
  activeChatbots: 6,
  averageSuccessRate: 92.5,
  averageSatisfaction: 4.2,
  totalInteractions: 15420,
  topPerforming: [
    {
      id: 'bot-1',
      name: 'Customer Support Bot',
      successRate: 96.8,
      satisfaction: 4.5,
      interactions: 5420,
      responseTime: 1.2
    },
    {
      id: 'bot-2',
      name: 'Sales Assistant Bot',
      successRate: 94.2,
      satisfaction: 4.3,
      interactions: 3200,
      responseTime: 0.9
    },
    {
      id: 'bot-3',
      name: 'Technical Support Bot',
      successRate: 88.5,
      satisfaction: 4.0,
      interactions: 2800,
      responseTime: 2.1
    }
  ],
  knowledgeBaseHits: 8950,
  averageResponseTime: 1.4,
  failureRate: 7.5,
  trendsData: {
    interactions: 'up',
    satisfaction: 'up',
    responseTime: 'down'
  }
};

describe('ChatbotPerformanceCard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockPerformanceData }),
    });
  });

  describe('Component Rendering', () => {
    it('renders chatbot performance card with title and description', () => {
      render(<ChatbotPerformanceCard />);

      expect(screen.getByText('Chatbot Performance')).toBeInTheDocument();
      expect(screen.getByText('Analytics and success metrics')).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      render(<ChatbotPerformanceCard className="custom-performance-class" />);

      const card = screen.getByText('Chatbot Performance').closest('.custom-performance-class');
      expect(card).toBeInTheDocument();
    });

    it('shows loading skeletons initially', () => {
      render(<ChatbotPerformanceCard />);

      const skeletons = screen.getAllByTestId(/skeleton|loading/);
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics Display', () => {
    it('displays overview statistics correctly', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('8')).toBeInTheDocument(); // Total chatbots
        expect(screen.getByText('6')).toBeInTheDocument(); // Active chatbots
        expect(screen.getByText('92.5%')).toBeInTheDocument(); // Success rate
        expect(screen.getByText('4.2')).toBeInTheDocument(); // Satisfaction
      });
    });

    it('shows total interactions with proper formatting', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('15,420')).toBeInTheDocument();
      });
    });

    it('displays knowledge base hits', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('8,950')).toBeInTheDocument();
      });
    });

    it('shows average response time', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('1.4s')).toBeInTheDocument();
      });
    });
  });

  describe('Top Performing Chatbots', () => {
    it('displays top performing chatbots list', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('Customer Support Bot')).toBeInTheDocument();
        expect(screen.getByText('Sales Assistant Bot')).toBeInTheDocument();
        expect(screen.getByText('Technical Support Bot')).toBeInTheDocument();
      });
    });

    it('shows chatbot performance metrics', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('96.8%')).toBeInTheDocument(); // Success rate
        expect(screen.getByText('4.5')).toBeInTheDocument(); // Satisfaction
        expect(screen.getByText('5,420')).toBeInTheDocument(); // Interactions
      });
    });

    it('displays response times for each bot', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('1.2s')).toBeInTheDocument();
        expect(screen.getByText('0.9s')).toBeInTheDocument();
        expect(screen.getByText('2.1s')).toBeInTheDocument();
      });
    });

    it('allows navigation to individual chatbot details', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const botLink = screen.getByText('Customer Support Bot').closest('button');
        fireEvent.click(botLink!);
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots/bot-1');
    });
  });

  describe('Quick Actions', () => {
    it('provides quick action buttons', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('Create Chatbot')).toBeInTheDocument();
        expect(screen.getByText('Test Playground')).toBeInTheDocument();
        expect(screen.getByText('View Analytics')).toBeInTheDocument();
      });
    });

    it('navigates to create chatbot page', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Create Chatbot'));
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots/create');
    });

    it('navigates to test playground', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Test Playground'));
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/playground');
    });

    it('navigates to analytics page', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('View Analytics'));
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/analytics');
    });
  });

  describe('Trend Indicators', () => {
    it('displays trend indicators for metrics', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByTestId('trend-interactions-up')).toBeInTheDocument();
        expect(screen.getByTestId('trend-satisfaction-up')).toBeInTheDocument();
        expect(screen.getByTestId('trend-responsetime-down')).toBeInTheDocument();
      });
    });

    it('shows appropriate colors for trends', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const upTrend = screen.getByTestId('trend-interactions-up');
        expect(upTrend).toHaveClass('text-green-500');

        const downTrend = screen.getByTestId('trend-responsetime-down');
        expect(downTrend).toHaveClass('text-green-500'); // Down response time is good
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error state when API fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText(/error loading/i)).toBeInTheDocument();
      });
    });

    it('shows retry functionality', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('User Interactions', () => {
    it('handles refresh button click', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const refreshButton = screen.getByLabelText(/refresh/i);
        fireEvent.click(refreshButton);
      });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('expands chatbot details on click', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const expandButton = screen.getByTestId('expand-bot-details');
        fireEvent.click(expandButton);
      });

      expect(screen.getByText('Configuration')).toBeInTheDocument();
    });
  });

  describe('Performance Badges', () => {
    it('shows performance badges based on success rates', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const excellentBadge = screen.getByText('Excellent');
        expect(excellentBadge).toBeInTheDocument();
        expect(excellentBadge).toHaveClass('bg-green-100');
      });
    });

    it('shows warning badges for poor performance', async () => {
      const poorPerformanceData = {
        ...mockPerformanceData,
        topPerforming: [
          {
            ...mockPerformanceData.topPerforming[0],
            successRate: 65.0,
            satisfaction: 2.5
          }
        ]
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: poorPerformanceData }),
      });

      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const poorBadge = screen.getByText('Needs Improvement');
        expect(poorBadge).toBeInTheDocument();
        expect(poorBadge).toHaveClass('bg-red-100');
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for interactive elements', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByLabelText(/refresh chatbot performance/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/create new chatbot/i)).toBeInTheDocument();
      });
    });

    it('supports keyboard navigation for quick actions', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const createButton = screen.getByLabelText(/create new chatbot/i);
        createButton.focus();
        expect(document.activeElement).toBe(createButton);
      });
    });

    it('provides proper role attributes for lists', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByRole('list')).toBeInTheDocument();
      });
    });
  });

  describe('Progress Indicators', () => {
    it('shows success rate as progress bars', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const progressBars = screen.getAllByRole('progressbar');
        expect(progressBars.length).toBeGreaterThan(0);
        expect(progressBars[0]).toHaveAttribute('aria-valuenow', '96.8');
      });
    });

    it('uses different colors for different performance levels', async () => {
      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const highPerformanceBar = screen.getByLabelText(/96.8% success rate/i);
        expect(highPerformanceBar).toHaveClass('bg-green-500');
      });
    });
  });

  describe('Data Refresh', () => {
    it('automatically refreshes data at intervals', async () => {
      jest.useFakeTimers();
      render(<ChatbotPerformanceCard refreshInterval={30000} />);

      expect(fetch).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });

    it('cleans up timers on unmount', () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = render(<ChatbotPerformanceCard />);
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no chatbots exist', async () => {
      const emptyData = {
        ...mockPerformanceData,
        totalChatbots: 0,
        activeChatbots: 0,
        topPerforming: []
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: emptyData }),
      });

      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        expect(screen.getByText('No chatbots found')).toBeInTheDocument();
        expect(screen.getByText('Create your first chatbot to get started')).toBeInTheDocument();
      });
    });

    it('provides call-to-action in empty state', async () => {
      const emptyData = {
        ...mockPerformanceData,
        totalChatbots: 0,
        topPerforming: []
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: emptyData }),
      });

      render(<ChatbotPerformanceCard />);

      await waitFor(() => {
        const createButton = screen.getByText('Create First Chatbot');
        fireEvent.click(createButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots/create');
    });
  });
});