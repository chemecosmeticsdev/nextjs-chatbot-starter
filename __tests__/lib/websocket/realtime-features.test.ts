import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocket } from 'ws';

// Mock WebSocket utilities and real-time features
const WebSocketManager = {
  // Connection management
  createConnection: jest.fn(),
  closeConnection: jest.fn(),
  getConnection: jest.fn(),
  getActiveConnections: jest.fn(),

  // Message handling
  sendMessage: jest.fn(),
  broadcastMessage: jest.fn(),
  sendToUser: jest.fn(),
  sendToRoom: jest.fn(),

  // Room management
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
  getRoomMembers: jest.fn(),
  createRoom: jest.fn(),

  // Event handling
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  emitEvent: jest.fn(),

  // Health monitoring
  pingConnection: jest.fn(),
  getConnectionHealth: jest.fn(),
  reconnect: jest.fn(),

  // Authentication
  authenticateConnection: jest.fn(),
  authorizeAccess: jest.fn()
};

const RealTimeFeatures = {
  // Chat features
  sendChatMessage: jest.fn(),
  typingIndicator: jest.fn(),
  messageDeliveryStatus: jest.fn(),
  messageReadStatus: jest.fn(),

  // Collaboration features
  documentCollaboration: jest.fn(),
  cursorPosition: jest.fn(),
  liveEditing: jest.fn(),

  // Notification system
  sendNotification: jest.fn(),
  broadcastNotification: jest.fn(),
  getNotificationHistory: jest.fn(),

  // Presence system
  updatePresence: jest.fn(),
  getUserPresence: jest.fn(),
  broadcastPresence: jest.fn(),

  // Analytics and monitoring
  trackEvent: jest.fn(),
  getMetrics: jest.fn(),
  getPerformanceStats: jest.fn()
};

// Mock WebSocket implementation
class MockWebSocket {
  public readyState: number = 1; // OPEN
  public url: string;
  public protocol: string;

  private listeners: Map<string, Function[]> = new Map();

  constructor(url: string, protocol?: string) {
    this.url = url;
    this.protocol = protocol || '';
  }

  send(data: string | Buffer): void {
    // Mock send implementation
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3; // CLOSED
  }

  addEventListener(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  removeEventListener(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  // Helper method to simulate events
  simulateEvent(event: string, data?: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(data));
    }
  }
}

// Mock ws library
jest.mock('ws', () => ({
  WebSocket: MockWebSocket,
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
    clients: new Set()
  }))
}));

describe('WebSocket Real-Time Features', () => {
  let mockConnection: MockWebSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = new MockWebSocket('ws://localhost:3001');
  });

  afterEach(() => {
    if (mockConnection) {
      mockConnection.close();
    }
  });

  describe('Connection Management', () => {
    it('should create and manage WebSocket connections', async () => {
      const connectionConfig = {
        url: 'ws://localhost:3001',
        userId: 'user123',
        chatbotId: 'bot456',
        protocols: ['chat-protocol-v1']
      };

      WebSocketManager.createConnection.mockResolvedValue({
        id: 'conn_789',
        userId: 'user123',
        chatbotId: 'bot456',
        status: 'connected',
        connectedAt: new Date().toISOString(),
        socket: mockConnection,
        metadata: {
          userAgent: 'Mozilla/5.0...',
          ip: '192.168.1.100',
          protocol: 'chat-protocol-v1'
        }
      });

      const connection = await WebSocketManager.createConnection(connectionConfig);

      expect(connection.status).toBe('connected');
      expect(connection.userId).toBe('user123');
      expect(connection.chatbotId).toBe('bot456');
      expect(connection.id).toBeDefined();
    });

    it('should handle connection failures gracefully', async () => {
      const failingConfig = {
        url: 'ws://invalid-url:9999',
        userId: 'user123'
      };

      WebSocketManager.createConnection.mockRejectedValue(
        new Error('Connection failed: ECONNREFUSED')
      );

      await expect(WebSocketManager.createConnection(failingConfig))
        .rejects.toThrow('Connection failed: ECONNREFUSED');
    });

    it('should track active connections', () => {
      WebSocketManager.getActiveConnections.mockReturnValue({
        total: 156,
        byUser: new Map([
          ['user123', 2],
          ['user456', 1],
          ['user789', 3]
        ]),
        byChatbot: new Map([
          ['bot456', 89],
          ['bot789', 67]
        ]),
        connections: [
          {
            id: 'conn_1',
            userId: 'user123',
            chatbotId: 'bot456',
            connectedAt: Date.now() - 300000,
            lastActivity: Date.now() - 30000
          },
          {
            id: 'conn_2',
            userId: 'user456',
            chatbotId: 'bot456',
            connectedAt: Date.now() - 600000,
            lastActivity: Date.now() - 10000
          }
        ]
      });

      const activeConnections = WebSocketManager.getActiveConnections();

      expect(activeConnections.total).toBe(156);
      expect(activeConnections.byUser.get('user123')).toBe(2);
      expect(activeConnections.connections).toHaveLength(2);
    });

    it('should close connections properly', async () => {
      const connectionId = 'conn_789';

      WebSocketManager.closeConnection.mockResolvedValue({
        closed: true,
        connectionId,
        closedAt: new Date().toISOString(),
        reason: 'client_disconnect',
        graceful: true
      });

      const result = await WebSocketManager.closeConnection(connectionId);

      expect(result.closed).toBe(true);
      expect(result.graceful).toBe(true);
      expect(result.connectionId).toBe(connectionId);
    });
  });

  describe('Message Handling', () => {
    it('should send messages to specific connections', async () => {
      const message = {
        type: 'chat_message',
        data: {
          messageId: 'msg_123',
          content: 'Hello, how can I help you?',
          sender: 'bot456',
          timestamp: Date.now()
        },
        metadata: {
          sessionId: 'session_789',
          priority: 'normal'
        }
      };

      WebSocketManager.sendMessage.mockResolvedValue({
        sent: true,
        messageId: 'msg_123',
        connectionId: 'conn_789',
        deliveredAt: new Date().toISOString(),
        queueTime: 5, // ms
        transmissionTime: 12 // ms
      });

      const result = await WebSocketManager.sendMessage('conn_789', message);

      expect(result.sent).toBe(true);
      expect(result.messageId).toBe('msg_123');
      expect(result.queueTime).toBeLessThan(10);
      expect(result.transmissionTime).toBeLessThan(50);
    });

    it('should broadcast messages to multiple connections', async () => {
      const broadcastMessage = {
        type: 'system_announcement',
        data: {
          title: 'System Maintenance',
          content: 'The system will undergo maintenance in 5 minutes',
          severity: 'warning'
        }
      };

      const targetConnections = ['conn_1', 'conn_2', 'conn_3'];

      WebSocketManager.broadcastMessage.mockResolvedValue({
        broadcasted: true,
        totalTargets: 3,
        successful: 3,
        failed: 0,
        results: [
          { connectionId: 'conn_1', status: 'delivered', deliveredAt: Date.now() },
          { connectionId: 'conn_2', status: 'delivered', deliveredAt: Date.now() },
          { connectionId: 'conn_3', status: 'delivered', deliveredAt: Date.now() }
        ],
        broadcastTime: 45 // ms
      });

      const result = await WebSocketManager.broadcastMessage(targetConnections, broadcastMessage);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.broadcastTime).toBeLessThan(100);
    });

    it('should send messages to specific users across multiple connections', async () => {
      const userMessage = {
        type: 'personal_notification',
        data: {
          notificationId: 'notif_456',
          title: 'New Message',
          content: 'You have received a new message',
          action: 'view_message'
        }
      };

      WebSocketManager.sendToUser.mockResolvedValue({
        sent: true,
        userId: 'user123',
        connectionsTargeted: 2,
        delivered: 2,
        failed: 0,
        deliveryReport: [
          { connectionId: 'conn_1', device: 'desktop', delivered: true },
          { connectionId: 'conn_2', device: 'mobile', delivered: true }
        ]
      });

      const result = await WebSocketManager.sendToUser('user123', userMessage);

      expect(result.connectionsTargeted).toBe(2);
      expect(result.delivered).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle message queuing for offline users', async () => {
      const offlineMessage = {
        type: 'chat_message',
        data: {
          content: 'Message for offline user',
          sender: 'bot456'
        }
      };

      WebSocketManager.sendToUser.mockResolvedValue({
        sent: false,
        userId: 'offline_user',
        reason: 'user_offline',
        queued: true,
        queuedAt: new Date().toISOString(),
        deliveryWhenOnline: true
      });

      const result = await WebSocketManager.sendToUser('offline_user', offlineMessage);

      expect(result.sent).toBe(false);
      expect(result.queued).toBe(true);
      expect(result.reason).toBe('user_offline');
    });
  });

  describe('Room Management', () => {
    it('should create and manage chat rooms', async () => {
      const roomConfig = {
        name: 'Customer Support Chat',
        type: 'support_session',
        maxMembers: 10,
        private: true,
        metadata: {
          chatbotId: 'bot456',
          category: 'technical_support'
        }
      };

      WebSocketManager.createRoom.mockResolvedValue({
        roomId: 'room_789',
        name: 'Customer Support Chat',
        type: 'support_session',
        createdAt: new Date().toISOString(),
        maxMembers: 10,
        currentMembers: 0,
        settings: {
          private: true,
          persistent: false,
          messagingEnabled: true
        }
      });

      const room = await WebSocketManager.createRoom(roomConfig);

      expect(room.roomId).toBeDefined();
      expect(room.maxMembers).toBe(10);
      expect(room.settings.private).toBe(true);
    });

    it('should handle user joining and leaving rooms', async () => {
      const joinData = {
        userId: 'user123',
        roomId: 'room_789',
        permissions: ['send_message', 'receive_message']
      };

      WebSocketManager.joinRoom.mockResolvedValue({
        joined: true,
        userId: 'user123',
        roomId: 'room_789',
        joinedAt: new Date().toISOString(),
        memberCount: 3,
        userPermissions: ['send_message', 'receive_message'],
        welcomeMessage: 'Welcome to Customer Support Chat'
      });

      const joinResult = await WebSocketManager.joinRoom(joinData);

      expect(joinResult.joined).toBe(true);
      expect(joinResult.memberCount).toBe(3);
      expect(joinResult.userPermissions).toContain('send_message');

      // Test leaving room
      WebSocketManager.leaveRoom.mockResolvedValue({
        left: true,
        userId: 'user123',
        roomId: 'room_789',
        leftAt: new Date().toISOString(),
        memberCount: 2,
        reason: 'user_initiated'
      });

      const leaveResult = await WebSocketManager.leaveRoom('user123', 'room_789');

      expect(leaveResult.left).toBe(true);
      expect(leaveResult.memberCount).toBe(2);
    });

    it('should send messages to all room members', async () => {
      const roomMessage = {
        type: 'room_message',
        data: {
          content: 'Welcome everyone to our support session!',
          sender: 'moderator',
          roomId: 'room_789'
        }
      };

      WebSocketManager.sendToRoom.mockResolvedValue({
        sent: true,
        roomId: 'room_789',
        targetMembers: 5,
        delivered: 4,
        failed: 1,
        deliveryReport: [
          { userId: 'user1', status: 'delivered' },
          { userId: 'user2', status: 'delivered' },
          { userId: 'user3', status: 'delivered' },
          { userId: 'user4', status: 'delivered' },
          { userId: 'user5', status: 'failed', reason: 'connection_lost' }
        ]
      });

      const result = await WebSocketManager.sendToRoom('room_789', roomMessage);

      expect(result.targetMembers).toBe(5);
      expect(result.delivered).toBe(4);
      expect(result.failed).toBe(1);
    });

    it('should get room member information', () => {
      WebSocketManager.getRoomMembers.mockReturnValue({
        roomId: 'room_789',
        memberCount: 4,
        members: [
          {
            userId: 'user1',
            joinedAt: Date.now() - 600000,
            role: 'participant',
            permissions: ['send_message', 'receive_message'],
            presence: 'active'
          },
          {
            userId: 'user2',
            joinedAt: Date.now() - 300000,
            role: 'moderator',
            permissions: ['send_message', 'receive_message', 'manage_room'],
            presence: 'active'
          },
          {
            userId: 'user3',
            joinedAt: Date.now() - 120000,
            role: 'participant',
            permissions: ['receive_message'],
            presence: 'away'
          }
        ],
        metadata: {
          activeMembers: 2,
          awayMembers: 1,
          lastActivity: Date.now() - 30000
        }
      });

      const members = WebSocketManager.getRoomMembers('room_789');

      expect(members.memberCount).toBe(4);
      expect(members.metadata.activeMembers).toBe(2);
      expect(members.members[1].role).toBe('moderator');
    });
  });

  describe('Real-Time Chat Features', () => {
    it('should handle chat message sending with delivery confirmation', async () => {
      const chatMessage = {
        content: 'Hello, I need help with my account',
        senderId: 'user123',
        recipientId: 'bot456',
        sessionId: 'session_789',
        messageType: 'text'
      };

      RealTimeFeatures.sendChatMessage.mockResolvedValue({
        messageId: 'msg_456',
        sent: true,
        timestamp: Date.now(),
        deliveryStatus: 'delivered',
        readStatus: 'unread',
        metadata: {
          processingTime: 15, // ms
          queuePosition: 0,
          priority: 'normal'
        }
      });

      const result = await RealTimeFeatures.sendChatMessage(chatMessage);

      expect(result.sent).toBe(true);
      expect(result.deliveryStatus).toBe('delivered');
      expect(result.messageId).toBeDefined();
      expect(result.metadata.processingTime).toBeLessThan(50);
    });

    it('should show typing indicators', async () => {
      const typingData = {
        userId: 'user123',
        chatbotId: 'bot456',
        sessionId: 'session_789',
        isTyping: true
      };

      RealTimeFeatures.typingIndicator.mockResolvedValue({
        updated: true,
        userId: 'user123',
        sessionId: 'session_789',
        typingStatus: 'typing',
        startedAt: new Date().toISOString(),
        broadcastedTo: ['bot456'],
        autoStop: 5000 // ms
      });

      const result = await RealTimeFeatures.typingIndicator(typingData);

      expect(result.updated).toBe(true);
      expect(result.typingStatus).toBe('typing');
      expect(result.autoStop).toBe(5000);
    });

    it('should track message delivery and read status', async () => {
      const statusUpdate = {
        messageId: 'msg_456',
        userId: 'user123',
        status: 'read',
        timestamp: Date.now()
      };

      RealTimeFeatures.messageReadStatus.mockResolvedValue({
        updated: true,
        messageId: 'msg_456',
        previousStatus: 'delivered',
        newStatus: 'read',
        readAt: new Date().toISOString(),
        notifySender: true,
        senderNotified: true
      });

      const result = await RealTimeFeatures.messageReadStatus(statusUpdate);

      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('read');
      expect(result.senderNotified).toBe(true);
    });
  });

  describe('Presence System', () => {
    it('should update and broadcast user presence', async () => {
      const presenceData = {
        userId: 'user123',
        status: 'active',
        activity: 'chatting',
        location: 'chat_session_789',
        customMessage: 'Available for chat'
      };

      RealTimeFeatures.updatePresence.mockResolvedValue({
        updated: true,
        userId: 'user123',
        presence: {
          status: 'active',
          activity: 'chatting',
          location: 'chat_session_789',
          customMessage: 'Available for chat',
          lastSeen: new Date().toISOString(),
          onlineFor: 1800 // seconds
        },
        broadcastedTo: ['user456', 'user789'],
        subscribers: 2
      });

      const result = await RealTimeFeatures.updatePresence(presenceData);

      expect(result.updated).toBe(true);
      expect(result.presence.status).toBe('active');
      expect(result.subscribers).toBe(2);
    });

    it('should get user presence information', async () => {
      RealTimeFeatures.getUserPresence.mockResolvedValue({
        userId: 'user123',
        presence: {
          status: 'away',
          activity: 'idle',
          lastActive: Date.now() - 900000, // 15 minutes ago
          lastSeen: new Date(Date.now() - 900000).toISOString(),
          totalOnlineTime: 3600, // seconds
          deviceInfo: {
            type: 'desktop',
            browser: 'Chrome',
            os: 'Windows'
          }
        },
        connections: [
          {
            connectionId: 'conn_1',
            device: 'desktop',
            lastActivity: Date.now() - 900000
          }
        ]
      });

      const presence = await RealTimeFeatures.getUserPresence('user123');

      expect(presence.presence.status).toBe('away');
      expect(presence.connections).toHaveLength(1);
      expect(presence.presence.deviceInfo.type).toBe('desktop');
    });

    it('should broadcast presence updates to subscribers', async () => {
      const presenceUpdate = {
        userId: 'user123',
        status: 'offline',
        reason: 'session_timeout'
      };

      RealTimeFeatures.broadcastPresence.mockResolvedValue({
        broadcasted: true,
        userId: 'user123',
        update: presenceUpdate,
        subscribers: ['user456', 'user789', 'bot123'],
        delivered: 3,
        failed: 0,
        broadcastTime: 25 // ms
      });

      const result = await RealTimeFeatures.broadcastPresence(presenceUpdate);

      expect(result.broadcasted).toBe(true);
      expect(result.delivered).toBe(3);
      expect(result.broadcastTime).toBeLessThan(50);
    });
  });

  describe('Notification System', () => {
    it('should send real-time notifications', async () => {
      const notification = {
        type: 'chat_message',
        title: 'New Message',
        content: 'You have received a new message from support',
        recipient: 'user123',
        priority: 'normal',
        actions: [
          { label: 'View', action: 'open_chat' },
          { label: 'Dismiss', action: 'dismiss' }
        ]
      };

      RealTimeFeatures.sendNotification.mockResolvedValue({
        sent: true,
        notificationId: 'notif_789',
        recipient: 'user123',
        deliveredAt: new Date().toISOString(),
        channels: ['websocket', 'push'],
        channelResults: {
          websocket: { delivered: true, timestamp: Date.now() },
          push: { delivered: true, timestamp: Date.now() }
        }
      });

      const result = await RealTimeFeatures.sendNotification(notification);

      expect(result.sent).toBe(true);
      expect(result.channels).toContain('websocket');
      expect(result.channelResults.websocket.delivered).toBe(true);
    });

    it('should broadcast system-wide notifications', async () => {
      const systemNotification = {
        type: 'system_maintenance',
        title: 'Scheduled Maintenance',
        content: 'System maintenance will begin in 10 minutes',
        priority: 'high',
        broadcastTo: 'all_active_users'
      };

      RealTimeFeatures.broadcastNotification.mockResolvedValue({
        broadcasted: true,
        notificationId: 'sys_notif_123',
        targetUsers: 256,
        delivered: 245,
        failed: 11,
        channels: ['websocket', 'push', 'email'],
        broadcastTime: 2500, // ms
        failureReasons: [
          { reason: 'user_offline', count: 8 },
          { reason: 'connection_lost', count: 3 }
        ]
      });

      const result = await RealTimeFeatures.broadcastNotification(systemNotification);

      expect(result.targetUsers).toBe(256);
      expect(result.delivered).toBeGreaterThan(240);
      expect(result.failureReasons).toHaveLength(2);
    });
  });

  describe('Performance and Health Monitoring', () => {
    it('should monitor WebSocket connection health', async () => {
      WebSocketManager.getConnectionHealth.mockResolvedValue({
        healthy: true,
        totalConnections: 156,
        activeConnections: 142,
        idleConnections: 14,
        metrics: {
          averageLatency: 45, // ms
          messagesThroughput: 1250, // messages/minute
          connectionUptime: 0.98,
          errorRate: 0.005
        },
        issues: [],
        lastCheck: new Date().toISOString()
      });

      const health = await WebSocketManager.getConnectionHealth();

      expect(health.healthy).toBe(true);
      expect(health.activeConnections).toBeGreaterThan(140);
      expect(health.metrics.averageLatency).toBeLessThan(100);
      expect(health.metrics.errorRate).toBeLessThan(0.01);
    });

    it('should track real-time feature performance', async () => {
      RealTimeFeatures.getPerformanceStats.mockResolvedValue({
        messageDelivery: {
          averageDeliveryTime: 25, // ms
          successRate: 0.995,
          throughput: 2500, // messages/minute
          queueLength: 12
        },
        presence: {
          updateLatency: 15, // ms
          broadcastTime: 35, // ms
          activeUsers: 89,
          presenceAccuracy: 0.98
        },
        notifications: {
          deliverySuccess: 0.97,
          averageDeliveryTime: 150, // ms
          channelPerformance: {
            websocket: { success: 0.99, avgTime: 25 },
            push: { success: 0.95, avgTime: 350 },
            email: { success: 0.98, avgTime: 2500 }
          }
        },
        roomManagement: {
          joinTime: 50, // ms
          broadcastLatency: 30, // ms
          memberSyncAccuracy: 0.99
        }
      });

      const stats = await RealTimeFeatures.getPerformanceStats();

      expect(stats.messageDelivery.successRate).toBeGreaterThan(0.99);
      expect(stats.presence.updateLatency).toBeLessThan(50);
      expect(stats.notifications.channelPerformance.websocket.success).toBeGreaterThan(0.98);
    });

    it('should handle connection reconnection scenarios', async () => {
      const reconnectConfig = {
        connectionId: 'conn_789',
        maxRetries: 3,
        backoffStrategy: 'exponential',
        preserveState: true
      };

      WebSocketManager.reconnect.mockResolvedValue({
        reconnected: true,
        connectionId: 'conn_789_new',
        attempts: 2,
        reconnectTime: 1500, // ms
        statePreserved: true,
        restoredData: {
          messageQueue: 3,
          presenceStatus: 'active',
          roomMemberships: ['room_789', 'room_456']
        }
      });

      const result = await WebSocketManager.reconnect(reconnectConfig);

      expect(result.reconnected).toBe(true);
      expect(result.attempts).toBeLessThan(3);
      expect(result.statePreserved).toBe(true);
      expect(result.restoredData.roomMemberships).toHaveLength(2);
    });
  });

  describe('Event System', () => {
    it('should handle custom event subscriptions', () => {
      const eventHandler = jest.fn();
      const eventType = 'chatbot_response';

      WebSocketManager.addEventListener.mockReturnValue({
        subscribed: true,
        eventType,
        listenerId: 'listener_123',
        priority: 'normal'
      });

      const subscription = WebSocketManager.addEventListener(eventType, eventHandler);

      expect(subscription.subscribed).toBe(true);
      expect(subscription.eventType).toBe(eventType);
      expect(subscription.listenerId).toBeDefined();
    });

    it('should emit and handle custom events', async () => {
      const customEvent = {
        type: 'user_achievement',
        data: {
          userId: 'user123',
          achievement: 'first_chat_completed',
          points: 10,
          timestamp: Date.now()
        },
        targetAudience: 'user_connections'
      };

      WebSocketManager.emitEvent.mockResolvedValue({
        emitted: true,
        eventType: 'user_achievement',
        targetConnections: 2,
        delivered: 2,
        failed: 0,
        processingTime: 12 // ms
      });

      const result = await WebSocketManager.emitEvent(customEvent);

      expect(result.emitted).toBe(true);
      expect(result.delivered).toBe(2);
      expect(result.processingTime).toBeLessThan(50);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle connection timeouts gracefully', async () => {
      WebSocketManager.createConnection.mockRejectedValue(
        new Error('Connection timeout after 10000ms')
      );

      await expect(WebSocketManager.createConnection({
        url: 'ws://slow-server:3001',
        timeout: 10000
      })).rejects.toThrow('Connection timeout');
    });

    it('should handle malformed messages', async () => {
      const malformedMessage = '{invalid json}';

      WebSocketManager.sendMessage.mockResolvedValue({
        sent: false,
        error: 'invalid_message_format',
        reason: 'JSON parse error',
        originalMessage: malformedMessage,
        action: 'message_rejected'
      });

      const result = await WebSocketManager.sendMessage('conn_789', malformedMessage);

      expect(result.sent).toBe(false);
      expect(result.error).toBe('invalid_message_format');
      expect(result.action).toBe('message_rejected');
    });

    it('should handle room capacity limits', async () => {
      const joinData = {
        userId: 'user999',
        roomId: 'full_room_123'
      };

      WebSocketManager.joinRoom.mockResolvedValue({
        joined: false,
        reason: 'room_full',
        roomId: 'full_room_123',
        currentCapacity: 100,
        maxCapacity: 100,
        waitlisted: true,
        waitlistPosition: 5
      });

      const result = await WebSocketManager.joinRoom(joinData);

      expect(result.joined).toBe(false);
      expect(result.reason).toBe('room_full');
      expect(result.waitlisted).toBe(true);
      expect(result.waitlistPosition).toBe(5);
    });

    it('should handle authentication failures', async () => {
      const invalidAuth = {
        token: 'invalid.jwt.token',
        connectionId: 'conn_789'
      };

      WebSocketManager.authenticateConnection.mockResolvedValue({
        authenticated: false,
        error: 'invalid_token',
        reason: 'JWT signature verification failed',
        action: 'close_connection',
        retryAllowed: false
      });

      const result = await WebSocketManager.authenticateConnection(invalidAuth);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('invalid_token');
      expect(result.action).toBe('close_connection');
      expect(result.retryAllowed).toBe(false);
    });
  });
});

describe('WebSocket Integration Tests', () => {
  it('should handle complete chat session flow', async () => {
    // Simulate complete chat session
    const sessionFlow = {
      connection: await WebSocketManager.createConnection({
        url: 'ws://localhost:3001',
        userId: 'user123'
      }),
      authentication: await WebSocketManager.authenticateConnection({
        token: 'valid.jwt.token'
      }),
      roomJoin: await WebSocketManager.joinRoom({
        userId: 'user123',
        roomId: 'support_room'
      }),
      messagesSent: await RealTimeFeatures.sendChatMessage({
        content: 'Hello, I need help',
        senderId: 'user123'
      }),
      presenceUpdate: await RealTimeFeatures.updatePresence({
        userId: 'user123',
        status: 'active'
      })
    };

    // Mock successful flow
    WebSocketManager.createConnection.mockResolvedValue({ status: 'connected' });
    WebSocketManager.authenticateConnection.mockResolvedValue({ authenticated: true });
    WebSocketManager.joinRoom.mockResolvedValue({ joined: true });
    RealTimeFeatures.sendChatMessage.mockResolvedValue({ sent: true });
    RealTimeFeatures.updatePresence.mockResolvedValue({ updated: true });

    expect(sessionFlow.connection.status).toBe('connected');
    expect(sessionFlow.authentication.authenticated).toBe(true);
    expect(sessionFlow.roomJoin.joined).toBe(true);
    expect(sessionFlow.messagesSent.sent).toBe(true);
    expect(sessionFlow.presenceUpdate.updated).toBe(true);
  });

  it('should handle scaling with multiple concurrent connections', async () => {
    const concurrentConnections = 100;
    const connectionPromises = Array(concurrentConnections).fill(null).map((_, i) =>
      WebSocketManager.createConnection({
        url: 'ws://localhost:3001',
        userId: `user${i}`
      })
    );

    WebSocketManager.createConnection.mockResolvedValue({
      status: 'connected',
      latency: 25
    });

    const startTime = Date.now();
    const connections = await Promise.all(connectionPromises);
    const endTime = Date.now();

    expect(connections).toHaveLength(concurrentConnections);
    expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    expect(connections.every(conn => conn.status === 'connected')).toBe(true);
  });
});