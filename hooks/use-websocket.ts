"use client";

import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { WebSocketClient, createWebSocketClient, WebSocketClientEvents } from '@/lib/websocket/client';
import {
  WebSocketMessage,
  WebSocketConnectionState,
  WebSocketMessageType
} from '@/lib/websocket/message-types';

// WebSocket context for sharing connection across components
import { createContext } from 'react';

interface WebSocketContextType {
  client: WebSocketClient | null;
  isConnected: boolean;
  connectionState: WebSocketConnectionState;
  connectionId: string | null;
  connect: (token: string) => void;
  disconnect: () => void;
}

export const WebSocketContext = createContext<WebSocketContextType>({
  client: null,
  isConnected: false,
  connectionState: WebSocketConnectionState.DISCONNECTED,
  connectionId: null,
  connect: () => {},
  disconnect: () => {}
});

// Hook for using WebSocket connection
export function useWebSocket(token?: string) {
  const context = useContext(WebSocketContext);

  if (context.client) {
    // Use shared context if available
    return context;
  }

  // Fallback to individual connection
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>(
    WebSocketConnectionState.DISCONNECTED
  );
  const [connectionId, setConnectionId] = useState<string | null>(null);

  useEffect(() => {
    if (token && !client) {
      const newClient = createWebSocketClient(token, {
        onStateChange: setConnectionState,
        onConnectionAck: (data) => setConnectionId(data.connectionId)
      });
      setClient(newClient);
      newClient.connect();
    }

    return () => {
      if (client) {
        client.disconnect();
      }
    };
  }, [token]);

  const connect = useCallback((newToken: string) => {
    if (client) {
      client.updateConfig({ token: newToken });
      client.connect();
    }
  }, [client]);

  const disconnect = useCallback(() => {
    if (client) {
      client.disconnect();
    }
  }, [client]);

  return {
    client,
    isConnected: connectionState === WebSocketConnectionState.CONNECTED,
    connectionState,
    connectionId,
    connect,
    disconnect
  };
}

// Hook for chat functionality
export function useWebSocketChat(chatbotId: string) {
  const { client, isConnected } = useWebSocket();
  const [messages, setMessages] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);

  // Join chatbot room when connected
  useEffect(() => {
    if (client && isConnected && chatbotId) {
      client.joinRoom(`chatbot:${chatbotId}`, 'chatbot');

      const handleChatMessage = (message: WebSocketMessage) => {
        if (message.type === WebSocketMessageType.CHAT_MESSAGE_RECEIVE) {
          setMessages(prev => [...prev, message]);
        }
      };

      const handleTyping = (message: WebSocketMessage) => {
        if (message.type === WebSocketMessageType.CHAT_TYPING_START) {
          if ('data' in message && message.data && 'userIdentifier' in message.data) {
            setTypingUsers(prev => new Set([...prev, message.data.userIdentifier]));
          }
        } else if (message.type === WebSocketMessageType.CHAT_TYPING_STOP) {
          if ('data' in message && message.data && 'userIdentifier' in message.data) {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(message.data.userIdentifier);
              return newSet;
            });
          }
        }
      };

      client.updateEvents({
        onChatMessage: handleChatMessage,
        onMessage: (message) => {
          if (message.type === WebSocketMessageType.CHAT_TYPING_START ||
              message.type === WebSocketMessageType.CHAT_TYPING_STOP) {
            handleTyping(message);
          }
        }
      });

      return () => {
        client.leaveRoom(`chatbot:${chatbotId}`);
      };
    }
  }, [client, isConnected, chatbotId]);

  const sendMessage = useCallback((conversationId: string, content: string, metadata?: Record<string, any>) => {
    if (client && isConnected) {
      return client.sendChatMessage(chatbotId, conversationId, content, metadata);
    }
    return false;
  }, [client, isConnected, chatbotId]);

  const startTyping = useCallback((conversationId: string) => {
    if (client && isConnected && !isTyping) {
      // Send typing start indicator
      // Implementation would depend on your typing indicator system
      setIsTyping(true);
    }
  }, [client, isConnected, isTyping]);

  const stopTyping = useCallback((conversationId: string) => {
    if (client && isConnected && isTyping) {
      // Send typing stop indicator
      setIsTyping(false);
    }
  }, [client, isConnected, isTyping]);

  return {
    messages,
    typingUsers: Array.from(typingUsers),
    isTyping,
    sendMessage,
    startTyping,
    stopTyping
  };
}

// Hook for real-time analytics
export function useWebSocketAnalytics(chatbotId?: string) {
  const { client, isConnected } = useWebSocket();
  const [analytics, setAnalytics] = useState<any>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);

  useEffect(() => {
    if (client && isConnected) {
      // Join analytics rooms
      client.joinRoom('analytics:realtime', 'analytics');
      if (chatbotId) {
        client.joinRoom(`analytics:chatbot:${chatbotId}`, 'analytics');
      }

      const handleAnalyticsUpdate = (message: WebSocketMessage) => {
        if (message.type === WebSocketMessageType.ANALYTICS_UPDATE) {
          setAnalytics(message);
        } else if (message.type === WebSocketMessageType.PERFORMANCE_METRICS) {
          setPerformanceMetrics(message);
        }
      };

      client.updateEvents({
        onAnalyticsUpdate: handleAnalyticsUpdate,
        onMessage: (message) => {
          if (message.type === WebSocketMessageType.PERFORMANCE_METRICS) {
            handleAnalyticsUpdate(message);
          }
        }
      });

      return () => {
        client.leaveRoom('analytics:realtime');
        if (chatbotId) {
          client.leaveRoom(`analytics:chatbot:${chatbotId}`);
        }
      };
    }
  }, [client, isConnected, chatbotId]);

  return {
    analytics,
    performanceMetrics
  };
}

// Hook for system status monitoring
export function useWebSocketStatus() {
  const { client, isConnected } = useWebSocket();
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [errors, setErrors] = useState<any[]>([]);

  useEffect(() => {
    if (client && isConnected) {
      client.joinRoom('system:status', 'system');

      const handleSystemMessage = (message: WebSocketMessage) => {
        if (message.type === WebSocketMessageType.SYSTEM_STATUS) {
          setSystemStatus(message);
        } else if (message.type === WebSocketMessageType.ERROR_NOTIFICATION) {
          setErrors(prev => [...prev.slice(-9), message]); // Keep last 10 errors
        }
      };

      client.updateEvents({
        onSystemStatus: handleSystemMessage,
        onErrorNotification: handleSystemMessage
      });

      return () => {
        client.leaveRoom('system:status');
      };
    }
  }, [client, isConnected]);

  return {
    systemStatus,
    errors
  };
}

// Hook for connection status and health
export function useConnectionStatus() {
  const { client, connectionState, connectionId } = useWebSocket();
  const [latency, setLatency] = useState<number>(0);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  useEffect(() => {
    if (client) {
      const handleMessage = (message: WebSocketMessage) => {
        setLastActivity(Date.now());

        // Track latency from heartbeat pongs
        if (message.type === WebSocketMessageType.HEARTBEAT_PONG &&
            'data' in message && message.data && 'latency' in message.data) {
          setLatency(message.data.latency);
        }
      };

      client.updateEvents({ onMessage: handleMessage });
    }
  }, [client]);

  return {
    connectionState,
    connectionId,
    latency,
    lastActivity,
    isHealthy: connectionState === WebSocketConnectionState.CONNECTED && latency < 1000
  };
}

// Hook for managing WebSocket connection with auto-retry
export function useWebSocketConnection(token: string, options: {
  autoConnect?: boolean;
  retryOnError?: boolean;
  maxRetries?: number;
} = {}) {
  const {
    autoConnect = true,
    retryOnError = true,
    maxRetries = 5
  } = options;

  const clientRef = useRef<WebSocketClient | null>(null);
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>(
    WebSocketConnectionState.DISCONNECTED
  );
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  const events: WebSocketClientEvents = {
    onStateChange: setConnectionState,
    onConnectionAck: (data) => {
      setConnectionId(data.connectionId);
      setError(null);
      retryCountRef.current = 0;
    },
    onError: (event) => {
      setError('Connection error occurred');
      if (retryOnError && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        setTimeout(() => {
          if (clientRef.current) {
            clientRef.current.connect();
          }
        }, 1000 * retryCountRef.current); // Exponential backoff
      }
    },
    onClose: (code, reason) => {
      if (code !== 1000 && retryOnError && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        setTimeout(() => {
          if (clientRef.current) {
            clientRef.current.connect();
          }
        }, 1000 * retryCountRef.current);
      }
    }
  };

  useEffect(() => {
    if (token) {
      clientRef.current = createWebSocketClient(token, events);

      if (autoConnect) {
        clientRef.current.connect();
      }
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [token]);

  const connect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.connect();
    }
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    return clientRef.current?.send(message) || false;
  }, []);

  return {
    client: clientRef.current,
    connectionState,
    connectionId,
    isConnected: connectionState === WebSocketConnectionState.CONNECTED,
    error,
    retryCount: retryCountRef.current,
    connect,
    disconnect,
    sendMessage
  };
}