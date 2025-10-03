import {
  WebSocketMessage,
  WebSocketMessageType,
  ChatMessageSendMessage,
  MessageBroadcastOptions,
  createChatMessageReceive,
  createAnalyticsUpdate,
  createErrorNotification,
  createWebSocketMessage
} from './message-types';
import { connectionManager } from './connection-manager';
import { ConversationService } from '@/lib/services/conversation-service';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { ActivityTracker } from '@/lib/services/activity-tracker';
import { ContentModerationService } from '@/lib/services/content-moderation';
import type { ModerationContext } from '@/lib/db/schema';

export class MessageBroker {
  private messageQueue: Map<string, WebSocketMessage[]> = new Map();
  private analyticsBuffer: Map<string, any[]> = new Map();
  private processingTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.startMessageProcessing();
  }

  /**
   * Process incoming WebSocket message and route appropriately
   */
  async processMessage(connectionId: string, message: WebSocketMessage): Promise<void> {
    try {
      const connection = connectionManager.getConnection(connectionId);
      if (!connection) {
        console.warn(`Message from unknown connection: ${connectionId}`);
        return;
      }

      // Route message based on type
      switch (message.type) {
        case WebSocketMessageType.CHAT_MESSAGE_SEND:
          await this.handleChatMessage(connectionId, message as ChatMessageSendMessage);
          break;

        case WebSocketMessageType.JOIN_ROOM:
          await this.handleJoinRoom(connectionId, message);
          break;

        case WebSocketMessageType.LEAVE_ROOM:
          await this.handleLeaveRoom(connectionId, message);
          break;

        default:
          console.log(`Unhandled message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`Error processing message from ${connectionId}:`, error);

      // Send error notification back to client
      const errorMessage = createErrorNotification(
        'medium',
        'Failed to process message',
        { originalMessageType: message.type, error: error instanceof Error ? error.message : 'Unknown error' }
      );

      connectionManager.sendToConnection(connectionId, errorMessage);
    }
  }

  /**
   * Handle chat message sending
   */
  private async handleChatMessage(connectionId: string, message: ChatMessageSendMessage): Promise<void> {
    const connection = connectionManager.getConnection(connectionId);
    if (!connection) return;

    try {
      // Validate chatbot exists and user has access
      const chatbot = await ChatbotService.getChatbotById(message.chatbotId);
      if (!chatbot) {
        throw new Error('Chatbot not found');
      }

      // Perform content moderation on the user's message
      const moderationContext: ModerationContext = {
        messageContent: message.data.content,
        userId: connection.userId,
        chatbotId: message.chatbotId,
        conversationId: message.data.conversationId,
        userIdentifier: connection.metadata.sessionId || connection.userId,
        metadata: {
          ipAddress: connection.metadata.ipAddress || 'unknown',
          userAgent: connection.metadata.userAgent || 'unknown',
          sessionId: connection.metadata.sessionId,
          endpoint: 'websocket',
          method: 'WebSocket'
        }
      };

      const moderationResult = await ContentModerationService.moderateContent(moderationContext);

      // Handle content moderation result
      if (moderationResult.isViolation && moderationResult.action === 'block') {
        const moderationError = createErrorNotification(
          'high',
          'Message blocked due to content policy violation',
          {
            severity: moderationResult.severity,
            confidence: moderationResult.confidenceScore,
            reasoning: moderationResult.reasoning,
            conversationId: message.data.conversationId
          }
        );
        connectionManager.sendToConnection(connectionId, moderationError);
        return;
      }

      // If content is flagged but not blocked, proceed but log for review
      if (moderationResult.isViolation && moderationResult.action === 'flag') {
        console.warn(`Content flagged for review: ${moderationResult.reasoning}`, {
          userId: connection.userId,
          chatbotId: message.chatbotId,
          conversationId: message.data.conversationId,
          violatedRules: moderationResult.violatedRules
        });
      }

      // Send message through conversation service
      const result = await ConversationService.sendMessage(
        message.data.conversationId,
        {
          content: message.data.content,
          metadata: message.data.metadata
        },
        connection.userId
      );

      // Broadcast user message to room participants
      const userMessageBroadcast = createChatMessageReceive(
        message.data.conversationId,
        result.userMessage.id,
        'user',
        result.userMessage.content,
        message.chatbotId,
        result.userMessage.metadata
      );

      this.broadcastToRoom(`chatbot:${message.chatbotId}`, userMessageBroadcast, connectionId);

      // Broadcast assistant response to room participants
      const assistantMessageBroadcast = createChatMessageReceive(
        message.data.conversationId,
        result.assistantMessage.id,
        'assistant',
        result.assistantMessage.content,
        message.chatbotId,
        result.assistantMessage.metadata
      );

      this.broadcastToRoom(`chatbot:${message.chatbotId}`, assistantMessageBroadcast);

      // Track activity
      await ActivityTracker.trackEvent(connection.userId, 'chat_message_sent', {
        chatbotId: message.chatbotId,
        conversationId: message.data.conversationId,
        messageLength: message.data.content.length
      });

      // Update real-time analytics
      this.updateAnalytics(message.chatbotId, {
        messagesSent: 1,
        activeSessions: 1
      });

    } catch (error) {
      console.error('Chat message processing error:', error);

      const errorMessage = createErrorNotification(
        'high',
        'Failed to send chat message',
        {
          conversationId: message.data.conversationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );

      connectionManager.sendToConnection(connectionId, errorMessage);
    }
  }

  /**
   * Handle room join requests
   */
  private async handleJoinRoom(connectionId: string, message: WebSocketMessage): Promise<void> {
    const connection = connectionManager.getConnection(connectionId);
    if (!connection || !('data' in message) || !message.data || !('roomId' in message.data)) {
      return;
    }

    const roomId = message.data.roomId;
    const roomType = message.data.roomType || 'chatbot';

    // Validate permissions
    if (!this.validateRoomAccess(connection.userId, connection.metadata.role, roomId, roomType)) {
      const errorMessage = createErrorNotification(
        'medium',
        'Access denied to room',
        { roomId, roomType }
      );
      connectionManager.sendToConnection(connectionId, errorMessage);
      return;
    }

    // Join the room
    const success = connectionManager.joinRoom(connectionId, roomId, roomType as any);

    if (success) {
      // Send confirmation
      const confirmMessage = createWebSocketMessage(WebSocketMessageType.ROOM_UPDATE, {
        roomId,
        activeUsers: connectionManager.getStats().roomStats.find(r => r.roomId === roomId)?.connections || 1,
        recentActivity: null
      });

      connectionManager.sendToConnection(connectionId, confirmMessage);

      // Notify other room members
      connectionManager.broadcastToRoom(roomId, confirmMessage, connectionId);
    }
  }

  /**
   * Handle room leave requests
   */
  private async handleLeaveRoom(connectionId: string, message: WebSocketMessage): Promise<void> {
    if (!('data' in message) || !message.data || !('roomId' in message.data)) {
      return;
    }

    const roomId = message.data.roomId;
    connectionManager.leaveRoom(connectionId, roomId);
  }

  /**
   * Validate room access permissions
   */
  private validateRoomAccess(userId: string, userRole: string, roomId: string, roomType: string): boolean {
    // System rooms require admin access
    if (roomId.startsWith('system:') && userRole !== 'super_admin') {
      return false;
    }

    // Admin rooms require admin or super_admin
    if (roomType === 'admin' && !['admin', 'super_admin'].includes(userRole)) {
      return false;
    }

    // Analytics rooms require admin access
    if (roomType === 'analytics' && !['admin', 'super_admin'].includes(userRole)) {
      return false;
    }

    // User can always access their own user room
    if (roomId === `user:${userId}`) {
      return true;
    }

    // Chatbot rooms - check if user has access to the chatbot
    if (roomId.startsWith('chatbot:')) {
      // For now, allow all authenticated users to access chatbot rooms
      // In the future, this should check chatbot permissions
      return true;
    }

    return true;
  }

  /**
   * Broadcast message to room
   */
  broadcastToRoom(roomId: string, message: WebSocketMessage, excludeConnectionId?: string): number {
    return connectionManager.broadcastToRoom(roomId, message, excludeConnectionId);
  }

  /**
   * Broadcast message to user
   */
  broadcastToUser(userId: string, message: WebSocketMessage): number {
    return connectionManager.sendToUser(userId, message);
  }

  /**
   * Broadcast to all connections
   */
  broadcastToAll(message: WebSocketMessage, options: MessageBroadcastOptions = {}): number {
    return connectionManager.broadcast(message, options);
  }

  /**
   * Queue message for offline users
   */
  queueMessage(userId: string, message: WebSocketMessage): void {
    if (!this.messageQueue.has(userId)) {
      this.messageQueue.set(userId, []);
    }

    const queue = this.messageQueue.get(userId)!;
    queue.push(message);

    // Limit queue size to prevent memory issues
    if (queue.length > 100) {
      queue.shift(); // Remove oldest message
    }
  }

  /**
   * Deliver queued messages when user comes online
   */
  deliverQueuedMessages(userId: string): number {
    const queue = this.messageQueue.get(userId);
    if (!queue || queue.length === 0) {
      return 0;
    }

    let delivered = 0;
    const userConnections = connectionManager.getUserConnections(userId);

    if (userConnections.length > 0) {
      queue.forEach(message => {
        const sent = connectionManager.sendToUser(userId, message);
        if (sent > 0) delivered++;
      });

      this.messageQueue.delete(userId);
    }

    return delivered;
  }

  /**
   * Update real-time analytics
   */
  private updateAnalytics(chatbotId: string, metrics: Record<string, number>): void {
    if (!this.analyticsBuffer.has(chatbotId)) {
      this.analyticsBuffer.set(chatbotId, []);
    }

    this.analyticsBuffer.get(chatbotId)!.push({
      timestamp: Date.now(),
      metrics
    });

    // Broadcast analytics update to analytics rooms
    const analyticsMessage = createAnalyticsUpdate(metrics, 'realtime', chatbotId);
    this.broadcastToRoom('analytics:realtime', analyticsMessage);
    this.broadcastToRoom(`analytics:chatbot:${chatbotId}`, analyticsMessage);
  }

  /**
   * Start background message processing
   */
  private startMessageProcessing(): void {
    this.processingTimeout = setInterval(() => {
      this.processAnalyticsBuffer();
      this.cleanupMessageQueues();
    }, 10000); // Process every 10 seconds
  }

  /**
   * Process accumulated analytics data
   */
  private processAnalyticsBuffer(): void {
    this.analyticsBuffer.forEach((buffer, chatbotId) => {
      if (buffer.length === 0) return;

      // Aggregate metrics
      const aggregated = buffer.reduce((acc, entry) => {
        Object.entries(entry.metrics).forEach(([key, value]) => {
          acc[key] = (acc[key] || 0) + value;
        });
        return acc;
      }, {} as Record<string, number>);

      // Clear buffer
      this.analyticsBuffer.set(chatbotId, []);

      // Broadcast aggregated analytics
      const analyticsMessage = createAnalyticsUpdate(aggregated, 'realtime', chatbotId);
      this.broadcastToRoom('analytics:aggregated', analyticsMessage);
    });
  }

  /**
   * Cleanup old message queues
   */
  private cleanupMessageQueues(): void {
    // Remove empty queues and old messages
    this.messageQueue.forEach((queue, userId) => {
      if (queue.length === 0) {
        this.messageQueue.delete(userId);
        return;
      }

      // Remove messages older than 1 hour
      const oneHourAgo = Date.now() - 3600000;
      const filteredQueue = queue.filter(message => message.timestamp > oneHourAgo);

      if (filteredQueue.length !== queue.length) {
        this.messageQueue.set(userId, filteredQueue);
      }
    });
  }

  /**
   * Get broker statistics
   */
  getStats(): {
    queuedMessages: number;
    activeAnalyticsBuffers: number;
    totalBufferedMetrics: number;
  } {
    let queuedMessages = 0;
    this.messageQueue.forEach(queue => {
      queuedMessages += queue.length;
    });

    let totalBufferedMetrics = 0;
    this.analyticsBuffer.forEach(buffer => {
      totalBufferedMetrics += buffer.length;
    });

    return {
      queuedMessages,
      activeAnalyticsBuffers: this.analyticsBuffer.size,
      totalBufferedMetrics
    };
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.processingTimeout) {
      clearInterval(this.processingTimeout);
    }

    this.messageQueue.clear();
    this.analyticsBuffer.clear();
  }
}

// Global message broker instance
export const messageBroker = new MessageBroker();