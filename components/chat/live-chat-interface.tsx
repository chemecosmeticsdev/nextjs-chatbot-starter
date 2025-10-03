"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ConnectionStatus } from '@/components/websocket/connection-status';
import { useRealtimeChat, RealtimeChatOptions } from '@/hooks/use-realtime-chat';
import {
  Send,
  User,
  Bot,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Copy,
  Zap,
  Database
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface LiveChatInterfaceProps extends RealtimeChatOptions {
  className?: string;
  showConnectionStatus?: boolean;
  showMessageStatus?: boolean;
  showTypingIndicators?: boolean;
  placeholder?: string;
  maxHeight?: string;
  onMessageSent?: (content: string) => void;
}

export function LiveChatInterface({
  chatbotId,
  conversationId,
  className,
  showConnectionStatus = true,
  showMessageStatus = true,
  showTypingIndicators = true,
  placeholder = "Type your message...",
  maxHeight = "500px",
  onMessageSent,
  ...chatOptions
}: LiveChatInterfaceProps) {
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    typingUsers,
    isConnected,
    connectionState,
    sendingMessages,
    failedMessages,
    queuedMessages,
    queueSize,
    sendMessage,
    startTyping,
    stopTyping,
    retryMessage,
    flushMessageQueue,
    isUserTyping
  } = useRealtimeChat({
    chatbotId,
    conversationId,
    enableTypingIndicators: showTypingIndicators,
    enableMessageStatus: showMessageStatus,
    ...chatOptions
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle input changes with typing indicators
  const handleInputChange = (value: string) => {
    setInputValue(value);

    if (showTypingIndicators && isConnected) {
      if (value.trim() && !isComposing) {
        setIsComposing(true);
        startTyping();
      } else if (!value.trim() && isComposing) {
        setIsComposing(false);
        stopTyping();
      }
    }
  };

  // Handle send message
  const handleSendMessage = async () => {
    const content = inputValue.trim();
    if (!content || !isConnected) return;

    // Stop typing indicator
    if (isComposing) {
      setIsComposing(false);
      stopTyping();
    }

    // Clear input immediately
    setInputValue('');

    try {
      const success = await sendMessage(content);
      if (success) {
        onMessageSent?.(content);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }

    // Focus back to input
    inputRef.current?.focus();
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Copy message content
  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied",
        description: "Message copied to clipboard",
        duration: 2000
      });
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Get message status icon
  const getMessageStatusIcon = (messageId: string, status: string) => {
    if (sendingMessages.has(messageId)) {
      return (
        <div className="flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          <span className="text-xs text-blue-500">Sending...</span>
        </div>
      );
    }

    if (failedMessages.has(messageId)) {
      // Find message to get retry count
      const failedMessage = messages.find(m => m.id === messageId);
      const retryCount = failedMessage?.deliveryInfo?.retryCount || 0;
      const maxRetries = 3;

      return (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => retryMessage(messageId)}
            className="h-6 w-6 p-0 hover:bg-red-50 transition-colors"
            title={`Retry sending message (${retryCount}/${maxRetries} attempts)`}
            disabled={retryCount >= maxRetries}
          >
            <RefreshCw className="w-3 h-3 text-red-500 hover:text-red-600" />
          </Button>
          <span className="text-xs text-red-500">
            {retryCount >= maxRetries ?
              `Failed after ${maxRetries} attempts` :
              `Failed - Click to retry (${retryCount}/${maxRetries})`
            }
          </span>
        </div>
      );
    }

    switch (status) {
      case 'sending':
        return (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-500" />
            <span className="text-xs text-amber-500">Sending</span>
          </div>
        );
      case 'sent':
        return (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-blue-500" />
            <span className="text-xs text-blue-500">Sent</span>
          </div>
        );
      case 'delivered':
        return (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span className="text-xs text-green-500">Delivered</span>
          </div>
        );
      case 'read':
        return (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            <span className="text-xs text-emerald-600">Read</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span className="text-xs text-red-500">Error</span>
          </div>
        );
      default:
        return null;
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate delivery time
  const getDeliveryTime = (message: any) => {
    if (!message.deliveryInfo) return null;

    const sentAt = message.deliveryInfo.sentAt;
    const deliveredAt = message.deliveryInfo.deliveredAt;

    if (sentAt && deliveredAt) {
      const deliveryTime = deliveredAt - sentAt;
      if (deliveryTime < 1000) {
        return `${deliveryTime}ms`;
      } else {
        return `${(deliveryTime / 1000).toFixed(1)}s`;
      }
    }

    return null;
  };

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Live Chat</CardTitle>
          {showConnectionStatus && (
            <ConnectionStatus
              compact
              showQualityIndicator={true}
              showAutoReconnect={true}
            />
          )}
        </div>
        <Separator />
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages Area */}
        <ScrollArea
          className="flex-1 px-4"
          style={{ maxHeight }}
        >
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Start a conversation...</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3 group",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[80%] space-y-1",
                      message.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm",
                        message.role === 'user'
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>

                    {/* Message metadata */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatTimestamp(message.timestamp)}</span>

                      {showMessageStatus && message.role === 'user' && (
                        <div className="flex items-center gap-2">
                          {getMessageStatusIcon(message.id, message.status)}
                          {/* Delivery time badge */}
                          {getDeliveryTime(message) && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              {getDeliveryTime(message)}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Performance metrics for assistant messages */}
                      {message.role === 'assistant' && message.metadata?.responseTime && (
                        <Badge variant="outline" className="text-xs">
                          <Zap className="w-3 h-3 mr-1" />
                          {message.metadata.responseTime}ms
                        </Badge>
                      )}

                      {/* Vector search indicator */}
                      {message.metadata?.vectorSearchResults && message.metadata.vectorSearchResults.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Database className="w-3 h-3 mr-1" />
                          {message.metadata.vectorSearchResults.length} sources
                        </Badge>
                      )}

                      {/* Copy button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyMessage(message.content)}
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Typing indicator */}
            {showTypingIndicators && typingUsers.size > 0 && (
              <div className="flex gap-3 animate-in fade-in-0 slide-in-from-left-2 duration-300">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary animate-pulse" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 border border-primary/10">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0s', animationDuration: '1.4s' }} />
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.2s', animationDuration: '1.4s' }} />
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.4s', animationDuration: '1.4s' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background/50">
          {/* User typing indicator */}
          {isComposing && isConnected && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in-0 duration-200">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" style={{ animationDelay: '0.4s' }} />
              </div>
              <span>You are typing...</span>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isConnected ? placeholder : "Connecting..."}
              disabled={!isConnected}
              className={cn(
                "flex-1 transition-all duration-200",
                isComposing && "ring-2 ring-blue-200 border-blue-300",
                !isConnected && "bg-muted"
              )}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!isConnected || !inputValue.trim() || sendingMessages.size > 0}
              size="sm"
              className={cn(
                "transition-all duration-200",
                sendingMessages.size > 0 && "animate-pulse"
              )}
            >
              {sendingMessages.size > 0 ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Connection status and feedback */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isConnected ? (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Connecting to real-time chat...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="w-3 h-3" />
                  <span>Connected</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {sendingMessages.size > 0 && (
                <div className="text-xs text-blue-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{sendingMessages.size} message{sendingMessages.size > 1 ? 's' : ''} sending...</span>
                </div>
              )}

              {queueSize > 0 && (
                <div className="text-xs text-amber-600 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  <span>{queueSize} message{queueSize > 1 ? 's' : ''} queued</span>
                  {isConnected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={flushMessageQueue}
                      className="h-5 px-2 text-xs"
                    >
                      Send now
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}