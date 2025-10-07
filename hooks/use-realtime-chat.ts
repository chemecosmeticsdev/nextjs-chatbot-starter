"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from '@/components/websocket/websocket-provider';
import { chatWebSocketHandler, ChatMessageData, TypingIndicatorData } from '@/lib/websocket/chat-handler';
import { useToast } from '@/hooks/use-toast';
import { MessageQueue, QueuedMessage } from '@/lib/websocket/message-queue';

export interface RealtimeChatOptions {
  chatbotId: string;
  conversationId: string;
  enableTypingIndicators?: boolean;
  enableMessageStatus?: boolean;
  enableNotifications?: boolean;
}

export interface RealtimeChatState {
  messages: ChatMessageData[];
  typingUsers: Set<string>;
  isConnected: boolean;
  connectionState: string;
  sendingMessages: Set<string>;
  failedMessages: Set<string>;
  queuedMessages: Set<string>;
  queueSize: number;
}

export function useRealtimeChat(options: RealtimeChatOptions) {
  const {
    chatbotId,
    conversationId,
    enableTypingIndicators = true,
    enableMessageStatus = true,
    enableNotifications = true
  } = options;

  const { client, isConnected, connectionState, connectionId, joinRoom, leaveRoom } = useWebSocketContext();
  const { toast } = useToast();

  // State
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [sendingMessages, setSendingMessages] = useState<Set<string>>(new Set());
  const [failedMessages, setFailedMessages] = useState<Set<string>>(new Set());
  const [queuedMessages, setQueuedMessages] = useState<Set<string>>(new Set());
  const [queueSize, setQueueSize] = useState(0);
  const [isUserTyping, setIsUserTyping] = useState(false);

  // Refs for cleanup and typing timeout
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);
  const messageQueueRef = useRef<MessageQueue>(new MessageQueue({
    maxQueueSize: 50,
    maxRetryAttempts: 3,
    autoFlushOnConnect: true,
    persistToStorage: true,
    storageKey: `chat_queue_${chatbotId}_${conversationId}`
  }));

  // Join chat room when connected
  useEffect(() => {
    if (isConnected && chatbotId && conversationId) {
      const roomId = `chatbot:${chatbotId}:conversation:${conversationId}`;
      joinRoom(roomId, 'chatbot');

      return () => {
        leaveRoom(roomId);
      };
    }
  }, [isConnected, chatbotId, conversationId, joinRoom, leaveRoom]);

  // Handle connection status changes for message queue
  useEffect(() => {
    const messageQueue = messageQueueRef.current;
    messageQueue.setOnlineStatus(isConnected);

    // Update queue size
    setQueueSize(messageQueue.size());

    // Flush queue when connection is restored
    if (isConnected && !messageQueue.isEmpty()) {
      flushMessageQueue();
    }
  }, [isConnected]);

  // Set up message handlers
  useEffect(() => {
    if (!conversationId) return;

    // Handle incoming chat messages
    const unsubscribeMessages = chatWebSocketHandler.onChatMessage(
      conversationId,
      (message: ChatMessageData) => {
        setMessages(prev => {
          // Avoid duplicates
          const exists = prev.some(m => m.id === message.id);
          if (exists) return prev;

          return [...prev, message].sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });

        // Show notification for assistant messages
        if (enableNotifications && message.role === 'assistant') {
          toast({
            title: "New Message",
            description: message.content.length > 50
              ? message.content.substring(0, 50) + "..."
              : message.content,
            duration: 3000
          });
        }

        // Remove from sending state if this was our message
        setSendingMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(message.id);
          return newSet;
        });
      }
    );

    cleanupFunctionsRef.current.push(unsubscribeMessages);

    // Handle typing indicators
    if (enableTypingIndicators) {
      const unsubscribeTyping = chatWebSocketHandler.onTypingIndicator(
        conversationId,
        (data: TypingIndicatorData) => {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            if (data.isTyping) {
              newSet.add(data.userIdentifier);
            } else {
              newSet.delete(data.userIdentifier);
            }
            return newSet;
          });
        }
      );

      cleanupFunctionsRef.current.push(unsubscribeTyping);
    }

    // Handle message status updates
    if (enableMessageStatus) {
      const unsubscribeStatus = chatWebSocketHandler.onMessageStatus(
        conversationId,
        (messageId: string, status: ChatMessageData['status'], error?: string, deliveryInfo?: any) => {
          setMessages(prev => prev.map(msg => {
            if (msg.id === messageId) {
              // Update delivery info with timestamps
              const updatedDeliveryInfo = {
                ...msg.deliveryInfo,
                ...deliveryInfo,
              };

              // Set specific timestamp based on status
              switch (status) {
                case 'sent':
                  updatedDeliveryInfo.sentAt = Date.now();
                  break;
                case 'delivered':
                  updatedDeliveryInfo.deliveredAt = Date.now();
                  break;
                case 'read':
                  updatedDeliveryInfo.readAt = Date.now();
                  break;
                case 'error':
                  updatedDeliveryInfo.errorAt = Date.now();
                  updatedDeliveryInfo.retryCount = (updatedDeliveryInfo.retryCount || 0) + 1;
                  break;
              }

              return {
                ...msg,
                status,
                deliveryInfo: updatedDeliveryInfo
              };
            }
            return msg;
          }));

          setSendingMessages(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });

          if (status === 'error') {
            setFailedMessages(prev => new Set([...prev, messageId]));

            if (enableNotifications) {
              toast({
                title: "Message Failed",
                description: error || "Failed to send message",
                variant: "destructive",
                duration: 5000
              });
            }
          } else {
            setFailedMessages(prev => {
              const newSet = new Set(prev);
              newSet.delete(messageId);
              return newSet;
            });
          }
        }
      );

      cleanupFunctionsRef.current.push(unsubscribeStatus);
    }

    return () => {
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [conversationId, enableTypingIndicators, enableMessageStatus, enableNotifications, toast]);

  // Flush message queue
  const flushMessageQueue = useCallback(async (): Promise<void> => {
    if (!isConnected || !connectionId) return;

    const messageQueue = messageQueueRef.current;
    const result = await messageQueue.flush(async (queuedMessage: QueuedMessage) => {
      try {
        return await chatWebSocketHandler.sendChatMessage(
          connectionId,
          queuedMessage.chatbotId,
          queuedMessage.conversationId,
          queuedMessage.content,
          queuedMessage.metadata
        );
      } catch (error) {
        console.error('Error sending queued message:', error);
        return false;
      }
    });

    // Update queue state
    setQueueSize(messageQueue.size());
    setQueuedMessages(new Set(messageQueue.getQueue().map(msg => msg.id)));

    if (result.sent > 0 && enableNotifications) {
      toast({
        title: "Messages Sent",
        description: `${result.sent} queued message${result.sent > 1 ? 's' : ''} sent successfully`,
        duration: 3000
      });
    }

    if (result.failed > 0 && enableNotifications) {
      toast({
        title: "Some Messages Failed",
        description: `${result.failed} message${result.failed > 1 ? 's' : ''} could not be sent`,
        variant: "destructive",
        duration: 3000
      });
    }
  }, [isConnected, connectionId, enableNotifications, toast]);

  // Send message function
  const sendMessage = useCallback(async (
    content: string,
    metadata?: Record<string, any>
  ): Promise<boolean> => {
    // If not connected, queue the message
    if (!isConnected || !connectionId || !chatbotId || !conversationId) {
      const messageQueue = messageQueueRef.current;
      const queueId = messageQueue.enqueue(chatbotId, conversationId, content, metadata, 'normal');

      // Update queue state
      setQueueSize(messageQueue.size());
      setQueuedMessages(prev => new Set([...prev, queueId]));

      if (enableNotifications) {
        toast({
          title: "Message Queued",
          description: "Message will be sent when connection is restored",
          duration: 3000
        });
      }

      return true; // Consider queuing as success
    }

    // Create optimistic message
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage: ChatMessageData = {
      id: messageId,
      conversationId,
      chatbotId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      status: 'sending',
      metadata
    };

    // Add to messages immediately (optimistic update)
    setMessages(prev => [...prev, optimisticMessage]);
    setSendingMessages(prev => new Set([...prev, messageId]));

    try {
      const success = await chatWebSocketHandler.sendChatMessage(
        connectionId,
        chatbotId,
        conversationId,
        content,
        metadata
      );

      if (!success) {
        // Update status to error
        setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, status: 'error' } : msg
        ));
        setSendingMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        });
        setFailedMessages(prev => new Set([...prev, messageId]));

        if (enableNotifications) {
          toast({
            title: "Send Failed",
            description: "Failed to send message",
            variant: "destructive",
            duration: 3000
          });
        }
        return false;
      }

      // Update status to sent
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, status: 'sent' } : msg
      ));

      return true;
    } catch (error) {
      console.error('Error sending message:', error);

      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, status: 'error' } : msg
      ));
      setSendingMessages(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      setFailedMessages(prev => new Set([...prev, messageId]));

      return false;
    }
  }, [isConnected, connectionId, chatbotId, conversationId, enableNotifications, toast]);

  // Typing indicator functions
  const startTyping = useCallback(() => {
    if (!enableTypingIndicators || !isConnected || !connectionId || isUserTyping) return;

    chatWebSocketHandler.sendTypingIndicator(connectionId, chatbotId, conversationId, true);
    setIsUserTyping(true);

    // Auto-stop typing after 5 seconds (increased from 3 for better UX)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 5000);
  }, [enableTypingIndicators, isConnected, connectionId, chatbotId, conversationId, isUserTyping]);

  const stopTyping = useCallback(() => {
    if (!enableTypingIndicators || !isConnected || !connectionId || !isUserTyping) return;

    chatWebSocketHandler.sendTypingIndicator(connectionId, chatbotId, conversationId, false);
    setIsUserTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [enableTypingIndicators, isConnected, connectionId, chatbotId, conversationId, isUserTyping]);

  // Retry failed message
  const retryMessage = useCallback(async (messageId: string): Promise<boolean> => {
    const message = messages.find(m => m.id === messageId);
    if (!message || message.status !== 'error') return false;

    // Update retry information
    const retryCount = (message.deliveryInfo?.retryCount || 0) + 1;
    const updatedDeliveryInfo = {
      ...message.deliveryInfo,
      retryCount,
      lastRetryAt: Date.now()
    };

    // Reset status and retry
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? {
        ...msg,
        status: 'sending' as const,
        deliveryInfo: updatedDeliveryInfo
      } : msg
    ));
    setFailedMessages(prev => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });
    setSendingMessages(prev => new Set([...prev, messageId]));

    // Show retry notification
    if (enableNotifications) {
      toast({
        title: "Retrying Message",
        description: `Attempt ${retryCount} of 3`,
        duration: 2000
      });
    }

    return sendMessage(message.content, message.metadata);
  }, [messages, sendMessage, enableNotifications, toast]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setSendingMessages(new Set());
    setFailedMessages(new Set());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
    };
  }, []);

  const state: RealtimeChatState = {
    messages,
    typingUsers,
    isConnected,
    connectionState,
    sendingMessages,
    failedMessages,
    queuedMessages,
    queueSize
  };

  return {
    ...state,
    sendMessage,
    startTyping,
    stopTyping,
    retryMessage,
    clearMessages,
    flushMessageQueue,
    isUserTyping
  };
}