import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';

// Mock Next.js router
const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  pathname: '/dashboard/chatbots',
  query: {},
  asPath: '/dashboard/chatbots',
  route: '/dashboard/chatbots'
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Create a test wrapper for the chatbot dashboard page
import ChatbotsPage from '@/app/dashboard/chatbots/page';

const mockChatbots = [
  {
    id: 'chatbot-1',
    name: 'Test Chatbot 1',
    description: 'A test chatbot for unit testing',
    status: 'active' as const,
    apiKeyHint: 'cb_test_***',
    configuration: {
      model: 'nova-micro',
      temperature: 0.7,
      maxTokens: 1000,
      language: 'en',
      responseTimeout: 30000,
    },
    conversationCount: 42,
    userCount: 15,
    lastActivity: '2025-10-03T07:00:00Z',
    createdAt: '2025-10-01T10:00:00Z',
    updatedAt: '2025-10-03T07:00:00Z',
  },
  {
    id: 'chatbot-2',
    name: 'Test Chatbot 2',
    description: 'Another test chatbot',
    status: 'inactive' as const,
    apiKeyHint: 'cb_test2_***',
    configuration: {
      model: 'claude-3-haiku',
      temperature: 0.5,
      maxTokens: 2000,
      language: 'en',
      responseTimeout: 45000,
    },
    conversationCount: 8,
    userCount: 3,
    lastActivity: '2025-10-02T15:30:00Z',
    createdAt: '2025-09-28T14:20:00Z',
    updatedAt: '2025-10-02T15:30:00Z',
  },
];

const mockApiResponse = {
  success: true,
  data: {
    chatbots: mockChatbots,
    pagination: {
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    },
  },
};

describe('Chatbot Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });
  });

  it('renders the chatbot dashboard with basic elements', async () => {
    render(<ChatbotsPage />);

    // Check for main dashboard elements
    expect(screen.getByText('Chatbots')).toBeInTheDocument();
    expect(screen.getByText('Manage your AI chatbots')).toBeInTheDocument();
    expect(screen.getByText('Create New Chatbot')).toBeInTheDocument();

    // Wait for chatbots to load
    await waitFor(() => {
      expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
      expect(screen.getByText('Test Chatbot 2')).toBeInTheDocument();
    });
  });

  it('displays chatbot cards with correct information', async () => {
    render(<ChatbotsPage />);

    await waitFor(() => {
      // Check first chatbot details
      expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
      expect(screen.getByText('A test chatbot for unit testing')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument(); // conversation count
      expect(screen.getByText('15')).toBeInTheDocument(); // user count

      // Check status badges
      const activeStatus = screen.getByText('Active');
      expect(activeStatus).toBeInTheDocument();
      expect(activeStatus).toHaveClass('bg-green-100', 'text-green-800');

      const inactiveStatus = screen.getByText('Inactive');
      expect(inactiveStatus).toBeInTheDocument();
      expect(inactiveStatus).toHaveClass('bg-gray-100', 'text-gray-800');
    });
  });

  it('filters chatbots by search query', async () => {
    const user = userEvent.setup();
    render(<ChatbotsPage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
      expect(screen.getByText('Test Chatbot 2')).toBeInTheDocument();
    });

    // Search for specific chatbot
    const searchInput = screen.getByPlaceholderText('Search chatbots...');
    await user.type(searchInput, 'Test Chatbot 1');

    // Should show only matching chatbot
    expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Chatbot 2')).not.toBeInTheDocument();
  });

  it('filters chatbots by status', async () => {
    const user = userEvent.setup();
    render(<ChatbotsPage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
      expect(screen.getByText('Test Chatbot 2')).toBeInTheDocument();
    });

    // Filter by active status
    const statusFilter = screen.getByDisplayValue('All Status');
    await user.click(statusFilter);
    await user.click(screen.getByText('Active'));

    // Should show only active chatbot
    expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Chatbot 2')).not.toBeInTheDocument();
  });

  it('handles bulk selection of chatbots', async () => {
    const user = userEvent.setup();
    render(<ChatbotsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
    });

    // Select all chatbots
    const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
    await user.click(selectAllCheckbox);

    // Check that selection count is updated
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    // Check that bulk actions toolbar appears
    expect(screen.getByText('Bulk Actions')).toBeInTheDocument();
    expect(screen.getByText('Activate Selected')).toBeInTheDocument();
    expect(screen.getByText('Deactivate Selected')).toBeInTheDocument();
  });

  it('navigates to chatbot details when clicking on a chatbot', async () => {
    const user = userEvent.setup();
    render(<ChatbotsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
    });

    // Click on configure button
    const configureButtons = screen.getAllByText('Configure');
    await user.click(configureButtons[0]);

    expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots/chatbot-1');
  });

  it('opens create chatbot modal', async () => {
    const user = userEvent.setup();
    render(<ChatbotsPage />);

    const createButton = screen.getByText('Create New Chatbot');
    await user.click(createButton);

    expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots/create');
  });

  it('handles API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

    render(<ChatbotsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load chatbots')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching data', () => {
    // Make fetch never resolve to show loading state
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(<ChatbotsPage />);

    // Should show skeleton loading cards
    const skeletonCards = screen.getAllByTestId('skeleton-card');
    expect(skeletonCards).toHaveLength(6); // Default skeleton count
  });

  it('handles real-time updates toggle', async () => {
    const user = userEvent.setup();
    render(<ChatbotsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Chatbot 1')).toBeInTheDocument();
    });

    // Toggle real-time updates
    const realtimeToggle = screen.getByRole('switch', { name: /real-time updates/i });
    await user.click(realtimeToggle);

    // Verify the toggle state changed
    expect(realtimeToggle).toBeChecked();
  });

  it('displays performance metrics correctly', async () => {
    render(<ChatbotsPage />);

    await waitFor(() => {
      // Check for performance metrics cards
      expect(screen.getByText('Total Chatbots')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText('Performance')).toBeInTheDocument();

      // Check calculated values
      expect(screen.getByText('2')).toBeInTheDocument(); // total chatbots
      expect(screen.getByText('18')).toBeInTheDocument(); // total users (15 + 3)
    });
  });

  it('handles empty state when no chatbots exist', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          chatbots: [],
          pagination: {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
          },
        },
      }),
    });

    render(<ChatbotsPage />);

    await waitFor(() => {
      expect(screen.getByText('No chatbots found')).toBeInTheDocument();
      expect(screen.getByText('Create your first chatbot to get started')).toBeInTheDocument();
    });
  });
});