import { z } from 'zod';

// Base WebSocket message interface
export interface BaseWebSocketMessage {
  id: string;
  type: string;
  timestamp: number;
  userId?: string;
  chatbotId?: string;
}

// WebSocket message types enum
export enum WebSocketMessageType {
  // Connection management
  CONNECTION_ACK = 'connection_ack',
  HEARTBEAT_PING = 'heartbeat_ping',
  HEARTBEAT_PONG = 'heartbeat_pong',

  // Chat messages
  CHAT_MESSAGE_SEND = 'chat_message_send',
  CHAT_MESSAGE_RECEIVE = 'chat_message_receive',
  CHAT_TYPING_START = 'chat_typing_start',
  CHAT_TYPING_STOP = 'chat_typing_stop',
  CHAT_MESSAGE_STATUS = 'chat_message_status',

  // Analytics updates
  ANALYTICS_UPDATE = 'analytics_update',
  PERFORMANCE_METRICS = 'performance_metrics',
  CONVERSATION_METRICS = 'conversation_metrics',

  // System notifications
  SYSTEM_STATUS = 'system_status',
  ERROR_NOTIFICATION = 'error_notification',
  WARNING_NOTIFICATION = 'warning_notification',

  // Admin notifications
  ADMIN_ALERT = 'admin_alert',
  USER_ACTIVITY = 'user_activity',
  CHATBOT_STATUS_CHANGE = 'chatbot_status_change',

  // Room management
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  ROOM_UPDATE = 'room_update'
}

// Connection acknowledgment message
export interface ConnectionAckMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.CONNECTION_ACK;
  data: {
    connectionId: string;
    userId: string;
    serverTime: number;
    capabilities: string[];
  };
}

// Heartbeat messages
export interface HeartbeatPingMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.HEARTBEAT_PING;
  data: {
    timestamp: number;
  };
}

export interface HeartbeatPongMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.HEARTBEAT_PONG;
  data: {
    timestamp: number;
    latency?: number;
  };
}

// Chat message interfaces
export interface ChatMessageSendMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.CHAT_MESSAGE_SEND;
  chatbotId: string;
  data: {
    conversationId: string;
    content: string;
    metadata?: Record<string, any>;
  };
}

export interface ChatMessageReceiveMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.CHAT_MESSAGE_RECEIVE;
  chatbotId: string;
  data: {
    conversationId: string;
    messageId: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, any>;
    vectorSearchResults?: any[];
    createdAt: string;
  };
}

export interface ChatTypingMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.CHAT_TYPING_START | WebSocketMessageType.CHAT_TYPING_STOP;
  chatbotId: string;
  data: {
    conversationId: string;
    userIdentifier: string;
  };
}

export interface ChatMessageStatusMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.CHAT_MESSAGE_STATUS;
  data: {
    messageId: string;
    status: 'sending' | 'sent' | 'delivered' | 'failed';
    error?: string;
  };
}

// Analytics update messages
export interface AnalyticsUpdateMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ANALYTICS_UPDATE;
  data: {
    chatbotId?: string;
    metrics: {
      totalConversations?: number;
      totalMessages?: number;
      uniqueUsers?: number;
      avgResponseTime?: number;
      successRate?: number;
    };
    timeframe: 'realtime' | 'hourly' | 'daily';
  };
}

export interface PerformanceMetricsMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.PERFORMANCE_METRICS;
  data: {
    cpuUsage?: number;
    memoryUsage?: number;
    activeConnections: number;
    messagesPerSecond: number;
    errorRate?: number;
  };
}

// System notification messages
export interface SystemStatusMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.SYSTEM_STATUS;
  data: {
    status: 'online' | 'degraded' | 'offline';
    services: Record<string, 'healthy' | 'degraded' | 'down'>;
    message?: string;
  };
}

export interface ErrorNotificationMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ERROR_NOTIFICATION;
  data: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details?: Record<string, any>;
    actionRequired?: boolean;
  };
}

// Room management messages
export interface JoinRoomMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.JOIN_ROOM;
  data: {
    roomId: string;
    roomType: 'chatbot' | 'admin' | 'user' | 'analytics';
  };
}

export interface LeaveRoomMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.LEAVE_ROOM;
  data: {
    roomId: string;
  };
}

export interface RoomUpdateMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ROOM_UPDATE;
  data: {
    roomId: string;
    activeUsers: number;
    recentActivity?: any;
  };
}

// Union type for all WebSocket messages
export type WebSocketMessage =
  | ConnectionAckMessage
  | HeartbeatPingMessage
  | HeartbeatPongMessage
  | ChatMessageSendMessage
  | ChatMessageReceiveMessage
  | ChatTypingMessage
  | ChatMessageStatusMessage
  | AnalyticsUpdateMessage
  | PerformanceMetricsMessage
  | SystemStatusMessage
  | ErrorNotificationMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | RoomUpdateMessage;

// Validation schemas using Zod
export const baseMessageSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.number(),
  userId: z.string().optional(),
  chatbotId: z.string().optional(),
});

export const chatMessageSendSchema = z.object({
  id: z.string(),
  type: z.literal(WebSocketMessageType.CHAT_MESSAGE_SEND),
  timestamp: z.number(),
  userId: z.string(),
  chatbotId: z.string(),
  data: z.object({
    conversationId: z.string(),
    content: z.string().min(1).max(10000),
    metadata: z.record(z.any()).optional(),
  }),
});

export const joinRoomSchema = z.object({
  id: z.string(),
  type: z.literal(WebSocketMessageType.JOIN_ROOM),
  timestamp: z.number(),
  userId: z.string(),
  data: z.object({
    roomId: z.string(),
    roomType: z.enum(['chatbot', 'admin', 'user', 'analytics']),
  }),
});

export const heartbeatPingSchema = z.object({
  id: z.string(),
  type: z.literal(WebSocketMessageType.HEARTBEAT_PING),
  timestamp: z.number(),
  data: z.object({
    timestamp: z.number(),
  }),
});

// Helper functions for creating messages
export function createWebSocketMessage<T extends WebSocketMessage>(
  type: T['type'],
  data: Omit<T['data'], never>,
  options: {
    userId?: string;
    chatbotId?: string;
  } = {}
): T {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    userId: options.userId,
    chatbotId: options.chatbotId,
    data,
  } as T;
}

export function createConnectionAck(userId: string, connectionId: string): ConnectionAckMessage {
  return createWebSocketMessage(WebSocketMessageType.CONNECTION_ACK, {
    connectionId,
    userId,
    serverTime: Date.now(),
    capabilities: ['chat', 'analytics', 'notifications'],
  }, { userId });
}

export function createHeartbeatPing(): HeartbeatPingMessage {
  const timestamp = Date.now();
  return createWebSocketMessage(WebSocketMessageType.HEARTBEAT_PING, {
    timestamp,
  });
}

export function createHeartbeatPong(): HeartbeatPongMessage {
  const timestamp = Date.now();
  return createWebSocketMessage(WebSocketMessageType.HEARTBEAT_PONG, {
    timestamp,
  });
}

export function createChatMessageReceive(
  conversationId: string,
  messageId: string,
  role: 'user' | 'assistant',
  content: string,
  chatbotId: string,
  metadata?: Record<string, any>
): ChatMessageReceiveMessage {
  return createWebSocketMessage(WebSocketMessageType.CHAT_MESSAGE_RECEIVE, {
    conversationId,
    messageId,
    role,
    content,
    metadata,
    createdAt: new Date().toISOString(),
  }, { chatbotId });
}

export function createAnalyticsUpdate(
  metrics: AnalyticsUpdateMessage['data']['metrics'],
  timeframe: 'realtime' | 'hourly' | 'daily' = 'realtime',
  chatbotId?: string
): AnalyticsUpdateMessage {
  return createWebSocketMessage(WebSocketMessageType.ANALYTICS_UPDATE, {
    chatbotId,
    metrics,
    timeframe,
  }, { chatbotId });
}

export function createErrorNotification(
  severity: 'low' | 'medium' | 'high' | 'critical',
  message: string,
  details?: Record<string, any>
): ErrorNotificationMessage {
  return createWebSocketMessage(WebSocketMessageType.ERROR_NOTIFICATION, {
    severity,
    message,
    details,
    actionRequired: severity === 'high' || severity === 'critical',
  });
}

// WebSocket connection state
export enum WebSocketConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

export interface WebSocketConnectionInfo {
  id: string;
  userId: string;
  state: WebSocketConnectionState;
  connectedAt: number;
  lastPingAt: number;
  lastPongAt: number;
  rooms: Set<string>;
  metadata: Record<string, any>;
}

// Room types and interfaces
export enum RoomType {
  CHATBOT = 'chatbot',
  ADMIN = 'admin',
  USER = 'user',
  ANALYTICS = 'analytics',
  SYSTEM = 'system'
}

export interface Room {
  id: string;
  type: RoomType;
  connections: Set<string>;
  metadata: Record<string, any>;
  createdAt: number;
  lastActivity: number;
}

export interface MessageBroadcastOptions {
  roomId?: string;
  userId?: string;
  excludeConnectionId?: string;
  requiresAuth?: boolean;
  persistent?: boolean;
}