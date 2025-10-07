import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatPage from '@/app/chat/page';
import { LiveChatInterface } from '@/components/chat/live-chat-interface';
import { ConversationSidebar } from '@/components/chat/conversation-sidebar';

// Mock Next.js router
const mockRouter = {
  pathname: '/chat',
  asPath: '/chat',
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
  permissions: ['chat:read', 'chat:write', 'conversations:manage'],
};

jest.mock('@/contexts/user-context', () => ({
  useUser: () => mockUser,
}));

// Mock WebSocket with enhanced functionality
class MockWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = WebSocket.CONNECTING;
  static instances: MockWebSocket[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 100);
  }

  send(data: string) {
    const message = JSON.parse(data);

    // Simulate server response based on message type
    setTimeout(() => {
      if (message.type === 'chat_message') {
        this.simulateMessageResponse(message);
      } else if (message.type === 'typing_start') {
        this.simulateTypingIndicator();
      } else if (message.type === 'join_conversation') {
        this.simulateConversationJoin(message);
      }
    }, 150); // Simulate network latency
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
    MockWebSocket.instances = MockWebSocket.instances.filter(instance => instance !== this);
  }

  // Simulate incoming message response
  simulateMessageResponse(originalMessage: any) {
    if (this.readyState === WebSocket.OPEN) {
      const response = {
        type: 'message_response',
        data: {
          id: `msg-${Date.now()}`,
          conversationId: originalMessage.conversationId,
          role: 'assistant',
          content: `Response to: ${originalMessage.content}`,
          timestamp: new Date().toISOString(),
          metadata: {
            model: 'claude-3-sonnet',
            tokens: 25,
            processingTime: 850,
          },
        },
      };

      this.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify(response),
      }));
    }
  }

  // Simulate typing indicator
  simulateTypingIndicator() {
    if (this.readyState === WebSocket.OPEN) {
      this.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'typing_indicator',
          data: { isTyping: true },
        }),
      }));

      setTimeout(() => {
        this.onmessage?.(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'typing_indicator',
            data: { isTyping: false },
          }),
        }));
      }, 2000);
    }
  }

  // Simulate conversation join confirmation
  simulateConversationJoin(message: any) {
    if (this.readyState === WebSocket.OPEN) {
      this.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'conversation_joined',
          data: {
            conversationId: message.conversationId,
            participants: ['user-123', 'assistant'],
            status: 'active',
          },
        }),
      }));
    }
  }

  // Simulate real-time events
  static simulateEvent(eventType: string, data: any) {
    MockWebSocket.instances.forEach(instance => {
      if (instance.readyState === WebSocket.OPEN) {
        instance.onmessage?.(new MessageEvent('message', {
          data: JSON.stringify({
            type: eventType,
            data,
          }),
        }));
      }
    });
  }

  // Simulate connection issues
  static simulateConnectionIssue() {
    MockWebSocket.instances.forEach(instance => {
      instance.onerror?.(new Event('error'));
      instance.readyState = WebSocket.CLOSED;
      instance.onclose?.(new CloseEvent('close', { code: 1006, reason: 'Connection lost' }));
    });
  }
}

global.WebSocket = MockWebSocket as any;

// Mock API responses
const mockApiResponses = {
  conversations: [
    {
      id: 'conv-1',
      title: 'Customer Support Chat',
      chatbotId: 'bot-1',
      status: 'active',
      lastActivity: new Date().toISOString(),
      messageCount: 15,
      participants: ['user-123'],
    },
    {
      id: 'conv-2',
      title: 'Product Inquiry',
      chatbotId: 'bot-2',
      status: 'completed',
      lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      messageCount: 8,
      participants: ['user-123'],
    },
  ],
  chatbots: [
    {
      id: 'bot-1',
      name: 'Customer Support Bot',
      description: 'Helpful customer service assistant',
      status: 'active',
      model: 'claude-3-sonnet',
      settings: {
        temperature: 0.7,
        maxTokens: 1000,
      },
    },
    {
      id: 'bot-2',
      name: 'Sales Assistant',
      description: 'Product information and sales support',
      status: 'active',
      model: 'claude-3-haiku',
      settings: {
        temperature: 0.5,
        maxTokens: 800,
      },
    },
  ],
  messages: [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello, I need help with my account',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      metadata: { source: 'web' },
    },
    {
      id: 'msg-2',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Hello! I\'d be happy to help you with your account. What specific issue are you experiencing?',
      timestamp: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
      metadata: { model: 'claude-3-sonnet', tokens: 28 },
    },
  ],
};

// Mock fetch API
global.fetch = jest.fn();

const mockFetch = (url: string) => {
  if (url.includes('/api/conversations')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.conversations),
    });
  }
  if (url.includes('/api/chatbots')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.chatbots),
    });
  }
  if (url.includes('/api/messages')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.messages),
    });
  }
  return Promise.reject(new Error(`Unhandled request: ${url}`));
};

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

describe('Chat WebSocket Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockWebSocket.instances = [];
    (global.fetch as jest.Mock).mockImplementation(mockFetch);
  });

  afterEach(() => {
    // Clean up WebSocket instances
    MockWebSocket.instances.forEach(instance => instance.close());
    MockWebSocket.instances = [];
  });

  describe('Chat Page WebSocket Integration', () => {
    it('establishes WebSocket connection on page load', async () => {
      render(
        <TestWrapper>
          <ChatPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('loads initial data and establishes real-time connection', async () => {
      render(
        <TestWrapper>
          <ChatPage />
        </TestWrapper>
      );

      // Verify initial API calls
      await waitFor(() => {
        expect(screen.getByText('Customer Support Chat')).toBeInTheDocument();
        expect(screen.getByText('Product Inquiry')).toBeInTheDocument();
      });

      // Verify WebSocket connection
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');

      // Verify fetch calls for initial data
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chatbots'),
        expect.any(Object)
      );
    });

    it('handles WebSocket connection failures gracefully', async () => {
      // Mock WebSocket constructor to throw error
      global.WebSocket = jest.fn().mockImplementation(() => {
        throw new Error('WebSocket connection failed');
      });

      render(
        <TestWrapper>
          <ChatPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Connection Failed')).toBeInTheDocument();
        expect(screen.getByText('Retry Connection')).toBeInTheDocument();
      });
    });

    it('automatically reconnects after connection loss', async () => {
      render(
        <TestWrapper>
          <ChatPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate connection loss
      act(() => {
        MockWebSocket.simulateConnectionIssue();
      });

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Reconnecting...');
      });

      // Wait for automatic reconnection
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      }, { timeout: 5000 });
    });
  });

  describe('Real-time Messaging Integration', () => {
    it('sends and receives messages through WebSocket', async () => {
      const selectedConversation = mockApiResponses.conversations[0];

      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={selectedConversation}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Type and send a message
      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      fireEvent.change(messageInput, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      // Verify message appears in chat
      expect(screen.getByText('Test message')).toBeInTheDocument();

      // Wait for WebSocket response
      await waitFor(() => {
        expect(screen.getByText('Response to: Test message')).toBeInTheDocument();
      });
    });

    it('displays typing indicators in real-time', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Start typing
      const messageInput = screen.getByPlaceholderText('Type your message...');
      fireEvent.focus(messageInput);
      fireEvent.change(messageInput, { target: { value: 'Test' } });

      // Verify typing indicator appears
      await waitFor(() => {
        expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
        expect(screen.getByText('Bot is typing...')).toBeInTheDocument();
      });

      // Wait for typing to stop
      await waitFor(() => {
        expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('handles message delivery confirmations', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      fireEvent.change(messageInput, { target: { value: 'Delivery test' } });
      fireEvent.click(sendButton);

      // Initially shows as sending
      expect(screen.getByTestId('message-sending')).toBeInTheDocument();

      // Wait for delivery confirmation
      await waitFor(() => {
        expect(screen.getByTestId('message-delivered')).toBeInTheDocument();
        expect(screen.queryByTestId('message-sending')).not.toBeInTheDocument();
      });
    });

    it('handles message failures and retry mechanism', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate connection loss before sending message
      act(() => {
        MockWebSocket.simulateConnectionIssue();
      });

      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      fireEvent.change(messageInput, { target: { value: 'Failed message' } });
      fireEvent.click(sendButton);

      // Verify failure state
      await waitFor(() => {
        expect(screen.getByText('Failed to send message')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Retry the message
      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('Failed message')).toBeInTheDocument();
      });
    });
  });

  describe('Conversation Management Integration', () => {
    it('updates conversation list in real-time', async () => {
      render(
        <TestWrapper>
          <ConversationSidebar />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Customer Support Chat')).toBeInTheDocument();
        expect(screen.getByText('Product Inquiry')).toBeInTheDocument();
      });

      // Simulate new conversation via WebSocket
      act(() => {
        MockWebSocket.simulateEvent('new_conversation', {
          id: 'conv-3',
          title: 'New Live Chat',
          chatbotId: 'bot-1',
          status: 'active',
          lastActivity: new Date().toISOString(),
          messageCount: 1,
        });
      });

      await waitFor(() => {
        expect(screen.getByText('New Live Chat')).toBeInTheDocument();
      });
    });

    it('handles conversation status updates', async () => {
      render(
        <TestWrapper>
          <ConversationSidebar />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Customer Support Chat')).toBeInTheDocument();
      });

      // Simulate conversation status change
      act(() => {
        MockWebSocket.simulateEvent('conversation_status_update', {
          conversationId: 'conv-1',
          status: 'completed',
          timestamp: new Date().toISOString(),
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('conversation-status-completed')).toBeInTheDocument();
      });
    });

    it('synchronizes conversation selection across components', async () => {
      render(
        <TestWrapper>
          <div>
            <ConversationSidebar />
            <LiveChatInterface
              chatbot={mockApiResponses.chatbots[0]}
              conversation={mockApiResponses.conversations[0]}
            />
          </div>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Customer Support Chat')).toBeInTheDocument();
      });

      // Select a conversation
      fireEvent.click(screen.getByText('Product Inquiry'));

      await waitFor(() => {
        // Verify the chat interface updates
        expect(screen.getByTestId('active-conversation')).toHaveAttribute(
          'data-conversation-id',
          'conv-2'
        );
      });
    });

    it('handles conversation participant updates', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate participant join
      act(() => {
        MockWebSocket.simulateEvent('participant_joined', {
          conversationId: 'conv-1',
          participant: {
            id: 'user-456',
            name: 'Support Agent',
            role: 'agent',
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Support Agent joined the conversation')).toBeInTheDocument();
      });
    });
  });

  describe('Multi-Connection Management', () => {
    it('handles multiple WebSocket connections efficiently', async () => {
      render(
        <TestWrapper>
          <div>
            <ConversationSidebar />
            <LiveChatInterface
              chatbot={mockApiResponses.chatbots[0]}
              conversation={mockApiResponses.conversations[0]}
            />
          </div>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(MockWebSocket.instances).toHaveLength(2);
      });

      // Verify both connections are active
      MockWebSocket.instances.forEach(instance => {
        expect(instance.readyState).toBe(WebSocket.OPEN);
      });
    });

    it('synchronizes events across multiple connections', async () => {
      render(
        <TestWrapper>
          <div>
            <ConversationSidebar />
            <LiveChatInterface
              chatbot={mockApiResponses.chatbots[0]}
              conversation={mockApiResponses.conversations[0]}
            />
          </div>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(MockWebSocket.instances).toHaveLength(2);
      });

      // Simulate a global event
      act(() => {
        MockWebSocket.simulateEvent('conversation_update', {
          conversationId: 'conv-1',
          lastActivity: new Date().toISOString(),
          messageCount: 16,
        });
      });

      // Verify both components receive the update
      await waitFor(() => {
        expect(screen.getByText('16 messages')).toBeInTheDocument();
      });
    });

    it('handles connection cleanup on component unmount', async () => {
      const { unmount } = render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(MockWebSocket.instances).toHaveLength(1);
      });

      unmount();

      // Verify connection is closed
      expect(MockWebSocket.instances).toHaveLength(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('handles WebSocket errors gracefully', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate WebSocket error
      act(() => {
        MockWebSocket.instances[0]?.onerror?.(new Event('error'));
      });

      await waitFor(() => {
        expect(screen.getByText('Connection error')).toBeInTheDocument();
        expect(screen.getByText('Attempting to reconnect...')).toBeInTheDocument();
      });
    });

    it('implements exponential backoff for reconnection attempts', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
            reconnectOptions={{ maxAttempts: 3, backoffMultiplier: 2 }}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate multiple connection failures
      for (let i = 0; i < 3; i++) {
        act(() => {
          MockWebSocket.simulateConnectionIssue();
        });

        await waitFor(() => {
          expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
        });
      }

      // After max attempts, should show permanent error
      await waitFor(() => {
        expect(screen.getByText('Connection failed permanently')).toBeInTheDocument();
        expect(screen.getByText('Manual reconnection required')).toBeInTheDocument();
      });
    });

    it('handles malformed WebSocket messages', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Send malformed message
      act(() => {
        MockWebSocket.instances[0]?.onmessage?.(new MessageEvent('message', {
          data: 'invalid json',
        }));
      });

      // Should not crash, should continue working
      const messageInput = screen.getByPlaceholderText('Type your message...');
      fireEvent.change(messageInput, { target: { value: 'Test after error' } });

      expect(screen.getByDisplayValue('Test after error')).toBeInTheDocument();
    });

    it('maintains message queue during connection issues', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate connection loss
      act(() => {
        MockWebSocket.simulateConnectionIssue();
      });

      // Send message while disconnected
      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      fireEvent.change(messageInput, { target: { value: 'Queued message' } });
      fireEvent.click(sendButton);

      // Message should be queued
      expect(screen.getByText('Message queued for sending')).toBeInTheDocument();

      // Reconnect
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Queued message should be sent
      await waitFor(() => {
        expect(screen.getByText('Queued message')).toBeInTheDocument();
        expect(screen.queryByText('Message queued for sending')).not.toBeInTheDocument();
      });
    });
  });

  describe('Performance and Optimization', () => {
    it('efficiently handles high-frequency WebSocket messages', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Send many rapid updates
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        act(() => {
          MockWebSocket.simulateEvent('typing_indicator', {
            isTyping: i % 2 === 0,
          });
        });
      }

      const endTime = performance.now();

      // Should handle updates efficiently (< 100ms for 100 updates)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('implements message deduplication', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Send duplicate messages
      const duplicateMessage = {
        id: 'msg-duplicate',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Duplicate message',
        timestamp: new Date().toISOString(),
      };

      act(() => {
        MockWebSocket.simulateEvent('new_message', duplicateMessage);
        MockWebSocket.simulateEvent('new_message', duplicateMessage);
        MockWebSocket.simulateEvent('new_message', duplicateMessage);
      });

      // Should only appear once
      expect(screen.getAllByText('Duplicate message')).toHaveLength(1);
    });

    it('manages memory efficiently with long conversations', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
            maxVisibleMessages={50}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate many messages
      for (let i = 0; i < 100; i++) {
        act(() => {
          MockWebSocket.simulateEvent('new_message', {
            id: `msg-${i}`,
            conversationId: 'conv-1',
            role: 'user',
            content: `Message ${i}`,
            timestamp: new Date().toISOString(),
          });
        });
      }

      // Should only render visible messages
      const messageElements = screen.getAllByTestId(/message-/);
      expect(messageElements.length).toBeLessThanOrEqual(50);
    });
  });

  describe('User Experience Integration', () => {
    it('provides visual feedback for all connection states', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      // Initial connecting state
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Connecting...');

      // Connected state
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
        expect(screen.getByTestId('connection-indicator')).toHaveClass('status-connected');
      });

      // Disconnected state
      act(() => {
        MockWebSocket.simulateConnectionIssue();
      });

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Disconnected');
        expect(screen.getByTestId('connection-indicator')).toHaveClass('status-disconnected');
      });
    });

    it('maintains chat history during connection interruptions', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Hello, I need help with my account')).toBeInTheDocument();
      });

      // Simulate connection loss and reconnection
      act(() => {
        MockWebSocket.simulateConnectionIssue();
      });

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Reconnecting...');
      });

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Chat history should be preserved
      expect(screen.getByText('Hello, I need help with my account')).toBeInTheDocument();
    });

    it('provides contextual help for connection issues', async () => {
      render(
        <TestWrapper>
          <LiveChatInterface
            chatbot={mockApiResponses.chatbots[0]}
            conversation={mockApiResponses.conversations[0]}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });

      // Simulate network error
      act(() => {
        MockWebSocket.instances[0]?.onerror?.(new Event('error'));
      });

      await waitFor(() => {
        expect(screen.getByText('Connection Issues?')).toBeInTheDocument();
        expect(screen.getByText('Check your internet connection')).toBeInTheDocument();
        expect(screen.getByText('Contact Support')).toBeInTheDocument();
      });
    });
  });
});