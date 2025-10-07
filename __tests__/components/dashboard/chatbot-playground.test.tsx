import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';

// Mock Next.js router
const mockRouter = {
  push: jest.fn(),
  pathname: '/dashboard/chatbots/test-id/playground',
  query: { id: 'test-id' },
  asPath: '/dashboard/chatbots/test-id/playground',
  route: '/dashboard/chatbots/[id]/playground'
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: 'test-id' }),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

import PlaygroundPage from '@/app/dashboard/chatbots/[id]/playground/page';

const mockChatbot = {
  id: 'test-id',
  name: 'Test Chatbot',
  description: 'A test chatbot for playground testing',
  status: 'active',
  configuration: {
    model: 'nova-micro',
    temperature: 0.7,
    maxTokens: 1000,
    language: 'en',
    responseTimeout: 30000,
  },
  systemPrompt: 'You are a helpful assistant.',
};

const mockConversation = [
  {
    id: 'msg-1',
    role: 'user',
    message: 'Hello, how are you?',
    timestamp: '2025-10-03T10:00:00Z',
    metadata: {},
  },
  {
    id: 'msg-2',
    role: 'assistant',
    message: 'Hello! I\'m doing well, thank you for asking. How can I help you today?',
    timestamp: '2025-10-03T10:00:05Z',
    metadata: {
      responseTime: 1250,
      tokensUsed: 28,
      vectorSearchResults: [],
    },
  },
];

describe('Chatbot Playground', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockChatbot }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { messages: mockConversation } }),
      });
  });

  it('renders the playground interface with all sections', async () => {
    render(<PlaygroundPage />);

    // Check for main elements
    expect(screen.getByText('Playground')).toBeInTheDocument();
    expect(screen.getByText('Test and interact with your chatbot')).toBeInTheDocument();

    await waitFor(() => {
      // Check for chat interface
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
      expect(screen.getByText('Send')).toBeInTheDocument();

      // Check for configuration panel
      expect(screen.getByText('Configuration Override')).toBeInTheDocument();
      expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    });
  });

  it('displays existing conversation messages', async () => {
    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
      expect(screen.getByText('Hello! I\'m doing well, thank you for asking. How can I help you today?')).toBeInTheDocument();
    });
  });

  it('sends a new message and displays response', async () => {
    const user = userEvent.setup();

    // Mock the chat API response
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          message: 'This is a test response',
          messageId: 'msg-3',
          sessionId: 'session-1',
          timestamp: '2025-10-03T10:05:00Z',
          tokensUsed: 15,
          responseTime: 980,
          vectorSearchResults: [],
        },
      }),
    });

    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Type a message
    const messageInput = screen.getByPlaceholderText('Type your message...');
    await user.type(messageInput, 'What can you help me with?');

    // Send the message
    const sendButton = screen.getByText('Send');
    await user.click(sendButton);

    // Should show loading state
    expect(screen.getByText('Sending...')).toBeInTheDocument();

    // Should display the new message and response
    await waitFor(() => {
      expect(screen.getByText('What can you help me with?')).toBeInTheDocument();
      expect(screen.getByText('This is a test response')).toBeInTheDocument();
    });

    // Input should be cleared
    expect(messageInput).toHaveValue('');
  });

  it('handles configuration overrides', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByText('Configuration Override')).toBeInTheDocument();
    });

    // Change temperature override
    const temperatureSlider = screen.getByRole('slider', { name: /temperature/i });
    fireEvent.change(temperatureSlider, { target: { value: '0.9' } });

    // Change max tokens
    const maxTokensInput = screen.getByDisplayValue('1000');
    await user.clear(maxTokensInput);
    await user.type(maxTokensInput, '1500');

    // Override system prompt
    const systemPromptTextarea = screen.getByDisplayValue('You are a helpful assistant.');
    await user.clear(systemPromptTextarea);
    await user.type(systemPromptTextarea, 'You are a creative writing assistant.');

    // Verify overrides are applied
    expect(temperatureSlider).toHaveValue('0.9');
    expect(screen.getByDisplayValue('1500')).toBeInTheDocument();
    expect(screen.getByDisplayValue('You are a creative writing assistant.')).toBeInTheDocument();
  });

  it('displays performance metrics correctly', async () => {
    render(<PlaygroundPage />);

    await waitFor(() => {
      // Check for metrics display
      expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
      expect(screen.getByText('Response Time')).toBeInTheDocument();
      expect(screen.getByText('Tokens Used')).toBeInTheDocument();
      expect(screen.getByText('Messages')).toBeInTheDocument();

      // Check for metric values from existing conversation
      expect(screen.getByText('1.25s')).toBeInTheDocument(); // response time
      expect(screen.getByText('28')).toBeInTheDocument(); // tokens used
      expect(screen.getByText('2')).toBeInTheDocument(); // message count
    });
  });

  it('exports conversation in different formats', async () => {
    const user = userEvent.setup();

    // Mock URL.createObjectURL and download functionality
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
    const mockLink = {
      click: jest.fn(),
      setAttribute: jest.fn(),
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    jest.spyOn(document.body, 'appendChild').mockImplementation();
    jest.spyOn(document.body, 'removeChild').mockImplementation();

    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    // Test JSON export
    const exportButton = screen.getByText('Export');
    await user.click(exportButton);

    const jsonOption = screen.getByText('JSON');
    await user.click(jsonOption);

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('clears conversation when requested', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    });

    // Click clear conversation
    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);

    // Confirm in dialog
    const confirmButton = screen.getByText('Yes, clear conversation');
    await user.click(confirmButton);

    // Messages should be cleared
    await waitFor(() => {
      expect(screen.queryByText('Hello, how are you?')).not.toBeInTheDocument();
      expect(screen.getByText('Start a conversation...')).toBeInTheDocument();
    });
  });

  it('handles vector search results display', async () => {
    const user = userEvent.setup();

    // Mock response with vector search results
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          message: 'Based on the knowledge base, here is the answer...',
          messageId: 'msg-4',
          sessionId: 'session-1',
          timestamp: '2025-10-03T10:10:00Z',
          tokensUsed: 45,
          responseTime: 1500,
          vectorSearchResults: [
            {
              id: 'doc-1',
              title: 'Documentation Page 1',
              content: 'This is relevant content from the knowledge base',
              similarity: 0.85,
              metadata: { source: 'documentation' },
            },
            {
              id: 'doc-2',
              title: 'FAQ Item',
              content: 'Frequently asked question answer',
              similarity: 0.78,
              metadata: { source: 'faq' },
            },
          ],
        },
      }),
    });

    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Send a message that would trigger vector search
    const messageInput = screen.getByPlaceholderText('Type your message...');
    await user.type(messageInput, 'What is the documentation about?');

    const sendButton = screen.getByText('Send');
    await user.click(sendButton);

    // Should display vector search results
    await waitFor(() => {
      expect(screen.getByText('Knowledge Sources Used:')).toBeInTheDocument();
      expect(screen.getByText('Documentation Page 1')).toBeInTheDocument();
      expect(screen.getByText('FAQ Item')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument(); // similarity score
      expect(screen.getByText('78%')).toBeInTheDocument();
    });
  });

  it('handles debug mode toggle', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByText('Debug Mode')).toBeInTheDocument();
    });

    // Toggle debug mode
    const debugToggle = screen.getByRole('switch', { name: /debug mode/i });
    await user.click(debugToggle);

    expect(debugToggle).toBeChecked();

    // Debug information should be visible in subsequent messages
    expect(screen.getByText('Show detailed response metadata')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();

    // Mock API error
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Chat API failed'));

    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Try to send a message
    const messageInput = screen.getByPlaceholderText('Type your message...');
    await user.type(messageInput, 'Test message');

    const sendButton = screen.getByText('Send');
    await user.click(sendButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Failed to send message')).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });
  });

  it('supports keyboard shortcuts', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    // Type a message
    const messageInput = screen.getByPlaceholderText('Type your message...');
    await user.type(messageInput, 'Test message');

    // Press Enter to send (instead of clicking Send button)
    await user.keyboard('{Enter}');

    // Should send the message
    expect(screen.getByText('Sending...')).toBeInTheDocument();
  });
});