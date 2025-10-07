import { WebSocketMessage, WebSocketMessageType, ChatMessageSendMessage, ChatMessageReceiveMessage, ChatTypingMessage } from './message-types';
import { connectionManager } from './connection-manager';

export interface ChatMessageData {
  id: string;
  conversationId: string;
  chatbotId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  deliveryInfo?: {
    sentAt?: number;
    deliveredAt?: number;
    readAt?: number;
    errorAt?: number;
    retryCount?: number;
    lastRetryAt?: number;
  };
  metadata?: {
    responseTime?: number;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
    vectorSearchResults?: any[];
    model?: string;
    temperature?: number;
  };
}

export interface TypingIndicatorData {
  conversationId: string;
  chatbotId: string;
  userIdentifier: string;
  isTyping: boolean;
}

/**
 * Specialized handler for chat-related WebSocket messages
 */
export class ChatWebSocketHandler {
  private messageCallbacks = new Map<string, (message: ChatMessageData) => void>();
  private typingCallbacks = new Map<string, (data: TypingIndicatorData) => void>();
  private statusCallbacks = new Map<string, (messageId: string, status: ChatMessageData['status'], error?: string) => void>();

  /**
   * Register callback for chat messages in a specific conversation
   */
  public onChatMessage(conversationId: string, callback: (message: ChatMessageData) => void): () => void {
    this.messageCallbacks.set(conversationId, callback);

    return () => {
      this.messageCallbacks.delete(conversationId);
    };
  }

  /**
   * Register callback for typing indicators in a specific conversation
   */
  public onTypingIndicator(conversationId: string, callback: (data: TypingIndicatorData) => void): () => void {
    this.typingCallbacks.set(conversationId, callback);

    return () => {
      this.typingCallbacks.delete(conversationId);
    };
  }

  /**
   * Register callback for message status updates
   */
  public onMessageStatus(conversationId: string, callback: (messageId: string, status: ChatMessageData['status'], error?: string) => void): () => void {
    this.statusCallbacks.set(conversationId, callback);

    return () => {
      this.statusCallbacks.delete(conversationId);
    };
  }

  /**
   * Process incoming WebSocket messages for chat functionality
   */
  public processMessage(message: WebSocketMessage): boolean {
    try {
      switch (message.type) {
        case WebSocketMessageType.CHAT_MESSAGE_RECEIVE:
          return this.handleChatMessageReceive(message as ChatMessageReceiveMessage);

        case WebSocketMessageType.CHAT_TYPING_START:
        case WebSocketMessageType.CHAT_TYPING_STOP:
          return this.handleTypingIndicator(message as ChatTypingMessage);

        case WebSocketMessageType.CHAT_MESSAGE_STATUS:
          return this.handleMessageStatus(message);

        default:
          return false;
      }
    } catch (error) {
      console.error('Error processing chat message:', error);
      return false;
    }
  }

  /**
   * Send a chat message through WebSocket
   */
  public async sendChatMessage(
    connectionId: string,
    chatbotId: string,
    conversationId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      const message: ChatMessageSendMessage = {
        id: this.generateMessageId(),
        type: WebSocketMessageType.CHAT_MESSAGE_SEND,
        timestamp: Date.now(),
        chatbotId,
        data: {
          conversationId,
          content,
          metadata
        }
      };

      return connectionManager.sendToConnection(connectionId, message);
    } catch (error) {
      console.error('Error sending chat message:', error);
      return false;
    }
  }

  /**
   * Send typing indicator
   */
  public sendTypingIndicator(
    connectionId: string,
    chatbotId: string,
    conversationId: string,
    isTyping: boolean
  ): boolean {
    try {
      const message: ChatTypingMessage = {
        id: this.generateMessageId(),
        type: isTyping ? WebSocketMessageType.CHAT_TYPING_START : WebSocketMessageType.CHAT_TYPING_STOP,
        timestamp: Date.now(),
        chatbotId,
        data: {
          conversationId,
          userIdentifier: connectionId // Use connection ID as user identifier
        }
      };

      return connectionManager.sendToConnection(connectionId, message);
    } catch (error) {
      console.error('Error sending typing indicator:', error);
      return false;
    }
  }

  /**
   * Handle received chat message
   */
  private handleChatMessageReceive(message: ChatMessageReceiveMessage): boolean {
    const conversationId = message.data.conversationId;
    const callback = this.messageCallbacks.get(conversationId);

    if (callback) {
      const chatMessage: ChatMessageData = {
        id: message.data.messageId,
        conversationId: message.data.conversationId,
        chatbotId: message.chatbotId!,
        role: message.data.role,
        content: message.data.content,
        timestamp: message.data.createdAt,
        status: 'delivered',
        metadata: {
          vectorSearchResults: message.data.vectorSearchResults,
          ...message.data.metadata
        }
      };

      callback(chatMessage);
      return true;
    }

    return false;
  }

  /**
   * Handle typing indicator messages
   */
  private handleTypingIndicator(message: ChatTypingMessage): boolean {
    const conversationId = message.data.conversationId;
    const callback = this.typingCallbacks.get(conversationId);

    if (callback) {
      const typingData: TypingIndicatorData = {
        conversationId: message.data.conversationId,
        chatbotId: message.chatbotId!,
        userIdentifier: message.data.userIdentifier,
        isTyping: message.type === WebSocketMessageType.CHAT_TYPING_START
      };

      callback(typingData);
      return true;
    }

    return false;
  }

  /**
   * Handle message status updates
   */
  private handleMessageStatus(message: WebSocketMessage): boolean {
    if ('data' in message && message.data &&
        'conversationId' in message.data &&
        'messageId' in message.data &&
        'status' in message.data) {

      const conversationId = message.data.conversationId;
      const callback = this.statusCallbacks.get(conversationId);

      if (callback) {
        // Enhanced delivery confirmation with timestamps
        const timestamp = message.data.timestamp || Date.now();
        const deliveryInfo = {
          messageId: message.data.messageId,
          status: message.data.status,
          timestamp,
          error: message.data.error,
          retryCount: message.data.retryCount || 0
        };

        callback(
          deliveryInfo.messageId,
          deliveryInfo.status,
          deliveryInfo.error,
          deliveryInfo
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up all callbacks
   */
  public cleanup(): void {
    this.messageCallbacks.clear();
    this.typingCallbacks.clear();
    this.statusCallbacks.clear();
  }
}

// Global chat handler instance
export const chatWebSocketHandler = new ChatWebSocketHandler();