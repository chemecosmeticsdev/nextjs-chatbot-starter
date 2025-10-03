import { WebSocket } from 'ws';
import {
  WebSocketConnectionInfo,
  WebSocketConnectionState,
  Room,
  RoomType,
  WebSocketMessage,
  WebSocketMessageType,
  createConnectionAck,
  createHeartbeatPing,
  MessageBroadcastOptions
} from './message-types';

export class ConnectionManager {
  private connections = new Map<string, WebSocketConnectionInfo & { socket: WebSocket }>();
  private userConnections = new Map<string, Set<string>>(); // userId -> connectionIds
  private rooms = new Map<string, Room>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
    this.startCleanup();
  }

  /**
   * Add a new WebSocket connection
   */
  addConnection(
    socket: WebSocket,
    connectionId: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): WebSocketConnectionInfo {
    const connectionInfo: WebSocketConnectionInfo & { socket: WebSocket } = {
      socket,
      id: connectionId,
      userId,
      state: WebSocketConnectionState.CONNECTED,
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
      lastPongAt: Date.now(),
      rooms: new Set(),
      metadata
    };

    this.connections.set(connectionId, connectionInfo);

    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    // Send connection acknowledgment
    this.sendToConnection(connectionId, createConnectionAck(userId, connectionId));

    // Auto-join user to their personal room
    this.joinRoom(connectionId, `user:${userId}`, RoomType.USER);

    console.log(`WebSocket connection added: ${connectionId} for user ${userId}`);
    return connectionInfo;
  }

  /**
   * Remove a WebSocket connection
   */
  removeConnection(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    // Remove from all rooms
    connection.rooms.forEach(roomId => {
      this.leaveRoom(connectionId, roomId);
    });

    // Remove from user connections
    const userConnections = this.userConnections.get(connection.userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // Close socket if still open
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.close();
    }

    this.connections.delete(connectionId);
    console.log(`WebSocket connection removed: ${connectionId}`);
    return true;
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): (WebSocketConnectionInfo & { socket: WebSocket }) | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections for a user
   */
  getUserConnections(userId: string): (WebSocketConnectionInfo & { socket: WebSocket })[] {
    const connectionIds = this.userConnections.get(userId) || new Set();
    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter(Boolean) as (WebSocketConnectionInfo & { socket: WebSocket })[];
  }

  /**
   * Join a room
   */
  joinRoom(connectionId: string, roomId: string, roomType: RoomType = RoomType.CHATBOT): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        type: roomType,
        connections: new Set(),
        metadata: {},
        createdAt: Date.now(),
        lastActivity: Date.now()
      });
    }

    const room = this.rooms.get(roomId)!;
    room.connections.add(connectionId);
    room.lastActivity = Date.now();
    connection.rooms.add(roomId);

    console.log(`Connection ${connectionId} joined room ${roomId}`);
    return true;
  }

  /**
   * Leave a room
   */
  leaveRoom(connectionId: string, roomId: string): boolean {
    const connection = this.connections.get(connectionId);
    const room = this.rooms.get(roomId);

    if (!connection || !room) {
      return false;
    }

    room.connections.delete(connectionId);
    connection.rooms.delete(roomId);

    // Clean up empty rooms (except system rooms)
    if (room.connections.size === 0 && !roomId.startsWith('system:')) {
      this.rooms.delete(roomId);
    }

    console.log(`Connection ${connectionId} left room ${roomId}`);
    return true;
  }

  /**
   * Send message to a specific connection
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Failed to send message to connection ${connectionId}:`, error);
      this.removeConnection(connectionId);
      return false;
    }
  }

  /**
   * Send message to a user (all their connections)
   */
  sendToUser(userId: string, message: WebSocketMessage): number {
    const connections = this.getUserConnections(userId);
    let sentCount = 0;

    connections.forEach(connection => {
      if (this.sendToConnection(connection.id, message)) {
        sentCount++;
      }
    });

    return sentCount;
  }

  /**
   * Broadcast message to a room
   */
  broadcastToRoom(roomId: string, message: WebSocketMessage, excludeConnectionId?: string): number {
    const room = this.rooms.get(roomId);
    if (!room) {
      return 0;
    }

    let sentCount = 0;
    room.connections.forEach(connectionId => {
      if (connectionId !== excludeConnectionId) {
        if (this.sendToConnection(connectionId, message)) {
          sentCount++;
        }
      }
    });

    room.lastActivity = Date.now();
    return sentCount;
  }

  /**
   * Broadcast message with flexible options
   */
  broadcast(message: WebSocketMessage, options: MessageBroadcastOptions = {}): number {
    let sentCount = 0;

    if (options.roomId) {
      return this.broadcastToRoom(options.roomId, message, options.excludeConnectionId);
    }

    if (options.userId) {
      return this.sendToUser(options.userId, message);
    }

    // Broadcast to all connections
    this.connections.forEach((connection, connectionId) => {
      if (connectionId !== options.excludeConnectionId) {
        if (this.sendToConnection(connectionId, message)) {
          sentCount++;
        }
      }
    });

    return sentCount;
  }

  /**
   * Handle incoming message
   */
  handleMessage(connectionId: string, rawMessage: string): void {
    try {
      const message = JSON.parse(rawMessage) as WebSocketMessage;
      const connection = this.connections.get(connectionId);

      if (!connection) {
        console.warn(`Received message from unknown connection: ${connectionId}`);
        return;
      }

      // Update last activity
      connection.lastPingAt = Date.now();

      // Handle different message types
      switch (message.type) {
        case WebSocketMessageType.HEARTBEAT_PONG:
          connection.lastPongAt = Date.now();
          break;

        case WebSocketMessageType.JOIN_ROOM:
          if ('data' in message && message.data && 'roomId' in message.data) {
            this.joinRoom(connectionId, message.data.roomId, message.data.roomType as RoomType);
          }
          break;

        case WebSocketMessageType.LEAVE_ROOM:
          if ('data' in message && message.data && 'roomId' in message.data) {
            this.leaveRoom(connectionId, message.data.roomId);
          }
          break;

        case WebSocketMessageType.CHAT_MESSAGE_SEND:
          // Forward to message broker for processing
          this.handleChatMessage(connectionId, message);
          break;

        default:
          console.log(`Received unhandled message type: ${message.type} from ${connectionId}`);
      }
    } catch (error) {
      console.error(`Failed to parse message from ${connectionId}:`, error);
    }
  }

  /**
   * Handle chat messages (to be implemented with message broker)
   */
  private handleChatMessage(connectionId: string, message: WebSocketMessage): void {
    // This will be implemented when we integrate with the message broker
    console.log(`Chat message received from ${connectionId}:`, message);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const pingMessage = createHeartbeatPing();

      this.connections.forEach((connection, connectionId) => {
        if (connection.socket.readyState === WebSocket.OPEN) {
          this.sendToConnection(connectionId, pingMessage);
        }
      });
    }, 30000); // Send ping every 30 seconds
  }

  /**
   * Start cleanup process for stale connections
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleConnections: string[] = [];

      this.connections.forEach((connection, connectionId) => {
        // Remove connections that haven't ponged in 60 seconds
        if (now - connection.lastPongAt > 60000) {
          staleConnections.push(connectionId);
        }
      });

      staleConnections.forEach(connectionId => {
        console.log(`Removing stale connection: ${connectionId}`);
        this.removeConnection(connectionId);
      });
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    totalUsers: number;
    totalRooms: number;
    roomStats: Array<{ roomId: string; type: string; connections: number }>;
  } {
    return {
      totalConnections: this.connections.size,
      totalUsers: this.userConnections.size,
      totalRooms: this.rooms.size,
      roomStats: Array.from(this.rooms.values()).map(room => ({
        roomId: room.id,
        type: room.type,
        connections: room.connections.size
      }))
    };
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all connections
    this.connections.forEach((connection, connectionId) => {
      this.removeConnection(connectionId);
    });

    this.connections.clear();
    this.userConnections.clear();
    this.rooms.clear();
  }
}

// Global connection manager instance
export const connectionManager = new ConnectionManager();