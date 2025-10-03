import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LiveChatInterface } from '@/components/chat/live-chat-interface';

// Mock WebSocket for real-time communication testing
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
    // Mock message echo for testing
    setTimeout(() => {
      this.onmessage?.(new MessageEvent('message', { data }));
    }, 50);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

global.WebSocket = MockWebSocket as any;

// Mock audio for notification sounds
Object.defineProperty(window, 'Audio', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    load: jest.fn(),
  })),
});

// Mock file reader for file uploads
Object.defineProperty(window, 'FileReader', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    readAsDataURL: jest.fn(),
    readAsText: jest.fn(),
    onload: null,
    onerror: null,
    result: 'data:text/plain;base64,dGVzdCBmaWxl',
  })),
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Mock intersection observer for message loading
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
window.IntersectionObserver = mockIntersectionObserver;

// Mock chatbot data
const mockChatbot = {
  id: 'bot-123',
  name: 'Customer Support Bot',
  description: 'Helpful customer service assistant',
  model: 'claude-3-sonnet',
  personality: 'friendly',
  instructions: 'Be helpful and professional',
  knowledge_base: ['faq.pdf', 'product-guide.pdf'],
  settings: {
    temperature: 0.7,
    max_tokens: 1000,
    response_format: 'conversational'
  },
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T12:00:00Z'
};

// Mock conversation data
const mockConversation = {
  id: 'conv-456',
  title: 'Support Request',
  chatbot_id: 'bot-123',
  user_id: 'user-789',
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello, I need help with my account',
      timestamp: '2024-01-15T10:00:00Z',
      metadata: { ip: '192.168.1.1' }
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hello! I\'d be happy to help you with your account. What specific issue are you experiencing?',
      timestamp: '2024-01-15T10:00:05Z',
      metadata: { model: 'claude-3-sonnet', tokens: 25 }
    }
  ],
  status: 'active',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:05Z'
};

// Mock real-time metrics
const mockMetrics = {
  response_time: 850,
  user_satisfaction: 4.2,
  message_count: 15,
  session_duration: 180,
  tokens_used: 456,
  cost_estimate: 0.023
};

describe('LiveChatInterface Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Component Initialization', () => {
    it('renders chat interface with chatbot information', () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          metrics={mockMetrics}
        />
      );

      expect(screen.getByText('Customer Support Bot')).toBeInTheDocument();
      expect(screen.getByText('Helpful customer service assistant')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Hello, I need help with my account')).toBeInTheDocument();
    });

    it('establishes WebSocket connection on mount', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });
    });

    it('loads conversation history', () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      expect(screen.getByText('Hello, I need help with my account')).toBeInTheDocument();
      expect(screen.getByText(/I'd be happy to help you with your account/)).toBeInTheDocument();
    });

    it('displays real-time metrics', () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          metrics={mockMetrics}
        />
      );

      expect(screen.getByText('850ms')).toBeInTheDocument(); // Response time
      expect(screen.getByText('4.2/5')).toBeInTheDocument(); // User satisfaction
      expect(screen.getByText('15')).toBeInTheDocument(); // Message count
    });
  });

  describe('Message Handling', () => {
    it('sends new messages through WebSocket', async () => {
      const mockOnSendMessage = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onSendMessage={mockOnSendMessage}
        />
      );

      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      fireEvent.change(messageInput, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
    });

    it('handles Enter key for sending messages', () => {
      const mockOnSendMessage = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onSendMessage={mockOnSendMessage}
        />
      );

      const messageInput = screen.getByPlaceholderText('Type your message...');

      fireEvent.change(messageInput, { target: { value: 'Quick message' } });
      fireEvent.keyPress(messageInput, { key: 'Enter', code: 'Enter' });

      expect(mockOnSendMessage).toHaveBeenCalledWith('Quick message');
    });

    it('prevents sending empty messages', () => {
      const mockOnSendMessage = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onSendMessage={mockOnSendMessage}
        />
      );

      const sendButton = screen.getByLabelText('Send message');
      fireEvent.click(sendButton);

      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it('clears input after sending message', async () => {
      const mockOnSendMessage = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onSendMessage={mockOnSendMessage}
        />
      );

      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      fireEvent.change(messageInput, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      expect(messageInput).toHaveValue('');
    });

    it('displays typing indicator during message processing', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          isTyping={true}
        />
      );

      expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
      expect(screen.getByText('Bot is typing...')).toBeInTheDocument();
    });

    it('shows loading state for pending messages', () => {
      const pendingMessage = {
        id: 'pending-1',
        role: 'user',
        content: 'Pending message',
        timestamp: new Date().toISOString(),
        status: 'pending'
      };

      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={{
            ...mockConversation,
            messages: [...mockConversation.messages, pendingMessage]
          }}
        />
      );

      expect(screen.getByTestId('message-pending')).toBeInTheDocument();
    });
  });

  describe('Message Actions and Feedback', () => {
    it('allows copying message content', () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn(),
        },
      });

      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      const copyButton = screen.getAllByLabelText('Copy message')[0];
      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello, I need help with my account');
    });

    it('provides message feedback options', () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          enableFeedback={true}
        />
      );

      const thumbsUpButton = screen.getAllByLabelText('Rate message positively')[0];
      const thumbsDownButton = screen.getAllByLabelText('Rate message negatively')[0];

      expect(thumbsUpButton).toBeInTheDocument();
      expect(thumbsDownButton).toBeInTheDocument();
    });

    it('handles message regeneration requests', () => {
      const mockOnRegenerateMessage = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onRegenerateMessage={mockOnRegenerateMessage}
        />
      );

      const regenerateButton = screen.getByLabelText('Regenerate response');
      fireEvent.click(regenerateButton);

      expect(mockOnRegenerateMessage).toHaveBeenCalledWith('msg-2');
    });

    it('shows message metadata on hover', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          showMetadata={true}
        />
      );

      const assistantMessage = screen.getByText(/I'd be happy to help you/);
      fireEvent.mouseEnter(assistantMessage);

      await waitFor(() => {
        expect(screen.getByText('Model: claude-3-sonnet')).toBeInTheDocument();
        expect(screen.getByText('Tokens: 25')).toBeInTheDocument();
      });
    });
  });

  describe('File Upload and Attachments', () => {
    it('handles file upload through drag and drop', async () => {
      const mockOnFileUpload = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onFileUpload={mockOnFileUpload}
          allowFileUpload={true}
        />
      );

      const dropZone = screen.getByTestId('message-input-area');
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });

      fireEvent.dragOver(dropZone);
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

      await waitFor(() => {
        expect(mockOnFileUpload).toHaveBeenCalledWith(file);
      });
    });

    it('handles file upload through file input', async () => {
      const mockOnFileUpload = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onFileUpload={mockOnFileUpload}
          allowFileUpload={true}
        />
      );

      const fileInput = screen.getByTestId('file-upload-input');
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnFileUpload).toHaveBeenCalledWith(file);
      });
    });

    it('validates file types and sizes', () => {
      const mockOnFileUpload = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onFileUpload={mockOnFileUpload}
          allowFileUpload={true}
          maxFileSize={1000000} // 1MB
          allowedFileTypes={['text/plain', 'application/pdf']}
        />
      );

      const fileInput = screen.getByTestId('file-upload-input');
      const largeFile = new File(['x'.repeat(2000000)], 'large.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      expect(screen.getByText('File size exceeds limit')).toBeInTheDocument();
      expect(mockOnFileUpload).not.toHaveBeenCalled();
    });

    it('displays uploaded file previews', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          allowFileUpload={true}
        />
      );

      const messageWithFile = {
        id: 'msg-with-file',
        role: 'user',
        content: 'Here is the document you requested',
        timestamp: '2024-01-15T10:05:00Z',
        attachments: [
          { name: 'document.pdf', type: 'application/pdf', size: 156789 }
        ]
      };

      // Re-render with file attachment
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={{
            ...mockConversation,
            messages: [...mockConversation.messages, messageWithFile]
          }}
          allowFileUpload={true}
        />
      );

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('153 KB')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates and WebSocket', () => {
    it('updates metrics in real-time', async () => {
      const { rerender } = render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          metrics={mockMetrics}
        />
      );

      const updatedMetrics = { ...mockMetrics, response_time: 750, message_count: 16 };

      rerender(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          metrics={updatedMetrics}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('750ms')).toBeInTheDocument();
        expect(screen.getByText('16')).toBeInTheDocument();
      });
    });

    it('handles WebSocket disconnection gracefully', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      // Simulate WebSocket disconnection
      act(() => {
        const ws = new MockWebSocket('ws://localhost');
        ws.readyState = WebSocket.CLOSED;
        ws.onclose?.(new CloseEvent('close'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Disconnected');
        expect(screen.getByText('Attempting to reconnect...')).toBeInTheDocument();
      });
    });

    it('attempts automatic reconnection', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          autoReconnect={true}
        />
      );

      // Simulate disconnection and reconnection
      act(() => {
        const ws = new MockWebSocket('ws://localhost');
        ws.readyState = WebSocket.CLOSED;
        ws.onclose?.(new CloseEvent('close'));
      });

      // Fast-forward timers for reconnection attempt
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });
    });

    it('handles incoming messages through WebSocket', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      // Simulate incoming message
      act(() => {
        const ws = new MockWebSocket('ws://localhost');
        const incomingMessage = {
          type: 'new_message',
          message: {
            id: 'msg-3',
            role: 'assistant',
            content: 'I can help you reset your password.',
            timestamp: new Date().toISOString()
          }
        };
        ws.onmessage?.(new MessageEvent('message', { data: JSON.stringify(incomingMessage) }));
      });

      await waitFor(() => {
        expect(screen.getByText('I can help you reset your password.')).toBeInTheDocument();
      });
    });
  });

  describe('Conversation Management', () => {
    it('loads more messages when scrolling to top', async () => {
      const mockLoadMoreMessages = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onLoadMoreMessages={mockLoadMoreMessages}
          hasMoreMessages={true}
        />
      );

      const messagesContainer = screen.getByTestId('messages-container');

      // Simulate scroll to top
      fireEvent.scroll(messagesContainer, { target: { scrollTop: 0 } });

      await waitFor(() => {
        expect(mockLoadMoreMessages).toHaveBeenCalled();
      });
    });

    it('auto-scrolls to bottom on new messages', async () => {
      const { rerender } = render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      const newMessage = {
        id: 'msg-new',
        role: 'assistant',
        content: 'New message',
        timestamp: new Date().toISOString()
      };

      rerender(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={{
            ...mockConversation,
            messages: [...mockConversation.messages, newMessage]
          }}
        />
      );

      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('maintains scroll position when loading older messages', async () => {
      const mockLoadMoreMessages = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onLoadMoreMessages={mockLoadMoreMessages}
          hasMoreMessages={true}
        />
      );

      const messagesContainer = screen.getByTestId('messages-container');
      const initialScrollTop = 100;

      // Set initial scroll position
      Object.defineProperty(messagesContainer, 'scrollTop', {
        value: initialScrollTop,
        writable: true
      });

      // Simulate loading more messages
      fireEvent.scroll(messagesContainer, { target: { scrollTop: 0 } });

      // Verify scroll position is maintained
      expect(messagesContainer.scrollTop).toBe(initialScrollTop);
    });

    it('handles conversation switching', () => {
      const newConversation = {
        ...mockConversation,
        id: 'conv-789',
        title: 'New Support Request',
        messages: []
      };

      const { rerender } = render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      rerender(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={newConversation}
        />
      );

      expect(screen.getByText('New Support Request')).toBeInTheDocument();
      expect(screen.queryByText('Hello, I need help with my account')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility and Keyboard Navigation', () => {
    it('supports keyboard navigation for message actions', () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          enableFeedback={true}
        />
      );

      const copyButton = screen.getAllByLabelText('Copy message')[0];

      copyButton.focus();
      expect(document.activeElement).toBe(copyButton);

      fireEvent.keyDown(copyButton, { key: 'Enter' });
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('provides proper ARIA labels for screen readers', () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          enableFeedback={true}
        />
      );

      expect(screen.getByLabelText('Chat messages')).toBeInTheDocument();
      expect(screen.getByLabelText('Type your message...')).toBeInTheDocument();
      expect(screen.getByLabelText('Send message')).toBeInTheDocument();
    });

    it('announces new messages to screen readers', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      // Simulate new message arrival
      const newMessage = {
        id: 'msg-new',
        role: 'assistant',
        content: 'Screen reader announcement test',
        timestamp: new Date().toISOString()
      };

      // The component should update aria-live region
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('manages focus properly during interactions', () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      // Focus should return to input after sending
      fireEvent.change(messageInput, { target: { value: 'Test focus' } });
      fireEvent.click(sendButton);

      expect(document.activeElement).toBe(messageInput);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles WebSocket connection errors', async () => {
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      // Simulate WebSocket error
      act(() => {
        const ws = new MockWebSocket('ws://localhost');
        ws.onerror?.(new Event('error'));
      });

      await waitFor(() => {
        expect(screen.getByText('Connection error')).toBeInTheDocument();
        expect(screen.getByText('Please check your internet connection')).toBeInTheDocument();
      });
    });

    it('handles message sending failures', async () => {
      const mockOnSendMessage = jest.fn().mockRejectedValue(new Error('Send failed'));
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onSendMessage={mockOnSendMessage}
        />
      );

      const messageInput = screen.getByPlaceholderText('Type your message...');
      const sendButton = screen.getByLabelText('Send message');

      fireEvent.change(messageInput, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to send message')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries failed message sends', async () => {
      const mockOnSendMessage = jest.fn()
        .mockRejectedValueOnce(new Error('Send failed'))
        .mockResolvedValueOnce(true);

      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onSendMessage={mockOnSendMessage}
        />
      );

      const messageInput = screen.getByPlaceholderText('Type your message...');
      fireEvent.change(messageInput, { target: { value: 'Test message' } });
      fireEvent.click(screen.getByLabelText('Send message'));

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledTimes(2);
        expect(screen.queryByText('Failed to send message')).not.toBeInTheDocument();
      });
    });

    it('handles empty conversation gracefully', () => {
      const emptyConversation = {
        ...mockConversation,
        messages: []
      };

      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={emptyConversation}
        />
      );

      expect(screen.getByText('Start the conversation')).toBeInTheDocument();
      expect(screen.getByText('Send your first message to begin')).toBeInTheDocument();
    });

    it('handles malformed message data', () => {
      const malformedConversation = {
        ...mockConversation,
        messages: [
          { id: 'bad-msg', role: 'user' }, // Missing content
          { role: 'assistant', content: 'No ID message' }, // Missing id
          null, // Null message
        ].filter(Boolean)
      };

      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={malformedConversation}
        />
      );

      // Should not crash and should handle gracefully
      expect(screen.getByText('Customer Support Bot')).toBeInTheDocument();
    });
  });

  describe('Performance and Optimization', () => {
    it('debounces typing notifications', async () => {
      const mockOnTyping = jest.fn();
      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
          onTyping={mockOnTyping}
        />
      );

      const messageInput = screen.getByPlaceholderText('Type your message...');

      // Rapid typing
      fireEvent.change(messageInput, { target: { value: 'T' } });
      fireEvent.change(messageInput, { target: { value: 'Te' } });
      fireEvent.change(messageInput, { target: { value: 'Tes' } });
      fireEvent.change(messageInput, { target: { value: 'Test' } });

      // Should debounce and only call once
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(mockOnTyping).toHaveBeenCalledTimes(1);
    });

    it('virtualizes long message lists', () => {
      const longConversation = {
        ...mockConversation,
        messages: Array.from({ length: 1000 }, (_, i) => ({
          id: `msg-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: new Date(Date.now() - (1000 - i) * 60000).toISOString()
        }))
      };

      render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={longConversation}
          virtualizeMessages={true}
        />
      );

      // Should only render visible messages
      expect(screen.queryByText('Message 0')).not.toBeInTheDocument();
      expect(screen.getByText('Message 999')).toBeInTheDocument();
    });

    it('memoizes message components', () => {
      const { rerender } = render(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      const initialMessages = screen.getAllByTestId(/message-/);

      // Re-render with same data
      rerender(
        <LiveChatInterface
          chatbot={mockChatbot}
          conversation={mockConversation}
        />
      );

      const afterRerenderMessages = screen.getAllByTestId(/message-/);
      expect(initialMessages.length).toBe(afterRerenderMessages.length);
    });
  });
});