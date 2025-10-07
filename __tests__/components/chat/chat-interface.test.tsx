import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from '@/components/chat/chat-interface';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock toast hook
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock LiveChatInterface component
jest.mock('@/components/chat/live-chat-interface', () => ({
  LiveChatInterface: ({ chatbotId, conversationId, onMessageSent }: any) => (
    <div data-testid="live-chat-interface">
      <div>Chatbot ID: {chatbotId}</div>
      <div>Conversation ID: {conversationId}</div>
      <button onClick={() => onMessageSent?.({ id: 'msg-1', content: 'Test message' })}>
        Send Test Message
      </button>
    </div>
  ),
}));

// Mock API fetch
global.fetch = jest.fn();

// Mock conversation metrics data
const mockMetricsData = {
  messageCount: 15,
  responseTime: 1.2,
  satisfaction: 4.5,
  lastActivity: '2025-10-03T10:30:00Z',
  duration: '00:05:30'
};

describe('ChatInterface Component', () => {
  const defaultProps = {
    chatbotId: 'bot-123',
    conversationId: 'conv-456'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockMetricsData }),
    });
  });

  describe('Component Rendering', () => {
    it('renders chat interface with live chat component', () => {
      render(<ChatInterface {...defaultProps} />);

      expect(screen.getByTestId('live-chat-interface')).toBeInTheDocument();
      expect(screen.getByText('Chatbot ID: bot-123')).toBeInTheDocument();
      expect(screen.getByText('Conversation ID: conv-456')).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      render(<ChatInterface {...defaultProps} className="custom-chat-class" />);

      const container = screen.getByTestId('live-chat-interface').closest('.custom-chat-class');
      expect(container).toBeInTheDocument();
    });

    it('shows conversation metrics when enabled', async () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        expect(screen.getByText('Conversation Metrics')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument(); // Message count
        expect(screen.getByText('1.2s')).toBeInTheDocument(); // Response time
        expect(screen.getByText('4.5')).toBeInTheDocument(); // Satisfaction
      });
    });

    it('shows action buttons when enabled', () => {
      render(<ChatInterface {...defaultProps} showActions={true} />);

      expect(screen.getByLabelText(/export conversation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/share conversation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/star conversation/i)).toBeInTheDocument();
    });

    it('hides metrics when showMetrics is false', () => {
      render(<ChatInterface {...defaultProps} showMetrics={false} />);

      expect(screen.queryByText('Conversation Metrics')).not.toBeInTheDocument();
    });
  });

  describe('Metrics Display', () => {
    it('fetches and displays conversation metrics', async () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        expect(screen.getByText('15')).toBeInTheDocument(); // Messages
        expect(screen.getByText('1.2s')).toBeInTheDocument(); // Avg response time
        expect(screen.getByText('4.5')).toBeInTheDocument(); // Satisfaction
        expect(screen.getByText('5m 30s')).toBeInTheDocument(); // Duration
      });
    });

    it('formats response time correctly', async () => {
      const slowResponseData = {
        ...mockMetricsData,
        responseTime: 5.8
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: slowResponseData }),
      });

      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        expect(screen.getByText('5.8s')).toBeInTheDocument();
      });
    });

    it('displays satisfaction rating with appropriate styling', async () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        const satisfactionValue = screen.getByText('4.5');
        expect(satisfactionValue).toHaveClass('text-green-600'); // High satisfaction
      });
    });

    it('handles low satisfaction ratings with warning styling', async () => {
      const lowSatisfactionData = {
        ...mockMetricsData,
        satisfaction: 2.1
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: lowSatisfactionData }),
      });

      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        const satisfactionValue = screen.getByText('2.1');
        expect(satisfactionValue).toHaveClass('text-red-600'); // Low satisfaction
      });
    });

    it('shows loading state for metrics', () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('provides export functionality', async () => {
      render(<ChatInterface {...defaultProps} showActions={true} enableExport={true} />);

      await waitFor(() => {
        const exportButton = screen.getByLabelText(/export conversation/i);
        fireEvent.click(exportButton);
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/conv-456/export')
      );
    });

    it('handles conversation sharing', () => {
      const mockShare = jest.fn();
      Object.assign(navigator, { share: mockShare });

      render(<ChatInterface {...defaultProps} showActions={true} />);

      const shareButton = screen.getByLabelText(/share conversation/i);
      fireEvent.click(shareButton);

      expect(mockShare).toHaveBeenCalledWith({
        title: 'Conversation',
        text: 'Check out this conversation',
        url: expect.stringContaining('conv-456')
      });
    });

    it('toggles conversation starring', async () => {
      render(<ChatInterface {...defaultProps} showActions={true} />);

      const starButton = screen.getByLabelText(/star conversation/i);
      fireEvent.click(starButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/conversations/conv-456/star'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('shows more actions menu', () => {
      render(<ChatInterface {...defaultProps} showActions={true} />);

      const moreButton = screen.getByLabelText(/more actions/i);
      fireEvent.click(moreButton);

      expect(screen.getByText('Delete Conversation')).toBeInTheDocument();
      expect(screen.getByText('Archive Conversation')).toBeInTheDocument();
    });
  });

  describe('Feedback System', () => {
    it('shows feedback buttons when enabled', () => {
      render(<ChatInterface {...defaultProps} enableFeedback={true} />);

      expect(screen.getByLabelText(/thumbs up/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/thumbs down/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/report issue/i)).toBeInTheDocument();
    });

    it('handles positive feedback', async () => {
      render(<ChatInterface {...defaultProps} enableFeedback={true} />);

      const thumbsUpButton = screen.getByLabelText(/thumbs up/i);
      fireEvent.click(thumbsUpButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/conversations/conv-456/feedback'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ type: 'positive', conversationId: 'conv-456' })
          })
        );
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Feedback Submitted',
        description: 'Thank you for your positive feedback!'
      });
    });

    it('handles negative feedback', async () => {
      render(<ChatInterface {...defaultProps} enableFeedback={true} />);

      const thumbsDownButton = screen.getByLabelText(/thumbs down/i);
      fireEvent.click(thumbsDownButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/conversations/conv-456/feedback'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ type: 'negative', conversationId: 'conv-456' })
          })
        );
      });
    });

    it('opens report dialog when report button clicked', () => {
      render(<ChatInterface {...defaultProps} enableFeedback={true} />);

      const reportButton = screen.getByLabelText(/report issue/i);
      fireEvent.click(reportButton);

      expect(screen.getByText('Report Issue')).toBeInTheDocument();
      expect(screen.getByText('Describe the issue you encountered')).toBeInTheDocument();
    });
  });

  describe('Message Handling', () => {
    it('updates metrics when new messages are sent', async () => {
      const onConversationUpdate = jest.fn();
      render(
        <ChatInterface
          {...defaultProps}
          showMetrics={true}
          onConversationUpdate={onConversationUpdate}
        />
      );

      await waitFor(() => {
        const sendButton = screen.getByText('Send Test Message');
        fireEvent.click(sendButton);
      });

      expect(onConversationUpdate).toHaveBeenCalledWith('conv-456', {
        lastActivity: expect.any(String),
        messageCount: expect.any(Number)
      });
    });

    it('refreshes metrics after message sent', async () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      // Initial load
      await waitFor(() => {
        expect(screen.getByText('15')).toBeInTheDocument();
      });

      // Send message
      const sendButton = screen.getByText('Send Test Message');
      fireEvent.click(sendButton);

      // Should refetch metrics
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Real-time Updates', () => {
    it('updates metrics in real-time', async () => {
      jest.useFakeTimers();
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      // Initial load
      await waitFor(() => {
        expect(screen.getByText('15')).toBeInTheDocument();
      });

      // Mock updated metrics
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { ...mockMetricsData, messageCount: 16 }
        }),
      });

      // Fast-forward to trigger refresh
      jest.advanceTimersByTime(30000);

      await waitFor(() => {
        expect(screen.getByText('16')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('shows live indicator when real-time updates are active', () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      expect(screen.getByTestId('live-indicator')).toBeInTheDocument();
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error state when metrics fetch fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Metrics API Error'));

      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        expect(screen.getByText(/error loading metrics/i)).toBeInTheDocument();
      });
    });

    it('shows retry button on metrics error', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Metrics API Error'));

      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('handles export errors gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Export failed'));

      render(<ChatInterface {...defaultProps} showActions={true} enableExport={true} />);

      const exportButton = screen.getByLabelText(/export conversation/i);
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Export Failed',
          description: 'Unable to export conversation. Please try again.',
          variant: 'destructive'
        });
      });
    });
  });

  describe('Settings Integration', () => {
    it('opens chat settings when settings button clicked', () => {
      render(<ChatInterface {...defaultProps} showActions={true} />);

      const settingsButton = screen.getByLabelText(/chat settings/i);
      fireEvent.click(settingsButton);

      expect(screen.getByText('Chat Settings')).toBeInTheDocument();
    });

    it('applies user preference settings', async () => {
      const userSettings = {
        theme: 'dark',
        soundEnabled: true,
        autoScroll: false
      };

      render(<ChatInterface {...defaultProps} userSettings={userSettings} />);

      await waitFor(() => {
        const container = screen.getByTestId('live-chat-interface').closest('[data-theme]');
        expect(container).toHaveAttribute('data-theme', 'dark');
      });
    });
  });

  describe('Conversation Management', () => {
    it('handles conversation deletion', async () => {
      render(<ChatInterface {...defaultProps} showActions={true} />);

      const moreButton = screen.getByLabelText(/more actions/i);
      fireEvent.click(moreButton);

      const deleteButton = screen.getByText('Delete Conversation');
      fireEvent.click(deleteButton);

      // Should show confirmation dialog
      expect(screen.getByText('Delete Conversation?')).toBeInTheDocument();

      // Confirm deletion
      const confirmButton = screen.getByText('Delete');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/conversations/conv-456'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    it('handles conversation archiving', async () => {
      render(<ChatInterface {...defaultProps} showActions={true} />);

      const moreButton = screen.getByLabelText(/more actions/i);
      fireEvent.click(moreButton);

      const archiveButton = screen.getByText('Archive Conversation');
      fireEvent.click(archiveButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/conversations/conv-456/archive'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for all interactive elements', () => {
      render(
        <ChatInterface
          {...defaultProps}
          showActions={true}
          enableFeedback={true}
          showMetrics={true}
        />
      );

      expect(screen.getByLabelText(/export conversation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/share conversation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/thumbs up/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/thumbs down/i)).toBeInTheDocument();
    });

    it('supports keyboard navigation for action buttons', () => {
      render(<ChatInterface {...defaultProps} showActions={true} />);

      const exportButton = screen.getByLabelText(/export/i);
      exportButton.focus();
      expect(document.activeElement).toBe(exportButton);

      // Tab to next button
      fireEvent.keyDown(exportButton, { key: 'Tab' });
      const shareButton = screen.getByLabelText(/share/i);
      shareButton.focus();
      expect(document.activeElement).toBe(shareButton);
    });

    it('provides proper role attributes', () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      expect(screen.getByRole('region')).toBeInTheDocument(); // Chat interface
    });

    it('announces metric updates to screen readers', async () => {
      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      await waitFor(() => {
        const statusRegion = screen.getByRole('status');
        expect(statusRegion).toBeInTheDocument();
      });
    });
  });

  describe('Performance Optimization', () => {
    it('memoizes expensive calculations', () => {
      const { rerender } = render(<ChatInterface {...defaultProps} showMetrics={true} />);

      // Re-render with same props
      rerender(<ChatInterface {...defaultProps} showMetrics={true} />);

      // Should not fetch metrics again
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('cleans up timers and subscriptions on unmount', () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = render(<ChatInterface {...defaultProps} showMetrics={true} />);
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('Mobile Responsiveness', () => {
    it('adapts action layout for mobile screens', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<ChatInterface {...defaultProps} showActions={true} />);

      const actionContainer = screen.getByTestId('action-buttons');
      expect(actionContainer).toHaveClass('flex-col'); // Vertical layout on mobile
    });

    it('hides secondary metrics on small screens', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<ChatInterface {...defaultProps} showMetrics={true} />);

      expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    });
  });
});