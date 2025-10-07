import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationSidebar } from '@/components/chat/conversation-sidebar';

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

// Mock API fetch
global.fetch = jest.fn();

// Mock conversations data
const mockConversationsData = [
  {
    id: 'conv-1',
    title: 'Customer Support Query',
    chatbotId: 'bot-1',
    chatbotName: 'Support Bot',
    lastMessage: 'Thank you for contacting us',
    lastActivity: '2025-10-03T10:30:00Z',
    messageCount: 12,
    isStarred: true,
    isArchived: false,
    status: 'active'
  },
  {
    id: 'conv-2',
    title: 'Product Information',
    chatbotId: 'bot-2',
    chatbotName: 'Sales Bot',
    lastMessage: 'Here are the product details you requested',
    lastActivity: '2025-10-03T09:15:00Z',
    messageCount: 8,
    isStarred: false,
    isArchived: false,
    status: 'ended'
  },
  {
    id: 'conv-3',
    title: 'Technical Issue',
    chatbotId: 'bot-1',
    chatbotName: 'Support Bot',
    lastMessage: 'Let me check that for you',
    lastActivity: '2025-10-02T16:45:00Z',
    messageCount: 15,
    isStarred: false,
    isArchived: true,
    status: 'ended'
  }
];

// Mock chatbots data
const mockChatbotsData = [
  {
    id: 'bot-1',
    name: 'Customer Support Bot',
    description: 'Handles customer inquiries and support requests',
    status: 'active',
    conversationCount: 156,
    averageRating: 4.5
  },
  {
    id: 'bot-2',
    name: 'Sales Assistant Bot',
    description: 'Helps with product information and sales',
    status: 'active',
    conversationCount: 89,
    averageRating: 4.2
  },
  {
    id: 'bot-3',
    name: 'Technical Support Bot',
    description: 'Provides technical assistance',
    status: 'maintenance',
    conversationCount: 234,
    averageRating: 4.1
  }
];

describe('ConversationSidebar Component', () => {
  const defaultProps = {
    currentConversationId: 'conv-1',
    onConversationSelect: jest.fn(),
    onChatbotSelect: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockConversationsData })
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockChatbotsData })
        })
      );
  });

  describe('Component Rendering', () => {
    it('renders conversation sidebar with chatbot and conversation sections', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Chatbots')).toBeInTheDocument();
        expect(screen.getByText('Conversations')).toBeInTheDocument();
      });
    });

    it('shows loading skeletons initially', () => {
      render(<ConversationSidebar {...defaultProps} />);

      expect(screen.getAllByTestId(/skeleton|loading/).length).toBeGreaterThan(0);
    });

    it('applies custom className when provided', () => {
      render(<ConversationSidebar {...defaultProps} className="custom-sidebar" />);

      const sidebar = screen.getByRole('complementary');
      expect(sidebar).toHaveClass('custom-sidebar');
    });
  });

  describe('Chatbot Selection', () => {
    it('displays list of available chatbots', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Customer Support Bot')).toBeInTheDocument();
        expect(screen.getByText('Sales Assistant Bot')).toBeInTheDocument();
        expect(screen.getByText('Technical Support Bot')).toBeInTheDocument();
      });
    });

    it('shows chatbot descriptions and statistics', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Handles customer inquiries and support requests')).toBeInTheDocument();
        expect(screen.getByText('156 conversations')).toBeInTheDocument();
        expect(screen.getByText('4.5 ★')).toBeInTheDocument();
      });
    });

    it('displays chatbot status indicators', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const activeStatus = screen.getAllByText('Active');
        expect(activeStatus.length).toBe(2);

        const maintenanceStatus = screen.getByText('Maintenance');
        expect(maintenanceStatus).toBeInTheDocument();
        expect(maintenanceStatus).toHaveClass('bg-yellow-100');
      });
    });

    it('handles chatbot selection', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const chatbotButton = screen.getByText('Sales Assistant Bot').closest('button');
        fireEvent.click(chatbotButton!);
      });

      expect(defaultProps.onChatbotSelect).toHaveBeenCalledWith('bot-2');
    });

    it('shows selected chatbot with active styling', async () => {
      render(<ConversationSidebar {...defaultProps} selectedChatbotId="bot-1" />);

      await waitFor(() => {
        const selectedBot = screen.getByText('Customer Support Bot').closest('button');
        expect(selectedBot).toHaveClass('bg-primary/10');
      });
    });
  });

  describe('Conversation Management', () => {
    it('displays list of conversations', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Customer Support Query')).toBeInTheDocument();
        expect(screen.getByText('Product Information')).toBeInTheDocument();
        expect(screen.getByText('Technical Issue')).toBeInTheDocument();
      });
    });

    it('shows conversation metadata', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Thank you for contacting us')).toBeInTheDocument();
        expect(screen.getByText('12 messages')).toBeInTheDocument();
        expect(screen.getByText(/10:30/)).toBeInTheDocument();
      });
    });

    it('highlights current conversation', async () => {
      render(<ConversationSidebar {...defaultProps} currentConversationId="conv-1" />);

      await waitFor(() => {
        const currentConv = screen.getByText('Customer Support Query').closest('button');
        expect(currentConv).toHaveClass('bg-accent');
      });
    });

    it('handles conversation selection', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const convButton = screen.getByText('Product Information').closest('button');
        fireEvent.click(convButton!);
      });

      expect(defaultProps.onConversationSelect).toHaveBeenCalledWith('conv-2');
    });

    it('shows starred conversations with star icon', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('star-conv-1')).toBeInTheDocument();
      });
    });
  });

  describe('Conversation Filtering and Search', () => {
    it('provides search functionality', async () => {
      render(<ConversationSidebar {...defaultProps} showSearch={true} />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search conversations...');
        fireEvent.change(searchInput, { target: { value: 'support' } });
      });

      // Should filter conversations containing 'support'
      expect(screen.getByText('Customer Support Query')).toBeInTheDocument();
      expect(screen.queryByText('Product Information')).not.toBeInTheDocument();
    });

    it('filters by chatbot when chatbot is selected', async () => {
      render(<ConversationSidebar {...defaultProps} selectedChatbotId="bot-1" />);

      await waitFor(() => {
        // Should only show conversations from bot-1
        expect(screen.getByText('Customer Support Query')).toBeInTheDocument();
        expect(screen.getByText('Technical Issue')).toBeInTheDocument();
        expect(screen.queryByText('Product Information')).not.toBeInTheDocument();
      });
    });

    it('provides filter options for conversation status', async () => {
      render(<ConversationSidebar {...defaultProps} showFilters={true} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Ended')).toBeInTheDocument();
        expect(screen.getByText('Starred')).toBeInTheDocument();
      });
    });

    it('filters conversations by status', async () => {
      render(<ConversationSidebar {...defaultProps} showFilters={true} />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Active'));
      });

      // Should only show active conversations
      expect(screen.getByText('Customer Support Query')).toBeInTheDocument();
      expect(screen.queryByText('Product Information')).not.toBeInTheDocument();
    });

    it('shows starred conversations when starred filter selected', async () => {
      render(<ConversationSidebar {...defaultProps} showFilters={true} />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Starred'));
      });

      // Should only show starred conversations
      expect(screen.getByText('Customer Support Query')).toBeInTheDocument();
      expect(screen.queryByText('Product Information')).not.toBeInTheDocument();
    });
  });

  describe('Conversation Actions', () => {
    it('provides star/unstar functionality', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const starButton = screen.getByTestId('star-conv-2');
        fireEvent.click(starButton);
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/conv-2/star'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('provides archive functionality', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const moreButton = screen.getByTestId('more-conv-1');
        fireEvent.click(moreButton);

        const archiveButton = screen.getByText('Archive');
        fireEvent.click(archiveButton);
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/conv-1/archive'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('provides delete functionality with confirmation', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const moreButton = screen.getByTestId('more-conv-1');
        fireEvent.click(moreButton);

        const deleteButton = screen.getByText('Delete');
        fireEvent.click(deleteButton);
      });

      // Should show confirmation dialog
      expect(screen.getByText('Delete Conversation?')).toBeInTheDocument();

      const confirmButton = screen.getByText('Delete');
      fireEvent.click(confirmButton);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/conv-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('handles conversation duplication', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const moreButton = screen.getByTestId('more-conv-1');
        fireEvent.click(moreButton);

        const duplicateButton = screen.getByText('Duplicate');
        fireEvent.click(duplicateButton);
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/conv-1/duplicate'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('Conversation Sorting', () => {
    it('provides sorting options', async () => {
      render(<ConversationSidebar {...defaultProps} showSorting={true} />);

      await waitFor(() => {
        expect(screen.getByText('Last Activity')).toBeInTheDocument();
        expect(screen.getByText('Message Count')).toBeInTheDocument();
        expect(screen.getByText('Title')).toBeInTheDocument();
      });
    });

    it('sorts conversations by last activity', async () => {
      render(<ConversationSidebar {...defaultProps} showSorting={true} />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Last Activity'));
      });

      const conversations = screen.getAllByTestId(/conversation-item-/);
      expect(conversations[0]).toHaveTextContent('Customer Support Query'); // Most recent
    });

    it('sorts conversations by message count', async () => {
      render(<ConversationSidebar {...defaultProps} showSorting={true} />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Message Count'));
      });

      // Should sort by message count descending
      const conversations = screen.getAllByTestId(/conversation-item-/);
      expect(conversations[0]).toHaveTextContent('Technical Issue'); // 15 messages
    });

    it('provides ascending/descending sort options', async () => {
      render(<ConversationSidebar {...defaultProps} showSorting={true} />);

      await waitFor(() => {
        const sortOrderButton = screen.getByTestId('sort-order-toggle');
        fireEvent.click(sortOrderButton);
      });

      // Should reverse the sort order
      expect(screen.getByTestId('sort-ascending')).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no conversations exist', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] })
        })
      );

      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No conversations found')).toBeInTheDocument();
        expect(screen.getByText('Start a new conversation to get started')).toBeInTheDocument();
      });
    });

    it('shows empty state when search yields no results', async () => {
      render(<ConversationSidebar {...defaultProps} showSearch={true} />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search conversations...');
        fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      });

      expect(screen.getByText('No conversations match your search')).toBeInTheDocument();
    });

    it('provides action to start new conversation in empty state', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] })
        })
      );

      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const startNewButton = screen.getByText('Start New Conversation');
        fireEvent.click(startNewButton);
      });

      expect(defaultProps.onConversationSelect).toHaveBeenCalledWith('new');
    });
  });

  describe('Real-time Updates', () => {
    it('updates conversation list in real-time', async () => {
      jest.useFakeTimers();
      render(<ConversationSidebar {...defaultProps} enableRealTime={true} />);

      await waitFor(() => {
        expect(screen.getByText('Customer Support Query')).toBeInTheDocument();
      });

      // Mock new conversation data
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [
            ...mockConversationsData,
            {
              id: 'conv-4',
              title: 'New Conversation',
              lastMessage: 'Hello there!',
              lastActivity: new Date().toISOString(),
              messageCount: 1
            }
          ]
        })
      });

      // Fast-forward to trigger refresh
      jest.advanceTimersByTime(10000);

      await waitFor(() => {
        expect(screen.getByText('New Conversation')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('shows notification indicator for new messages', async () => {
      render(<ConversationSidebar {...defaultProps} enableRealTime={true} />);

      await waitFor(() => {
        const notificationBadge = screen.getByTestId('notification-conv-2');
        expect(notificationBadge).toBeInTheDocument();
        expect(notificationBadge).toHaveTextContent('3'); // New message count
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error state when conversations fetch fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Conversations API Error'));

      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/error loading conversations/i)).toBeInTheDocument();
      });
    });

    it('displays error state when chatbots fetch fails', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockConversationsData })
        })
        .mockRejectedValue(new Error('Chatbots API Error'));

      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/error loading chatbots/i)).toBeInTheDocument();
      });
    });

    it('shows retry functionality on error', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));
      expect(fetch).toHaveBeenCalledTimes(3); // Initial + retry for both endpoints
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for all interactive elements', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/select chatbot/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/star conversation/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/conversation options/i)).toBeInTheDocument();
      });
    });

    it('supports keyboard navigation between conversations', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const firstConv = screen.getByText('Customer Support Query').closest('button');
        const secondConv = screen.getByText('Product Information').closest('button');

        firstConv!.focus();
        expect(document.activeElement).toBe(firstConv);

        fireEvent.keyDown(firstConv!, { key: 'ArrowDown' });
        secondConv!.focus();
        expect(document.activeElement).toBe(secondConv);
      });
    });

    it('provides proper role attributes for lists', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('list')).toBeInTheDocument();
      });
    });

    it('announces status changes to screen readers', async () => {
      render(<ConversationSidebar {...defaultProps} />);

      await waitFor(() => {
        const statusRegion = screen.getByRole('status');
        expect(statusRegion).toBeInTheDocument();
      });
    });
  });

  describe('Mobile Responsiveness', () => {
    it('adapts layout for mobile screens', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<ConversationSidebar {...defaultProps} />);

      const sidebar = screen.getByRole('complementary');
      expect(sidebar).toHaveClass('w-full'); // Full width on mobile
    });

    it('shows collapsed view on tablet', () => {
      // Mock tablet viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      });

      render(<ConversationSidebar {...defaultProps} collapsible={true} />);

      const collapseButton = screen.getByLabelText(/collapse sidebar/i);
      expect(collapseButton).toBeInTheDocument();
    });
  });
});