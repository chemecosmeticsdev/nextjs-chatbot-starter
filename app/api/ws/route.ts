import { NextRequest } from 'next/server';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { WebSocketAuthMiddleware, WebSocketSecurityConfig } from '@/lib/websocket/auth-middleware';
import { connectionManager } from '@/lib/websocket/connection-manager';
import { messageBroker } from '@/lib/websocket/message-broker';
import {
  WebSocketMessage,
  WebSocketMessageType,
  createErrorNotification
} from '@/lib/websocket/message-types';

// Global WebSocket server instance
let wss: WebSocketServer | null = null;

/**
 * Handle WebSocket upgrade request
 */
export async function GET(request: NextRequest) {
  try {
    // Check if this is a WebSocket upgrade request
    const upgrade = request.headers.get('upgrade');
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 400 });
    }

    // Initialize WebSocket server if not already created
    if (!wss) {
      wss = new WebSocketServer({
        noServer: true,
        perMessageDeflate: false,
        maxPayload: WebSocketSecurityConfig.maxMessageSize
      });

      wss.on('connection', handleWebSocketConnection);
    }

    // Handle the upgrade
    return new Response(null, {
      status: 101,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Accept': generateAcceptKey(request.headers.get('sec-websocket-key') || ''),
      },
    });

  } catch (error) {
    console.error('WebSocket upgrade error:', error);
    return new Response('WebSocket upgrade failed', { status: 500 });
  }
}

/**
 * Handle new WebSocket connection
 */
async function handleWebSocketConnection(socket: WebSocket, request: IncomingMessage) {
  try {
    // Authenticate the connection
    const authResult = await WebSocketAuthMiddleware.authenticate(request);

    if (!authResult.success || !authResult.user || !authResult.connectionId) {
      console.warn('WebSocket authentication failed:', authResult.error);
      socket.close(1008, authResult.error || 'Authentication failed');
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
    const connectionInfo = connectionManager.addConnection(
      socket,
      authResult.connectionId,
      authResult.user.id,
      metadata
    );

    console.log(`WebSocket connected: ${authResult.connectionId} for user ${authResult.user.email}`);

    // Set up event handlers
    setupSocketEventHandlers(socket, authResult.connectionId, authResult.user.id);

    // Deliver any queued messages
    messageBroker.deliverQueuedMessages(authResult.user.id);

  } catch (error) {
    console.error('WebSocket connection setup error:', error);
    socket.close(1011, 'Internal server error');
  }
}

/**
 * Set up event handlers for WebSocket
 */
function setupSocketEventHandlers(socket: WebSocket, connectionId: string, userId: string) {
  // Handle incoming messages
  socket.on('message', async (data: Buffer) => {
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
      // Update last pong time (handled in connection manager)
      console.debug(`Pong received from ${connectionId}`);
    }
  });
}

/**
 * Generate WebSocket accept key (simplified version)
 */
function generateAcceptKey(key: string): string {
  const crypto = require('crypto');
  const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  return crypto
    .createHash('sha1')
    .update(key + WEBSOCKET_MAGIC_STRING)
    .digest('base64');
}

/**
 * Handle server shutdown gracefully
 */
process.on('SIGTERM', () => {
  console.log('Shutting down WebSocket server...');

  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, 'Server shutting down');
      }
    });
    wss.close();
  }

  connectionManager.shutdown();
  messageBroker.shutdown();
});

process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...');

  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, 'Server shutting down');
      }
    });
    wss.close();
  }

  connectionManager.shutdown();
  messageBroker.shutdown();
});