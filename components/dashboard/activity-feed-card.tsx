"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  Bot,
  MessageSquare,
  Globe,
  User,
  Settings,
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Filter,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: 'conversation' | 'deployment' | 'configuration' | 'user_action' | 'system' | 'error';
  title: string;
  description: string;
  timestamp: string;
  user?: {
    name: string;
    email: string;
  };
  metadata?: {
    chatbotId?: string;
    chatbotName?: string;
    widgetId?: string;
    conversationId?: string;
    errorCode?: string;
    entityId?: string;
  };
  severity?: 'info' | 'warning' | 'error' | 'success';
  actionUrl?: string;
}

interface ActivityFeedCardProps {
  className?: string;
  maxItems?: number;
  refreshInterval?: number;
  showFilters?: boolean;
  autoRefresh?: boolean;
}

export const ActivityFeedCard: React.FC<ActivityFeedCardProps> = ({
  className,
  maxItems = 8,
  refreshInterval = 30000, // 30 seconds
  showFilters = false,
  autoRefresh = true,
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const fetchActivityFeed = async (showLoader = false) => {
    try {
      if (showLoader) setIsRefreshing(true);

      // Fetch analytics activity data
      const activityResponse = await fetch('/api/v1/analytics/activity');
      const activityResult = activityResponse.ok ? await activityResponse.json() : { data: [] };

      // Fetch recent conversations for conversation activities
      const conversationsResponse = await fetch('/api/v1/conversations?limit=20');
      const conversationsResult = conversationsResponse.ok ? await conversationsResponse.json() : { data: [] };

      // Fetch chatbots for configuration activities
      const chatbotsResponse = await fetch('/api/v1/chatbots');
      const chatbotsResult = chatbotsResponse.ok ? await chatbotsResponse.json() : { data: [] };

      // Generate activity feed from various sources
      const activities = generateActivityFeed(
        activityResult.data || [],
        conversationsResult.data || [],
        chatbotsResult.data || []
      );

      setActivities(activities.slice(0, maxItems));
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching activity feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch activity feed');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const generateActivityFeed = (
    analyticsData: any[],
    conversations: any[],
    chatbots: any[]
  ): ActivityItem[] => {
    const activities: ActivityItem[] = [];

    // Ensure we have valid arrays to work with
    const safeConversations = Array.isArray(conversations) ? conversations : [];
    const safeChatbots = Array.isArray(chatbots) ? chatbots : [];
    const safeAnalyticsData = Array.isArray(analyticsData) ? analyticsData : [];

    // Add conversation activities
    safeConversations.forEach((conversation, index) => {
      if (index < 3) { // Limit to recent conversations
        activities.push({
          id: `conv-${conversation.id}`,
          type: 'conversation',
          title: 'New conversation started',
          description: `Chat session with ${conversation.messageCount || 0} messages`,
          timestamp: conversation.createdAt,
          metadata: {
            conversationId: conversation.id,
            chatbotId: conversation.chatbotId,
          },
          severity: 'info',
          actionUrl: `/dashboard/conversations/${conversation.id}`,
        });
      }
    });

    // Add chatbot configuration activities
    safeChatbots.forEach((chatbot, index) => {
      if (index < 2) { // Recent chatbot updates
        activities.push({
          id: `config-${chatbot.id}`,
          type: 'configuration',
          title: 'Chatbot configuration updated',
          description: `${chatbot.name} settings modified`,
          timestamp: chatbot.updatedAt,
          metadata: {
            chatbotId: chatbot.id,
            chatbotName: chatbot.name,
          },
          severity: 'success',
          actionUrl: `/dashboard/chatbots/${chatbot.id}`,
        });
      }
    });

    // Add some mock system activities for demonstration
    const mockActivities: ActivityItem[] = [
      {
        id: 'widget-deploy-1',
        type: 'deployment',
        title: 'Widget deployed successfully',
        description: 'Chat widget deployed to example.com',
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        user: {
          name: 'System',
          email: 'system@example.com',
        },
        metadata: {
          widgetId: 'widget-123',
        },
        severity: 'success',
        actionUrl: '/dashboard/widgets',
      },
      {
        id: 'user-login-1',
        type: 'user_action',
        title: 'User logged in',
        description: 'Successful authentication from new device',
        timestamp: new Date(Date.now() - Math.random() * 1800000).toISOString(),
        severity: 'info',
      },
      {
        id: 'knowledge-upload-1',
        type: 'system',
        title: 'Knowledge base updated',
        description: 'New documents processed and indexed',
        timestamp: new Date(Date.now() - Math.random() * 7200000).toISOString(),
        severity: 'success',
        actionUrl: '/dashboard/knowledge',
      },
      {
        id: 'performance-alert-1',
        type: 'error',
        title: 'Performance alert',
        description: 'Response time exceeded threshold',
        timestamp: new Date(Date.now() - Math.random() * 900000).toISOString(),
        metadata: {
          errorCode: 'PERF_001',
        },
        severity: 'warning',
      },
    ];

    // Combine and sort by timestamp
    const combinedActivities = [...activities, ...mockActivities];
    combinedActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return combinedActivities;
  };

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'conversation':
        return <MessageSquare className="h-3 w-3" />;
      case 'deployment':
        return <Globe className="h-3 w-3" />;
      case 'configuration':
        return <Settings className="h-3 w-3" />;
      case 'user_action':
        return <User className="h-3 w-3" />;
      case 'system':
        return <Bot className="h-3 w-3" />;
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      default:
        return <Activity className="h-3 w-3" />;
    }
  };

  const getActivityColor = (severity: ActivityItem['severity']) => {
    switch (severity) {
      case 'success':
        return 'text-green-600 bg-green-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'info':
      default:
        return 'text-blue-600 bg-blue-50';
    }
  };

  const getSeverityIcon = (severity: ActivityItem['severity']) => {
    switch (severity) {
      case 'success':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'warning':
        return <AlertCircle className="h-3 w-3 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-600" />;
      case 'info':
      default:
        return <Activity className="h-3 w-3 text-blue-600" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') return true;
    return activity.type === filter;
  });

  useEffect(() => {
    fetchActivityFeed();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchActivityFeed();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, autoRefresh]);

  const handleRefresh = () => {
    fetchActivityFeed(true);
  };

  if (loading) {
    return <ActivityFeedCardSkeleton className={className} />;
  }

  if (error) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load activity feed</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="mt-3"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          {autoRefresh && (
            <div className="flex items-center space-x-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-1">
          {showFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Toggle filter (simplified)
                setFilter(filter === 'all' ? 'conversation' : 'all');
              }}
            >
              <Filter className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-0">
        <ScrollArea className="h-[300px] pr-3">
          <div className="space-y-3">
            {filteredActivities.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              filteredActivities.map((activity, index) => (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 pb-3 last:pb-0"
                >
                  <div className={cn(
                    "p-1.5 rounded-full mt-0.5",
                    getActivityColor(activity.severity)
                  )}>
                    {getActivityIcon(activity.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-foreground">
                            {activity.title}
                          </p>
                          {getSeverityIcon(activity.severity)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {activity.description}
                        </p>

                        {activity.user && (
                          <p className="text-xs text-muted-foreground mt-1">
                            by {activity.user.name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 ml-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                        {activity.actionUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            asChild
                          >
                            <Link href={activity.actionUrl}>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>

                    {activity.metadata && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {activity.metadata.chatbotName && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                            {activity.metadata.chatbotName}
                          </Badge>
                        )}
                        {activity.metadata.errorCode && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                            {activity.metadata.errorCode}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        {lastUpdated && (
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-1 text-xs"
                asChild
              >
                <Link href="/dashboard/activity">
                  View All Activity
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Loading skeleton component
const ActivityFeedCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex items-center space-x-1">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-start space-x-3">
            <Skeleton className="h-6 w-6 rounded-full mt-0.5" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
        <div className="pt-3 border-t">
          <Skeleton className="h-4 w-full" />
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivityFeedCard;