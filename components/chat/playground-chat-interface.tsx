"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    responseTime?: number;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
    vectorSearchResults?: any[];
    model?: string;
    temperature?: number;
  };
  status: "sending" | "sent" | "error";
}

interface PlaygroundChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  isSending: boolean;
  placeholder?: string;
  maxHeight?: string;
  className?: string;
  showVectorResults?: boolean;
  onRetryMessage?: (messageId: string) => void;
}

export function PlaygroundChatInterface({
  messages,
  onSendMessage,
  isSending,
  placeholder = "Type your message to test the chatbot...",
  maxHeight = "600px",
  className,
  showVectorResults = false,
  onRetryMessage
}: PlaygroundChatInterfaceProps) {
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle send message
  const handleSendMessage = async () => {
    const content = inputValue.trim();
    if (!content || isSending) return;

    // Clear input immediately
    setInputValue('');

    try {
      await onSendMessage(content);
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
  const getMessageStatusIcon = (message: ChatMessage) => {
    switch (message.status) {
      case 'sending':
        return (
          <div className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            <span className="text-xs text-blue-500">Sending...</span>
          </div>
        );
      case 'sent':
        return (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span className="text-xs text-green-500">Sent</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRetryMessage?.(message.id)}
              className="h-6 w-6 p-0 hover:bg-red-50 transition-colors"
              title="Retry sending message"
            >
              <RefreshCw className="w-3 h-3 text-red-500 hover:text-red-600" />
            </Button>
            <span className="text-xs text-red-500">Failed - Click to retry</span>
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

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Playground Chat</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              HTTP Mode
            </Badge>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="w-3 h-3" />
              <span>Ready</span>
            </div>
          </div>
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
                      {message.role === 'assistant' && message.status === 'sending' ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="text-muted-foreground text-xs">Thinking...</span>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>

                    {/* Message metadata */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatTimestamp(message.timestamp)}</span>

                      {/* Message status for user messages */}
                      {message.role === 'user' && (
                        getMessageStatusIcon(message)
                      )}

                      {/* Processing status for assistant messages */}
                      {message.role === 'assistant' && message.status === 'sending' && (
                        <div className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                          <span className="text-xs text-blue-500">Processing...</span>
                        </div>
                      )}

                      {/* Performance metrics for assistant messages */}
                      {message.role === 'assistant' && message.status === 'sent' && message.metadata?.responseTime && (
                        <Badge variant="outline" className="text-xs">
                          <Zap className="w-3 h-3 mr-1" />
                          {message.metadata.responseTime}ms
                        </Badge>
                      )}

                      {/* Token usage indicator */}
                      {message.role === 'assistant' && message.status === 'sent' && message.metadata?.tokenUsage?.total && (
                        <Badge variant="outline" className="text-xs">
                          {message.metadata.tokenUsage.total} tokens
                        </Badge>
                      )}

                      {/* Vector search indicator */}
                      {message.role === 'assistant' && message.status === 'sent' && message.metadata?.vectorSearchResults && message.metadata.vectorSearchResults.length > 0 && (
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

                    {/* Vector search results display */}
                    {showVectorResults &&
                     message.metadata?.vectorSearchResults &&
                     message.metadata.vectorSearchResults.length > 0 && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs space-y-1">
                        <p className="font-medium text-muted-foreground">Vector Search Results:</p>
                        {message.metadata.vectorSearchResults.slice(0, 3).map((result: any, index: number) => (
                          <div key={index} className="text-muted-foreground">
                            <span className="font-mono">Score: {result.similarity?.toFixed(3)}</span>
                            {result.metadata?.title && (
                              <span> | {result.metadata.title}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background/50">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isSending ? "Sending..." : placeholder}
              disabled={isSending}
              className={cn(
                "flex-1 transition-all duration-200",
                isSending && "bg-muted"
              )}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isSending || !inputValue.trim()}
              size="sm"
              className={cn(
                "transition-all duration-200",
                isSending && "animate-pulse"
              )}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Status indicators */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span>HTTP Connection Ready</span>
              </div>
            </div>

            {isSending && (
              <div className="text-xs text-blue-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Processing message...</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}