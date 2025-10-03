"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { WebSocketClient, createWebSocketClient } from '@/lib/websocket/client';
import {
  WebSocketConnectionState,
  WebSocketMessage,
  WebSocketMessageType
} from '@/lib/websocket/message-types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

interface WebSocketContextType {
  client: WebSocketClient | null;
  isConnected: boolean;
  connectionState: WebSocketConnectionState;
  connectionId: string | null;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => boolean;
  joinRoom: (roomId: string, roomType?: 'chatbot' | 'admin' | 'user' | 'analytics') => boolean;
  leaveRoom: (roomId: string) => boolean;
}

const WebSocketContext = createContext<WebSocketContextType>({
  client: null,
  isConnected: false,
  connectionState: WebSocketConnectionState.DISCONNECTED,
  connectionId: null,
  connect: () => {},
  disconnect: () => {},
  sendMessage: () => false,
  joinRoom: () => false,
  leaveRoom: () => false
});

interface WebSocketProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
  enableNotifications?: boolean;
}

export function WebSocketProvider({
  children,
  autoConnect = true,
  enableNotifications = true
}: WebSocketProviderProps) {
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>(
    WebSocketConnectionState.DISCONNECTED
  );
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Initialize WebSocket client when user is authenticated
  useEffect(() => {
    if (user && token && !client) {
      const newClient = createWebSocketClient(token, {
        onOpen: () => {
          console.log('WebSocket connected');
          if (enableNotifications) {
            toast({
              title: "Connected",
              description: "Real-time connection established",
              duration: 2000
            });
          }
        },

        onClose: (code, reason) => {
          console.log(`WebSocket disconnected: ${code} - ${reason}`);
          if (enableNotifications && code !== 1000) {
            toast({
              title: "Connection Lost",
              description: "Attempting to reconnect...",
              variant: "destructive",
              duration: 3000
            });
          }
        },

        onError: (error) => {
          console.error('WebSocket error:', error);
          if (enableNotifications) {
            toast({
              title: "Connection Error",
              description: "Failed to establish real-time connection",
              variant: "destructive",
              duration: 5000
            });
          }
        },

        onStateChange: setConnectionState,

        onConnectionAck: (data) => {
          setConnectionId(data.connectionId);
          console.log(`WebSocket connection acknowledged: ${data.connectionId}`);
        },

        onMessage: (message) => {
          // Handle global messages here
          handleGlobalMessage(message);
        },

        onErrorNotification: (error) => {
          if (enableNotifications) {
            toast({
              title: "System Error",
              description: error.data?.message || "An error occurred",
              variant: "destructive",
              duration: 5000
            });
          }
        },

        onSystemStatus: (status) => {
          if (enableNotifications && status.data?.status === 'degraded') {
            toast({
              title: "Service Degraded",
              description: status.data?.message || "Some features may be limited",
              variant: "destructive",
              duration: 5000
            });
          }
        }
      });

      setClient(newClient);

      if (autoConnect) {
        newClient.connect();
      }
    }

    return () => {
      if (client) {
        client.disconnect();
      }
    };
  }, [user, token, autoConnect, enableNotifications, toast]);

  // Handle global WebSocket messages
  const handleGlobalMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case WebSocketMessageType.SYSTEM_STATUS:
        // Handle system status updates
        console.log('System status update:', message);
        break;

      case WebSocketMessageType.ERROR_NOTIFICATION:
        // Handle error notifications
        console.warn('Error notification:', message);
        break;

      case WebSocketMessageType.ADMIN_ALERT:
        // Handle admin alerts for admin users
        if (user?.role === 'admin' || user?.role === 'super_admin') {
          console.log('Admin alert:', message);
        }
        break;

      default:
        // Let specific handlers deal with other message types
        break;
    }
  };

  const connect = () => {
    if (client) {
      client.connect();
    }
  };

  const disconnect = () => {
    if (client) {
      client.disconnect();
    }
  };

  const sendMessage = (message: WebSocketMessage): boolean => {
    if (client) {
      return client.send(message);
    }
    return false;
  };

  const joinRoom = (roomId: string, roomType: 'chatbot' | 'admin' | 'user' | 'analytics' = 'chatbot'): boolean => {
    if (client) {
      return client.joinRoom(roomId, roomType);
    }
    return false;
  };

  const leaveRoom = (roomId: string): boolean => {
    if (client) {
      return client.leaveRoom(roomId);
    }
    return false;
  };

  const contextValue: WebSocketContextType = {
    client,
    isConnected: connectionState === WebSocketConnectionState.CONNECTED,
    connectionState,
    connectionId,
    connect,
    disconnect,
    sendMessage,
    joinRoom,
    leaveRoom
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook to use WebSocket context
export function useWebSocketContext(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

// Specialized hooks for specific functionality
export function useWebSocketChat(chatbotId: string) {
  const { client, isConnected, joinRoom, leaveRoom } = useWebSocketContext();
  const [messages, setMessages] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isConnected && chatbotId) {
      joinRoom(`chatbot:${chatbotId}`, 'chatbot');

      const handleChatMessage = (message: WebSocketMessage) => {
        if (message.type === WebSocketMessageType.CHAT_MESSAGE_RECEIVE) {
          setMessages(prev => [...prev, message]);
        }
      };

      if (client) {
        const currentEvents = client.events;
        client.updateEvents({
          ...currentEvents,
          onChatMessage: handleChatMessage
        });
      }

      return () => {
        leaveRoom(`chatbot:${chatbotId}`);
      };
    }
  }, [client, isConnected, chatbotId, joinRoom, leaveRoom]);

  const sendChatMessage = (conversationId: string, content: string, metadata?: Record<string, any>) => {
    if (client && isConnected) {
      return client.sendChatMessage(chatbotId, conversationId, content, metadata);
    }
    return false;
  };

  return {
    messages,
    typingUsers: Array.from(typingUsers),
    sendChatMessage
  };
}

export function useWebSocketAnalytics(chatbotId?: string) {
  const { isConnected, joinRoom, leaveRoom } = useWebSocketContext();
  const [analytics, setAnalytics] = useState<any>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);

  useEffect(() => {
    if (isConnected) {
      joinRoom('analytics:realtime', 'analytics');
      if (chatbotId) {
        joinRoom(`analytics:chatbot:${chatbotId}`, 'analytics');
      }

      return () => {
        leaveRoom('analytics:realtime');
        if (chatbotId) {
          leaveRoom(`analytics:chatbot:${chatbotId}`);
        }
      };
    }
  }, [isConnected, chatbotId, joinRoom, leaveRoom]);

  return {
    analytics,
    performanceMetrics
  };
}