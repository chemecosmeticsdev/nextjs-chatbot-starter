"use client";

import {
  WebSocketMessage,
  WebSocketMessageType,
  WebSocketConnectionState,
  createWebSocketMessage,
  createHeartbeatPong,
  chatMessageSendSchema,
  joinRoomSchema
} from './message-types';

export interface WebSocketClientConfig {
  url: string;
  token: string;
  userId?: string;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectInterval: number;
  heartbeatInterval: number;
}

export interface WebSocketClientEvents {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
  onStateChange?: (state: WebSocketConnectionState) => void;
  onConnectionAck?: (data: any) => void;
  onChatMessage?: (message: any) => void;
  onAnalyticsUpdate?: (data: any) => void;
  onSystemStatus?: (status: any) => void;
  onErrorNotification?: (error: any) => void;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private config: WebSocketClientConfig;
  private events: WebSocketClientEvents;
  private state: WebSocketConnectionState = WebSocketConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private connectionId: string | null = null;

  constructor(config: WebSocketClientConfig, events: WebSocketClientEvents = {}) {
    this.config = config;
    this.events = events;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.setState(WebSocketConnectionState.CONNECTING);

    try {
      // Construct WebSocket URL with token
      const url = new URL(this.config.url);
      url.searchParams.set('token', this.config.token);

      this.socket = new WebSocket(url.toString());
      this.setupEventHandlers();

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.setState(WebSocketConnectionState.ERROR);
      this.events.onError?.(error as Event);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.config.autoReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.setState(WebSocketConnectionState.DISCONNECTED);
  }

  /**
   * Send message to server
   */
  send(message: WebSocketMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Queue message for later if auto-reconnect is enabled
      if (this.config.autoReconnect) {
        this.messageQueue.push(message);
        console.log('Message queued (connection not ready)');
        return false;
      }
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  /**
   * Send chat message
   */
  sendChatMessage(chatbotId: string, conversationId: string, content: string, metadata?: Record<string, any>): boolean {
    const message = createWebSocketMessage(WebSocketMessageType.CHAT_MESSAGE_SEND, {
      conversationId,
      content,
      metadata
    }, {
      chatbotId,
      userId: this.config.userId
    });

    // Validate message before sending
    try {
      chatMessageSendSchema.parse(message);
      return this.send(message);
    } catch (error) {
      console.error('Invalid chat message:', error);
      return false;
    }
  }

  /**
   * Join a room
   */
  joinRoom(roomId: string, roomType: 'chatbot' | 'admin' | 'user' | 'analytics' = 'chatbot'): boolean {
    const message = createWebSocketMessage(WebSocketMessageType.JOIN_ROOM, {
      roomId,
      roomType
    }, {
      userId: this.config.userId
    });

    try {
      joinRoomSchema.parse(message);
      return this.send(message);
    } catch (error) {
      console.error('Invalid join room message:', error);
      return false;
    }
  }

  /**
   * Leave a room
   */
  leaveRoom(roomId: string): boolean {
    const message = createWebSocketMessage(WebSocketMessageType.LEAVE_ROOM, {
      roomId
    });

    return this.send(message);
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketConnectionState {
    return this.state;
  }

  /**
   * Get connection ID (available after connection acknowledgment)
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === WebSocketConnectionState.CONNECTED;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WebSocketClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Update event handlers
   */
  updateEvents(newEvents: Partial<WebSocketClientEvents>): void {
    this.events = { ...this.events, ...newEvents };
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.setState(WebSocketConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.events.onOpen?.();
      this.startHeartbeat();
      this.processMessageQueue();
    };

    this.socket.onclose = (event) => {
      console.log(`WebSocket disconnected: ${event.code} - ${event.reason}`);
      this.setState(WebSocketConnectionState.DISCONNECTED);
      this.events.onClose?.(event.code, event.reason);
      this.stopHeartbeat();

      if (this.config.autoReconnect && event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.setState(WebSocketConnectionState.ERROR);
      this.events.onError?.(error);
    };

    this.socket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WebSocketMessage): void {
    // Call general message handler
    this.events.onMessage?.(message);

    // Handle specific message types
    switch (message.type) {
      case WebSocketMessageType.CONNECTION_ACK:
        if ('data' in message && message.data && 'connectionId' in message.data) {
          this.connectionId = message.data.connectionId;
          this.events.onConnectionAck?.(message.data);
        }
        break;

      case WebSocketMessageType.HEARTBEAT_PING:
        // Respond with pong
        if ('data' in message && message.data && 'timestamp' in message.data) {
          const pongMessage = createHeartbeatPong();
          if ('data' in pongMessage) {
            pongMessage.data.latency = Date.now() - message.data.timestamp;
          }
          this.send(pongMessage);
        }
        break;

      case WebSocketMessageType.CHAT_MESSAGE_RECEIVE:
        this.events.onChatMessage?.(message);
        break;

      case WebSocketMessageType.ANALYTICS_UPDATE:
        this.events.onAnalyticsUpdate?.(message);
        break;

      case WebSocketMessageType.SYSTEM_STATUS:
        this.events.onSystemStatus?.(message);
        break;

      case WebSocketMessageType.ERROR_NOTIFICATION:
        this.events.onErrorNotification?.(message);
        break;

      default:
        console.log(`Unhandled message type: ${message.type}`);
    }
  }

  /**
   * Set connection state and notify listeners
   */
  private setState(newState: WebSocketConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.events.onStateChange?.(newState);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (!this.config.autoReconnect || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    // Prevent multiple simultaneous reconnection attempts
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 60000); // Slower exponential backoff, max 60s

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      console.log(`Reconnection attempt ${this.reconnectAttempts}`);
      this.reconnectTimeout = null;

      // Only reconnect if we're not already connected
      if (this.state !== WebSocketConnectionState.CONNECTED && this.state !== WebSocketConnectionState.CONNECTING) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Server handles heartbeat, client just needs to respond to pings
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }
  }
}

/**
 * Create WebSocket client with default configuration
 */
export function createWebSocketClient(
  token: string,
  events: WebSocketClientEvents = {},
  userId?: string
): WebSocketClient {
  // Environment-aware WebSocket URL construction
  const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';

  let wsUrl: string;

  if (isDevelopment) {
    // Development: Use localhost with dedicated WebSocket port
    wsUrl = `ws://localhost:3001/api/ws`;
  } else {
    // Production: Use environment variable or construct from current host
    const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL ||
                     (typeof window !== 'undefined' ? window.location.origin : '');

    if (wsBaseUrl) {
      // Replace http/https with ws/wss and add WebSocket path
      const wsProtocol = wsBaseUrl.startsWith('https') ? 'wss:' : 'ws:';
      const wsHost = wsBaseUrl.replace(/^https?:\/\//, '');

      // For production, use standard ports without explicit port numbers
      wsUrl = `${wsProtocol}//${wsHost}/api/ws`;
    } else {
      // Fallback to current window location (backward compatibility)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : '';
      wsUrl = `${protocol}//${host}${port}/api/ws`;
    }
  }

  const config: WebSocketClientConfig = {
    url: wsUrl,
    token,
    userId,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 1000,
    heartbeatInterval: 30000
  };

  return new WebSocketClient(config, events);
}