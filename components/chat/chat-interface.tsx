"use client";

import React, { useState, useEffect } from 'react';
import { LiveChatInterface } from './live-chat-interface';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Bot,
  MessageSquare,
  Activity,
  Clock,
  Users,
  AlertCircle,
  RefreshCw,
  Download,
  Share,
  MoreHorizontal,
  Star,
  ThumbsUp,
  ThumbsDown,
  Flag
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  chatbotId: string;
  conversationId: string;
  className?: string;
  showMetrics?: boolean;
  showActions?: boolean;
  enableFeedback?: boolean;
  enableExport?: boolean;
  onConversationUpdate?: (conversationId: string, updates: any) => void;
}

interface ConversationMetrics {
  messageCount: number;
  responseTime: number;
  satisfaction: number;
  lastActivity: string;
  duration: string;
}

export function ChatInterface({
  chatbotId,
  conversationId,
  className,
  showMetrics = true,
  showActions = true,
  enableFeedback = true,
  enableExport = true,
  onConversationUpdate
}: ChatInterfaceProps) {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<ConversationMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Fetch conversation metrics
  const fetchMetrics = async () => {
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/metrics`);
      if (response.ok) {
        const result = await response.json();
        setMetrics(result.data);
      }
    } catch (err) {
      console.error('Error fetching conversation metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (conversationId && showMetrics) {
      fetchMetrics();

      // Refresh metrics every 30 seconds
      const interval = setInterval(fetchMetrics, 30000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [conversationId, showMetrics]);

  // Handle message sent callback
  const handleMessageSent = (content: string) => {
    // Update metrics when message is sent
    if (metrics) {
      setMetrics(prev => prev ? {
        ...prev,
        messageCount: prev.messageCount + 1,
        lastActivity: new Date().toISOString()
      } : prev);
    }

    // Notify parent component
    onConversationUpdate?.(conversationId, {
      lastMessageAt: new Date().toISOString(),
      messageCount: (metrics?.messageCount || 0) + 1
    });
  };

  // Export conversation
  const handleExport = async () => {
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ format: 'json' })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `conversation-${conversationId}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);

        toast({
          title: "Export successful",
          description: "Conversation exported to your downloads"
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (err) {
      console.error('Error exporting conversation:', err);
      toast({
        title: "Export failed",
        description: "Failed to export conversation",
        variant: "destructive"
      });
    }
  };

  // Share conversation
  const handleShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/shared/conversations/${conversationId}`;
      await navigator.clipboard.writeText(shareUrl);

      toast({
        title: "Link copied",
        description: "Conversation link copied to clipboard"
      });
    } catch (err) {
      console.error('Error sharing conversation:', err);
      toast({
        title: "Share failed",
        description: "Failed to copy share link",
        variant: "destructive"
      });
    }
  };

  // Toggle star status
  const handleStar = async () => {
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/star`, {
        method: isStarred ? 'DELETE' : 'POST'
      });

      if (response.ok) {
        setIsStarred(!isStarred);
        toast({
          title: isStarred ? "Removed from favorites" : "Added to favorites",
          description: isStarred ?
            "Conversation removed from favorites" :
            "Conversation added to favorites"
        });
      }
    } catch (err) {
      console.error('Error toggling star:', err);
    }
  };

  // Submit feedback
  const handleFeedback = async (type: 'positive' | 'negative' | 'report') => {
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type, conversationId })
      });

      if (response.ok) {
        setFeedbackSubmitted(true);
        toast({
          title: "Feedback submitted",
          description: "Thank you for your feedback!"
        });
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      toast({
        title: "Feedback failed",
        description: "Failed to submit feedback",
        variant: "destructive"
      });
    }
  };

  // Format metrics values
  const formatDuration = (duration: string) => {
    const minutes = parseInt(duration);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getSatisfactionColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading && showMetrics) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        {/* Metrics skeleton */}
        <div className="border-b p-4 bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-20" />
              ))}
            </div>
            <div className="flex items-center space-x-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8" />
              ))}
            </div>
          </div>
        </div>

        {/* Chat skeleton */}
        <div className="flex-1">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <div className="flex items-center justify-center h-full">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
              <div>
                <h3 className="font-semibold">Failed to load chat</h3>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Metrics and Actions Bar */}
      {(showMetrics || showActions) && (
        <div className="border-b p-4 bg-muted/50">
          <div className="flex items-center justify-between">
            {/* Metrics */}
            {showMetrics && metrics && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{metrics.messageCount}</span>
                  <span className="text-xs text-muted-foreground">messages</span>
                </div>

                <div className="flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{formatResponseTime(metrics.responseTime)}</span>
                  <span className="text-xs text-muted-foreground">avg response</span>
                </div>

                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{formatDuration(metrics.duration)}</span>
                  <span className="text-xs text-muted-foreground">duration</span>
                </div>

                <Badge
                  variant="outline"
                  className={cn("text-xs", getSatisfactionColor(metrics.satisfaction))}
                >
                  <Users className="h-3 w-3 mr-1" />
                  {Math.round(metrics.satisfaction * 100)}% satisfaction
                </Badge>
              </div>
            )}

            {/* Actions */}
            {showActions && (
              <div className="flex items-center space-x-2">
                {/* Star button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStar}
                  className={cn(
                    "transition-colors",
                    isStarred && "text-yellow-500 hover:text-yellow-600"
                  )}
                >
                  <Star className={cn("h-4 w-4", isStarred && "fill-current")} />
                </Button>

                {/* Export button */}
                {enableExport && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExport}
                    title="Export conversation"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}

                {/* Share button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  title="Share conversation"
                >
                  <Share className="h-4 w-4" />
                </Button>

                {/* Feedback buttons */}
                {enableFeedback && !feedbackSubmitted && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFeedback('positive')}
                      title="Positive feedback"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFeedback('negative')}
                      title="Negative feedback"
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFeedback('report')}
                      title="Report issue"
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                  </>
                )}

                {feedbackSubmitted && (
                  <Badge variant="outline" className="text-xs">
                    Thank you!
                  </Badge>
                )}

                {/* More actions */}
                <Button
                  variant="ghost"
                  size="sm"
                  title="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Interface */}
      <div className="flex-1">
        <LiveChatInterface
          chatbotId={chatbotId}
          conversationId={conversationId}
          className="h-full border-0 rounded-none"
          showConnectionStatus={true}
          showMessageStatus={true}
          showTypingIndicators={true}
          onMessageSent={handleMessageSent}
          maxHeight="100%"
        />
      </div>
    </div>
  );
}

export default ChatInterface;