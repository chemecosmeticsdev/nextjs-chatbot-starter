import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { WebSocketAuthMiddleware, WebSocketSecurityConfig } from './auth-middleware';
import { connectionManager } from './connection-manager';
import { messageBroker } from './message-broker';
import {
  WebSocketMessage,
  createErrorNotification
} from './message-types';

export class WebSocketServerManager {
  private wss: WebSocketServer | null = null;
  private httpServer: Server | null = null;

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: Server): void {
    if (this.wss) {
      console.log('WebSocket server already initialized');
      return;
    }

    this.httpServer = httpServer;

    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/api/ws',
      perMessageDeflate: false,
      maxPayload: WebSocketSecurityConfig.maxMessageSize,
      clientTracking: true
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleServerError.bind(this));

    console.log('WebSocket server initialized on /api/ws');
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      // Authenticate the connection
      const authResult = await WebSocketAuthMiddleware.authenticate(request);

      if (!authResult.success || !authResult.user || !authResult.connectionId) {
        console.warn('WebSocket authentication failed:', authResult.error);
        socket.close(1008, authResult.error || 'Authentication failed');
        return;
      }

      // Validate CORS
      const origin = request.headers.origin;
      if (origin && !this.isOriginAllowed(origin)) {
        console.warn(`WebSocket connection rejected - invalid origin: ${origin}`);
        socket.close(1008, 'Origin not allowed');
        return;
      }

      // Check connection limits
      const userConnections = connectionManager.getUserConnections(authResult.user.id);
      if (userConnections.length >= WebSocketSecurityConfig.maxConnectionsPerUser) {
        console.warn(`User ${authResult.user.id} exceeded connection limit`);
        socket.close(1008, 'Connection limit exceeded');
        return;
      }

      // Extract connection metadata
      const metadata = WebSocketAuthMiddleware.extractConnectionMetadata(request);
      metadata.role = authResult.user.role;

      // Add connection to manager
      connectionManager.addConnection(
        socket,
        authResult.connectionId,
        authResult.user.id,
        metadata
      );

      console.log(`WebSocket connected: ${authResult.connectionId} for user ${authResult.user.email}`);

      // Set up event handlers
      this.setupSocketEventHandlers(socket, authResult.connectionId, authResult.user.id);

      // Deliver any queued messages
      messageBroker.deliverQueuedMessages(authResult.user.id);

    } catch (error) {
      console.error('WebSocket connection setup error:', error);
      socket.close(1011, 'Internal server error');
    }
  }

  /**
   * Set up event handlers for a WebSocket connection
   */
  private setupSocketEventHandlers(socket: WebSocket, connectionId: string, userId: string): void {
    // Handle incoming messages
    socket.on('message', async (data: Buffer) => {
      await this.handleMessage(socket, connectionId, userId, data);
    });

    // Handle connection close
    socket.on('close', (code: number, reason: Buffer) => {
      console.log(`WebSocket disconnected: ${connectionId}, code: ${code}, reason: ${reason.toString()}`);
      connectionManager.removeConnection(connectionId);
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      console.error(`WebSocket error for ${connectionId}:`, error);
      connectionManager.removeConnection(connectionId);
    });

    // Handle pong responses
    socket.on('pong', () => {
      const connection = connectionManager.getConnection(connectionId);
      if (connection) {
        // Connection manager will update last pong time
        console.debug(`Pong received from ${connectionId}`);
      }
    });

    // Set connection timeout
    const timeout = setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        console.log(`Connection timeout for ${connectionId}`);
        socket.close(1000, 'Connection timeout');
      }
    }, WebSocketSecurityConfig.connectionTimeout);

    socket.on('close', () => clearTimeout(timeout));
    socket.on('error', () => clearTimeout(timeout));
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(
    socket: WebSocket,
    connectionId: string,
    userId: string,
    data: Buffer
  ): Promise<void> {
    try {
      // Check message size
      if (data.length > WebSocketSecurityConfig.maxMessageSize) {
        const errorMessage = createErrorNotification(
          'medium',
          'Message too large',
          { maxSize: WebSocketSecurityConfig.maxMessageSize }
        );
        connectionManager.sendToConnection(connectionId, errorMessage);
        return;
      }

      // Parse message
      const rawMessage = data.toString('utf8');
      let message: WebSocketMessage;

      try {
        message = JSON.parse(rawMessage);
      } catch (parseError) {
        const errorMessage = createErrorNotification(
          'low',
          'Invalid message format'
        );
        connectionManager.sendToConnection(connectionId, errorMessage);
        return;
      }

      // Rate limiting check
      const rateLimitResult = WebSocketAuthMiddleware.checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        const errorMessage = createErrorNotification(
          'medium',
          'Rate limit exceeded',
          {
            resetTime: rateLimitResult.resetTime,
            remaining: rateLimitResult.remaining
          }
        );
        connectionManager.sendToConnection(connectionId, errorMessage);
        return;
      }

      // Handle the message through connection manager first
      connectionManager.handleMessage(connectionId, rawMessage);

      // Then process through message broker for business logic
      await messageBroker.processMessage(connectionId, message);

    } catch (error) {
      console.error(`Message handling error for ${connectionId}:`, error);

      const errorMessage = createErrorNotification(
        'high',
        'Message processing failed',
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      connectionManager.sendToConnection(connectionId, errorMessage);
    }
  }

  /**
   * Handle WebSocket server errors
   */
  private handleServerError(error: Error): void {
    console.error('WebSocket server error:', error);
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    return WebSocketSecurityConfig.allowedOrigins.includes(origin) ||
           WebSocketSecurityConfig.allowedOrigins.includes('*');
  }

  /**
   * Get server statistics
   */
  getStats(): {
    isRunning: boolean;
    clientCount: number;
    connectionStats: any;
    brokerStats: any;
  } {
    return {
      isRunning: this.wss !== null,
      clientCount: this.wss?.clients.size || 0,
      connectionStats: connectionManager.getStats(),
      brokerStats: messageBroker.getStats()
    };
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: WebSocketMessage): number {
    return messageBroker.broadcastToAll(message);
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }

      console.log('Shutting down WebSocket server...');

      // Close all client connections
      this.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1001, 'Server shutting down');
        }
      });

      // Close the server
      this.wss.close(() => {
        console.log('WebSocket server shut down');
        this.wss = null;
        resolve();
      });

      // Cleanup managers
      connectionManager.shutdown();
      messageBroker.shutdown();
    });
  }
}

// Global WebSocket server manager instance
export const webSocketServer = new WebSocketServerManager();

// Setup graceful shutdown
process.on('SIGTERM', async () => {
  await webSocketServer.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await webSocketServer.shutdown();
  process.exit(0);
});