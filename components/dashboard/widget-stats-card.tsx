"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Globe,
  TrendingUp,
  Activity,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WidgetStatsData {
  activeWidgets: number;
  totalDeployments: number;
  deploymentSuccess: number;
  topDomains: Array<{
    domain: string;
    conversations: number;
    percentage: number;
  }>;
  realTimeMetrics: {
    active_sessions: number;
    messages_last_hour: number;
    widget_loads_last_hour: number;
    online_status: string;
  };
  summary: {
    total_conversations: number;
    total_unique_visitors: number;
    avg_response_time: number;
  };
}

interface WidgetStatsCardProps {
  className?: string;
  refreshInterval?: number;
  showRealTimeIndicator?: boolean;
}

export const WidgetStatsCard: React.FC<WidgetStatsCardProps> = ({
  className,
  refreshInterval = 30000, // 30 seconds
  showRealTimeIndicator = true,
}) => {
  const [data, setData] = useState<WidgetStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchWidgetStats = async (showLoader = false) => {
    try {
      if (showLoader) setIsRefreshing(true);

      // First, get list of chatbots to aggregate widget stats
      const chatbotsResponse = await fetch('/api/v1/chatbots');
      const chatbotsData = await chatbotsResponse.json();

      if (!chatbotsResponse.ok) {
        throw new Error(chatbotsData.error || 'Failed to fetch chatbots');
      }

      // Add defensive programming with proper array validation
      const chatbots = Array.isArray(chatbotsData.data) ? chatbotsData.data : [];

      // Aggregate widget analytics from all chatbots
      const widgetPromises = chatbots.map(async (chatbot: any) => {
        try {
          const response = await fetch(`/api/v1/chatbots/${chatbot.id}/integrations/widget/analytics?range=7d`);
          if (response.ok) {
            const data = await response.json();
            return data.success ? data.data : null;
          }
          return null;
        } catch {
          return null;
        }
      });

      const widgetResults = await Promise.all(widgetPromises);
      const validResults = widgetResults.filter(result => result !== null);

      // Aggregate data
      const aggregatedData: WidgetStatsData = {
        activeWidgets: validResults.length,
        totalDeployments: validResults.reduce((sum, result) => {
          return sum + (result.summary?.total_conversations || 0);
        }, 0),
        deploymentSuccess: validResults.length > 0 ?
          Math.round((validResults.filter(r => r.widgetConfig?.status === 'active').length / validResults.length) * 100) : 0,
        topDomains: aggregateTopDomains(validResults),
        realTimeMetrics: aggregateRealTimeMetrics(validResults),
        summary: aggregateSummaryMetrics(validResults),
      };

      setData(aggregatedData);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching widget stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch widget statistics');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const aggregateTopDomains = (results: any[]): WidgetStatsData['topDomains'] => {
    const domainMap = new Map<string, { conversations: number }>();

    results.forEach(result => {
      if (result.topDomains) {
        result.topDomains.forEach((domain: any) => {
          const existing = domainMap.get(domain.domain) || { conversations: 0 };
          domainMap.set(domain.domain, {
            conversations: existing.conversations + (domain.conversations || 0)
          });
        });
      }
    });

    const totalConversations = Array.from(domainMap.values())
      .reduce((sum, domain) => sum + domain.conversations, 0);

    return Array.from(domainMap.entries())
      .map(([domain, data]) => ({
        domain,
        conversations: data.conversations,
        percentage: totalConversations > 0 ? (data.conversations / totalConversations) * 100 : 0
      }))
      .sort((a, b) => b.conversations - a.conversations)
      .slice(0, 4);
  };

  const aggregateRealTimeMetrics = (results: any[]): WidgetStatsData['realTimeMetrics'] => {
    return results.reduce((acc, result) => {
      if (result.realTimeMetrics) {
        acc.active_sessions += result.realTimeMetrics.active_sessions || 0;
        acc.messages_last_hour += result.realTimeMetrics.messages_last_hour || 0;
        acc.widget_loads_last_hour += result.realTimeMetrics.widget_loads_last_hour || 0;
      }
      return acc;
    }, {
      active_sessions: 0,
      messages_last_hour: 0,
      widget_loads_last_hour: 0,
      online_status: 'healthy'
    });
  };

  const aggregateSummaryMetrics = (results: any[]): WidgetStatsData['summary'] => {
    const totals = results.reduce((acc, result) => {
      if (result.summary) {
        acc.total_conversations += result.summary.total_conversations || 0;
        acc.total_unique_visitors += result.summary.total_unique_visitors || 0;
        acc.response_times.push(result.summary.avg_response_time || 0);
      }
      return acc;
    }, {
      total_conversations: 0,
      total_unique_visitors: 0,
      response_times: [] as number[]
    });

    return {
      total_conversations: totals.total_conversations,
      total_unique_visitors: totals.total_unique_visitors,
      avg_response_time: totals.response_times.length > 0
        ? Math.round(totals.response_times.reduce((a, b) => a + b, 0) / totals.response_times.length)
        : 0
    };
  };

  useEffect(() => {
    fetchWidgetStats();

    // Set up refresh interval
    const interval = setInterval(() => {
      fetchWidgetStats();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleRefresh = () => {
    fetchWidgetStats(true);
  };

  if (loading) {
    return <WidgetStatsCardSkeleton className={className} />;
  }

  if (error) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Widget Deployments</CardTitle>
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
            <span>Failed to load widget stats</span>
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

  if (!data) return null;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Widget Deployments</CardTitle>
          {showRealTimeIndicator && (
            <div className="flex items-center space-x-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          )}
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

      <CardContent className="space-y-4">
        {/* Primary Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-2xl font-bold">{data.activeWidgets}</div>
            <p className="text-xs text-muted-foreground">Active Widgets</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold">{data.deploymentSuccess}%</div>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-xs text-muted-foreground">Success Rate</p>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-1">
            <div className="text-lg font-semibold">{data.summary.total_conversations.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total Conversations</p>
          </div>
          <div className="space-y-1">
            <div className="text-lg font-semibold">{data.summary.total_unique_visitors.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Unique Visitors</p>
          </div>
        </div>

        {/* Real-time Activity */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Real-time Activity</p>
            <Badge variant="secondary" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              {data.realTimeMetrics.active_sessions} active
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">
              {data.realTimeMetrics.messages_last_hour} messages/hour
            </div>
            <div className="text-muted-foreground">
              {data.realTimeMetrics.widget_loads_last_hour} loads/hour
            </div>
          </div>
        </div>

        {/* Top Domains */}
        {data.topDomains.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-3">Top Performing Domains</p>
            <div className="space-y-2">
              {data.topDomains.slice(0, 3).map((domain, index) => (
                <div key={domain.domain} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      #{index + 1}
                    </span>
                    <span className="text-sm truncate">{domain.domain}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-muted-foreground">
                      {domain.conversations}
                    </span>
                    <div className="w-12">
                      <Progress value={domain.percentage} className="h-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer with last updated */}
        {lastUpdated && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-1 text-xs"
                onClick={() => window.open('/dashboard/widgets', '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View Details
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Loading skeleton component
const WidgetStatsCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-8" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </CardContent>
    </Card>
  );
};

export default WidgetStatsCard;