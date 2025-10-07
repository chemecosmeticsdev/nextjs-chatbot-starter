/**
 * Development WebSocket Server
 * Runs alongside Next.js development server to handle WebSocket connections
 */

import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'url';
import { WebSocketAuthMiddleware, WebSocketSecurityConfig } from './auth-middleware';
import { connectionManager } from './connection-manager';
import { messageBroker } from './message-broker';
import {
  WebSocketMessage,
  WebSocketMessageType,
  createErrorNotification,
  createConnectionAck
} from './message-types';

let server: Server | null = null;
let wss: WebSocketServer | null = null;
let isStarted = false;
const handledSockets = new WeakSet<any>();
const pendingUpgrades = new Map<any, boolean>();
let upgradeHandler: ((request: any, socket: any, head: any) => void) | null = null;

/**
 * Start WebSocket server for development
 */
export async function startWebSocketServer(): Promise<void> {
  if (isStarted) {
    console.log('WebSocket server already running');
    return;
  }

  // Clean up any existing instances first
  await stopWebSocketServer();

  try {
    // Create HTTP server for WebSocket
    server = createServer();

    // Create WebSocket server
    wss = new WebSocketServer({
      server,
      perMessageDeflate: false,
      maxPayload: WebSocketSecurityConfig.maxMessageSize,
      clientTracking: true
    });

    // Set up WebSocket connection handler
    wss.on('connection', handleConnection);
    wss.on('error', handleServerError);

    // Handle HTTP upgrade requests for WebSocket
    upgradeHandler = (request: any, socket: any, head: any) => {
      try {
        const { pathname } = parse(request.url || '');

        if (pathname === '/api/ws') {
          // Enhanced socket deduplication with timeout-based cleanup
          const socketKey = `${socket.remoteAddress}:${socket.remotePort}:${Date.now()}`;

          if (handledSockets.has(socket) ||
              socket.destroyed ||
              socket.readyState !== 'open' ||
              pendingUpgrades.has(socket)) {
            console.log('Skipping duplicate upgrade attempt for socket');
            return;
          }

          // Mark socket as being upgraded to prevent race conditions
          pendingUpgrades.set(socket, true);
          handledSockets.add(socket);

          // Timeout cleanup for pending upgrades
          const upgradeTimeout = setTimeout(() => {
            if (pendingUpgrades.has(socket)) {
              console.warn('Upgrade timeout - cleaning up socket');
              pendingUpgrades.delete(socket);
              if (!socket.destroyed) {
                socket.destroy();
              }
            }
          }, 5000);

          // Add error handler
          socket.once('error', (error: Error) => {
            console.error('Socket error during upgrade:', error);
            clearTimeout(upgradeTimeout);
            pendingUpgrades.delete(socket);
            if (!socket.destroyed) {
              socket.destroy();
            }
          });

          // Add close handler to cleanup
          socket.once('close', () => {
            clearTimeout(upgradeTimeout);
            pendingUpgrades.delete(socket);
          });

          try {
            wss!.handleUpgrade(request, socket, head, (ws) => {
              // Remove from pending upgrades when successful
              clearTimeout(upgradeTimeout);
              pendingUpgrades.delete(socket);
              wss!.emit('connection', ws, request);
            });
          } catch (upgradeError) {
            console.error('WebSocket handleUpgrade error:', upgradeError);
            clearTimeout(upgradeTimeout);
            pendingUpgrades.delete(socket);
            if (!socket.destroyed) {
              socket.destroy();
            }
          }
        } else {
          if (!socket.destroyed) {
            socket.destroy();
          }
        }
      } catch (error) {
        console.error('WebSocket upgrade error:', error);
        if (pendingUpgrades.has(socket)) {
          pendingUpgrades.delete(socket);
        }
        if (!socket.destroyed) {
          socket.destroy();
        }
      }
    };

    // Remove any existing upgrade handler before adding new one
    if (server.listeners('upgrade').length > 0) {
      server.removeAllListeners('upgrade');
    }
    server.on('upgrade', upgradeHandler);

    // Start the server on port 3001 (WebSocket only)
    const WS_PORT = 3001;

    await new Promise<void>((resolve, reject) => {
      server!.listen(WS_PORT, () => {
        console.log(`✓ WebSocket server running on ws://localhost:${WS_PORT}/api/ws`);
        isStarted = true;
        resolve();
      });

      server!.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`WebSocket port ${WS_PORT} already in use, WebSocket server may already be running`);
          isStarted = true;
          resolve();
        } else {
          reject(error);
        }
      });
    });

  } catch (error) {
    console.error('Failed to start WebSocket server:', error);
    throw error;
  }
}

/**
 * Handle new WebSocket connection
 */
async function handleConnection(socket: WebSocket, request: any): Promise<void> {
  try {
    console.log('New WebSocket connection attempt');

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
    connectionManager.addConnection(
      socket,
      authResult.connectionId,
      authResult.user.id,
      metadata
    );

    console.log(`WebSocket connected: ${authResult.connectionId} for user ${authResult.user.email}`);

    // Send connection acknowledgment
    const ackMessage = createConnectionAck(authResult.connectionId, {
      userId: authResult.user.id,
      connectedAt: Date.now(),
      serverVersion: '1.0.0'
    });
    connectionManager.sendToConnection(authResult.connectionId, ackMessage);

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
function setupSocketEventHandlers(socket: WebSocket, connectionId: string, userId: string): void {
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
      console.debug(`Pong received from ${connectionId}`);
    }
  });
}

/**
 * Handle WebSocket server errors
 */
function handleServerError(error: Error): void {
  console.error('WebSocket server error:', error);
}

/**
 * Stop WebSocket server
 */
export async function stopWebSocketServer(): Promise<void> {
  if (!isStarted && !server && !wss) {
    return;
  }

  console.log('Stopping WebSocket server...');

  try {
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1001, 'Server shutting down');
        }
      });
      wss.removeAllListeners();
      wss.close();
      wss = null;
    }

    if (server) {
      // Remove the specific upgrade handler
      if (upgradeHandler) {
        server.removeListener('upgrade', upgradeHandler);
        upgradeHandler = null;
      }
      server.removeAllListeners();
      await new Promise<void>((resolve) => {
        server!.close(() => {
          server = null;
          resolve();
        });
      });
    }

    connectionManager.shutdown();
    messageBroker.shutdown();

    // Clear pending upgrades tracking
    pendingUpgrades.clear();
  } catch (error) {
    console.error('Error stopping WebSocket server:', error);
  } finally {
    isStarted = false;
    console.log('WebSocket server stopped');
  }
}

// Graceful shutdown
process.on('SIGTERM', stopWebSocketServer);
process.on('SIGINT', stopWebSocketServer);