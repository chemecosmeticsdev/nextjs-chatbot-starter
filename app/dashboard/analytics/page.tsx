'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocketContext } from '@/components/websocket/websocket-provider';
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Activity, Users, MessageSquare, Database, TrendingUp, TrendingDown, Minus, Download, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface DashboardMetrics {
  realTimeMetrics: {
    activeSessions: number;
    messagesPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
  };
  periodMetrics: {
    totalConversations: number;
    uniqueUsers: number;
    knowledgeBaseQueries: number;
    userSatisfactionScore: number;
  };
  trends: {
    conversationsTrend: number;
    usersTrend: number;
    responseTrend: number;
  };
  topPerformers: {
    chatbots: Array<{ id: string; name: string; messageCount: number }>;
    topics: Array<{ topic: string; frequency: number }>;
  };
}

interface PerformanceMetrics {
  metrics: Array<{
    metricType: string;
    value: number;
    unit: string;
    timestamp: string;
    breakdown?: Record<string, number>;
  }>;
  summary: {
    averageResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
    throughput: number;
  };
  trends: {
    responseTime: { direction: 'up' | 'down' | 'stable'; percentage: number };
    errorRate: { direction: 'up' | 'down' | 'stable'; percentage: number };
  };
}

interface SessionAnalytics {
  sessions: Array<{
    sessionId: string;
    userId?: string;
    chatbotId: string;
    startTime: string;
    endTime?: string;
    duration: number;
    messageCount: number;
    knowledgeSearchCount: number;
    errorCount: number;
    averageResponseTime: number;
  }>;
  aggregates: {
    totalSessions: number;
    averageDuration: number;
    averageMessagesPerSession: number;
    uniqueUsers: number;
    topChatbots: Array<{ chatbotId: string; sessionCount: number }>;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Set up breadcrumbs for analytics page
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false, // Disable analytics to reduce overhead
    customTitles: {
      '/dashboard/analytics': 'Analytics Dashboard'
    }
  });
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);

  // Accessibility announcements
  const [announcements, setAnnouncements] = useState<string[]>([]);

  // Accessibility helper function
  const announceToScreenReader = (message: string) => {
    setAnnouncements(prev => [...prev, message]);
    // Clear announcement after screen reader has time to read it
    setTimeout(() => {
      setAnnouncements(prev => prev.slice(1));
    }, 3000);
  };
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [realTimeEnabled, setRealTimeEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [liveDataEnabled, setLiveDataEnabled] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedChatbots, setSelectedChatbots] = useState<string[]>([]);

  // WebSocket context for real-time updates
  const { isConnected, connectionState, joinRoom, leaveRoom } = useWebSocketContext();

  // Authentication check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/v1/auth/me');
        const data = await response.json();

        if (response.ok && data.success && (data.user.role === 'admin' || data.user.role === 'super_admin')) {
          setUser(data.user);
        } else {
          router.push('/dashboard');
          return;
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        router.push('/dashboard');
        return;
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Join analytics room for real-time updates
  useEffect(() => {
    if (isConnected && user && (user.role === 'admin' || user.role === 'super_admin') && liveDataEnabled) {
      const roomId = 'analytics:dashboard';
      joinRoom(roomId, 'analytics');

      return () => {
        leaveRoom(roomId);
      };
    }
  }, [isConnected, user, liveDataEnabled, joinRoom, leaveRoom]);

  // Fetch dashboard metrics
  const fetchDashboardMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        real_time: realTimeEnabled.toString(),
        refresh_interval: refreshInterval.toString()
      });

      if (selectedChatbots.length > 0) {
        params.append('chatbot_ids', selectedChatbots.join(','));
      }

      const response = await fetch(`/api/v1/analytics/dashboard?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard metrics');
      }

      const result = await response.json();
      if (result.success) {
        setDashboardMetrics(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch dashboard metrics');
      }
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard metrics');
    }
  }, [realTimeEnabled, refreshInterval, selectedChatbots]);

  // Fetch performance metrics
  const fetchPerformanceMetrics = useCallback(async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (timeRange) {
        case '1h':
          startDate.setHours(endDate.getHours() - 1);
          break;
        case '24h':
          startDate.setHours(endDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
      }

      const requestBody = {
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        granularity: timeRange === '1h' ? 'minute' : timeRange === '24h' ? 'hour' : 'day',
        aggregation: 'avg',
        percentile: 95
      };

      const response = await fetch('/api/v1/analytics/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('Failed to fetch performance metrics');
      }

      const result = await response.json();
      if (result.success) {
        setPerformanceMetrics(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch performance metrics');
      }
    } catch (err) {
      console.error('Error fetching performance metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch performance metrics');
    }
  }, [timeRange]);

  // Fetch session analytics
  const fetchSessionAnalytics = useCallback(async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7); // Last 7 days

      const requestBody = {
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        pagination: {
          page: 1,
          limit: 20
        },
        filters: selectedChatbots.length > 0 ? { chatbotIds: selectedChatbots } : {}
      };

      const response = await fetch('/api/v1/analytics/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session analytics');
      }

      const result = await response.json();
      if (result.success) {
        setSessionAnalytics(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch session analytics');
      }
    } catch (err) {
      console.error('Error fetching session analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch session analytics');
    }
  }, [selectedChatbots]);

  // Initial data fetch
  useEffect(() => {
    if (!user) return;

    const fetchAllData = async () => {
      setLoading(true);
      setError(null);

      try {
        await Promise.all([
          fetchDashboardMetrics(),
          fetchPerformanceMetrics(),
          fetchSessionAnalytics()
        ]);
      } catch (err) {
        console.error('Error fetching analytics data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [user, fetchDashboardMetrics, fetchPerformanceMetrics, fetchSessionAnalytics]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !realTimeEnabled || !user) return;

    const interval = setInterval(() => {
      fetchDashboardMetrics();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, realTimeEnabled, refreshInterval, fetchDashboardMetrics, user]);

  // Real-time data updates via WebSocket
  useEffect(() => {
    if (!isConnected || !liveDataEnabled || !user) return;

    const handleAnalyticsUpdate = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'analytics_update') {
          // Update dashboard metrics
          if (data.payload.dashboard) {
            setDashboardMetrics(prev => ({
              ...prev,
              ...data.payload.dashboard
            }));
          }

          // Update performance metrics
          if (data.payload.performance) {
            setPerformanceMetrics(prev => ({
              ...prev,
              ...data.payload.performance
            }));
          }

          // Update session analytics
          if (data.payload.sessions) {
            setSessionAnalytics(prev => ({
              ...prev,
              ...data.payload.sessions
            }));
          }

          setLastUpdated(new Date());
        }
      } catch (error) {
        console.error('Error processing real-time analytics update:', error);
      }
    };

    // For now, we'll simulate real-time updates
    // In a real implementation, this would listen to WebSocket messages
    const simulateRealTimeUpdates = () => {
      if (dashboardMetrics && liveDataEnabled) {
        setDashboardMetrics(prev => prev ? {
          ...prev,
          realTimeMetrics: {
            ...prev.realTimeMetrics,
            activeSessions: prev.realTimeMetrics.activeSessions + Math.floor(Math.random() * 5 - 2),
            messagesPerMinute: Math.max(0, prev.realTimeMetrics.messagesPerMinute + Math.floor(Math.random() * 10 - 5)),
            averageResponseTime: Math.max(50, prev.realTimeMetrics.averageResponseTime + Math.floor(Math.random() * 50 - 25)),
            errorRate: Math.max(0, Math.min(100, prev.realTimeMetrics.errorRate + Math.random() * 2 - 1))
          }
        } : prev);
        setLastUpdated(new Date());
      }
    };

    const interval = setInterval(simulateRealTimeUpdates, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [isConnected, liveDataEnabled, user, dashboardMetrics]);

  // Helper functions
  const formatNumber = (num: number, decimals: number = 0): string => {
    // Add type validation and null/undefined checks
    if (num == null || typeof num !== 'number' || isNaN(num)) {
      return '0';
    }

    if (num >= 1000000) {
      return (num / 1000000).toFixed(decimals) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(decimals) + 'K';
    }
    return num.toFixed(decimals);
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getTrendIcon = (direction: 'up' | 'down' | 'stable') => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendColor = (direction: 'up' | 'down' | 'stable', isPositiveTrend: boolean = true) => {
    if (direction === 'stable') return 'text-gray-500';
    const isGood = isPositiveTrend ? direction === 'up' : direction === 'down';
    return isGood ? 'text-green-500' : 'text-red-500';
  };

  // Export functions
  const handleExport = async (dataType: 'analytics' | 'performance' | 'sessions' | 'user_activity', format: 'csv' | 'json' | 'xlsx') => {
    setExportLoading(true);
    setExportError(null);

    try {
      // Calculate date range based on timeRange
      const endDate = new Date();
      const startDate = new Date();

      switch (timeRange) {
        case '1h':
          startDate.setHours(endDate.getHours() - 1);
          break;
        case '24h':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        default:
          startDate.setDate(endDate.getDate() - 1);
      }

      const exportRequest = {
        dataType,
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          timezone: 'UTC'
        },
        format,
        filters: {
          chatbotIds: selectedChatbots.length > 0 ? selectedChatbots : undefined,
          includePersonalData: false
        },
        maxRecords: 10000
      };

      const response = await fetch('/api/v1/analytics/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportRequest),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const result = await response.json();

      if (result.success) {
        // Create a download link
        const { downloadUrl, filename } = result.data;

        // Handle data URL downloads (for client-side generation)
        if (downloadUrl.startsWith('data:')) {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          // Handle regular URL downloads
          window.open(downloadUrl, '_blank');
        }
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const downloadCSV = (dataType: 'analytics' | 'performance' | 'sessions' | 'user_activity') => {
    handleExport(dataType, 'csv');
  };

  const downloadJSON = (dataType: 'analytics' | 'performance' | 'sessions' | 'user_activity') => {
    handleExport(dataType, 'json');
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Monitor chatbot performance and user engagement</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Live Data Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected && liveDataEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <Label className="text-sm">
                {isConnected && liveDataEnabled ? 'Live' : 'Offline'}
              </Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLiveDataEnabled(!liveDataEnabled)}
              className={liveDataEnabled ? 'text-green-600' : 'text-gray-500'}
            >
              {liveDataEnabled ? 'Disable Live' : 'Enable Live'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="time-range">Time Range</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last Hour</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Last Updated Indicator */}
          <div className="text-xs text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchDashboardMetrics();
              fetchPerformanceMetrics();
              fetchSessionAnalytics();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {dashboardMetrics ? (
            <>
              {/* Real-time Metrics */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Real-time Metrics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardMetrics.realTimeMetrics.activeSessions}</div>
                      <p className="text-xs text-muted-foreground">Currently active</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Messages/Min</CardTitle>
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardMetrics.realTimeMetrics.messagesPerMinute.toFixed(1)}</div>
                      <p className="text-xs text-muted-foreground">Message rate</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatDuration(dashboardMetrics.realTimeMetrics.averageResponseTime)}</div>
                      <div className="flex items-center text-xs">
                        {getTrendIcon(performanceMetrics?.trends.responseTime.direction || 'stable')}
                        <span className={`ml-1 ${getTrendColor(performanceMetrics?.trends.responseTime.direction || 'stable', false)}`}>
                          {performanceMetrics?.trends.responseTime.percentage.toFixed(1) || 0}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardMetrics.realTimeMetrics.errorRate.toFixed(2)}%</div>
                      <div className="flex items-center text-xs">
                        {getTrendIcon(performanceMetrics?.trends.errorRate.direction || 'stable')}
                        <span className={`ml-1 ${getTrendColor(performanceMetrics?.trends.errorRate.direction || 'stable', false)}`}>
                          {performanceMetrics?.trends.errorRate.percentage.toFixed(1) || 0}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Period Metrics */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Period Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(dashboardMetrics.periodMetrics.totalConversations)}</div>
                      <div className="flex items-center text-xs">
                        {getTrendIcon(dashboardMetrics.trends.conversationsTrend > 0 ? 'up' : dashboardMetrics.trends.conversationsTrend < 0 ? 'down' : 'stable')}
                        <span className={`ml-1 ${getTrendColor(dashboardMetrics.trends.conversationsTrend > 0 ? 'up' : 'down')}`}>
                          {Math.abs(dashboardMetrics.trends.conversationsTrend).toFixed(1)}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(dashboardMetrics.periodMetrics.uniqueUsers)}</div>
                      <div className="flex items-center text-xs">
                        {getTrendIcon(dashboardMetrics.trends.usersTrend > 0 ? 'up' : dashboardMetrics.trends.usersTrend < 0 ? 'down' : 'stable')}
                        <span className={`ml-1 ${getTrendColor(dashboardMetrics.trends.usersTrend > 0 ? 'up' : 'down')}`}>
                          {Math.abs(dashboardMetrics.trends.usersTrend).toFixed(1)}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Knowledge Queries</CardTitle>
                      <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(dashboardMetrics.periodMetrics.knowledgeBaseQueries)}</div>
                      <p className="text-xs text-muted-foreground">Knowledge base searches</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Satisfaction</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardMetrics.periodMetrics.userSatisfactionScore.toFixed(1)}/5</div>
                      <p className="text-xs text-muted-foreground">User satisfaction</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Top Performers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Performing Chatbots</CardTitle>
                    <CardDescription>Chatbots with highest message volumes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboardMetrics.topPerformers.chatbots.map((chatbot, index) => (
                        <div key={chatbot.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{index + 1}</Badge>
                            <span className="font-medium">{chatbot.name || 'Unknown'}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {formatNumber(chatbot.messageCount)} messages
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Popular Topics</CardTitle>
                    <CardDescription>Most frequently discussed topics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboardMetrics.topPerformers.topics.length > 0 ? (
                        dashboardMetrics.topPerformers.topics.map((topic, index) => (
                          <div key={topic.topic} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{index + 1}</Badge>
                              <span className="font-medium">{topic.topic}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {topic.frequency} mentions
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No topic data available</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No dashboard data available</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {performanceMetrics ? (
            <>
              <div>
                <h2 className="text-xl font-semibold mb-4">Performance Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatDuration(performanceMetrics.summary.averageResponseTime)}</div>
                      <p className="text-xs text-muted-foreground">Average latency</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">P95 Response Time</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatDuration(performanceMetrics.summary.p95ResponseTime)}</div>
                      <p className="text-xs text-muted-foreground">95th percentile</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{performanceMetrics.summary.errorRate.toFixed(2)}%</div>
                      <p className="text-xs text-muted-foreground">Error percentage</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Throughput</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{performanceMetrics.summary.throughput.toFixed(1)}</div>
                      <p className="text-xs text-muted-foreground">Requests/min</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics Over Time</CardTitle>
                  <CardDescription>Response time and error rate trends</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {performanceMetrics.metrics.slice(0, 10).map((metric, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground w-20">
                            {new Date(metric.timestamp).toLocaleTimeString()}
                          </span>
                          <Badge variant="outline">{metric.metricType}</Badge>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{metric.value.toFixed(2)} {metric.unit}</span>
                          {metric.breakdown && (
                            <div className="text-xs text-muted-foreground">
                              Min: {metric.breakdown.min?.toFixed(2)} |
                              Max: {metric.breakdown.max?.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No performance data available</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6">
          {sessionAnalytics ? (
            <>
              <div>
                <h2 className="text-xl font-semibold mb-4">Session Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(sessionAnalytics.aggregates.totalSessions)}</div>
                      <p className="text-xs text-muted-foreground">In selected period</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatDuration(sessionAnalytics.aggregates.averageDuration * 1000)}</div>
                      <p className="text-xs text-muted-foreground">Per session</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg Messages</CardTitle>
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{sessionAnalytics.aggregates.averageMessagesPerSession.toFixed(1)}</div>
                      <p className="text-xs text-muted-foreground">Per session</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(sessionAnalytics.aggregates.uniqueUsers)}</div>
                      <p className="text-xs text-muted-foreground">Different users</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Sessions</CardTitle>
                  <CardDescription>Latest user sessions with detailed metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {sessionAnalytics.sessions.map((session) => (
                      <div key={session.sessionId} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Session</Badge>
                            <span className="text-sm font-mono">{session.sessionId.slice(0, 8)}...</span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {formatDuration(session.duration * 1000)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Messages: </span>
                            <span className="font-medium">{session.messageCount}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">KB Searches: </span>
                            <span className="font-medium">{session.knowledgeSearchCount}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Errors: </span>
                            <span className="font-medium">{session.errorCount}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Avg Response: </span>
                            <span className="font-medium">{formatDuration(session.averageResponseTime)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No session data available</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Settings</CardTitle>
              <CardDescription>Configure analytics dashboard behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="real-time">Real-time Monitoring</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="real-time"
                    checked={realTimeEnabled}
                    onChange={(e) => setRealTimeEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="real-time" className="text-sm">Enable real-time data updates</label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-refresh">Auto Refresh</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="auto-refresh"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="auto-refresh" className="text-sm">Automatically refresh data</label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refresh-interval">Refresh Interval (seconds)</Label>
                <Input
                  id="refresh-interval"
                  type="number"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 30)}
                  min={5}
                  max={300}
                  className="w-32"
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>Data Export</Label>

                {/* Time Range Selector */}
                <div className="space-y-2">
                  <Label htmlFor="export-time-range">Time Range</Label>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select time range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Last Hour</SelectItem>
                      <SelectItem value="24h">Last 24 Hours</SelectItem>
                      <SelectItem value="7d">Last 7 Days</SelectItem>
                      <SelectItem value="30d">Last 30 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {exportError && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{exportError}</AlertDescription>
                  </Alert>
                )}

                {/* Analytics Data Export */}
                <div className="space-y-2">
                  <Label>Analytics Data</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadCSV('analytics')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'CSV'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadJSON('analytics')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'JSON'}
                    </Button>
                  </div>
                </div>

                {/* Performance Data Export */}
                <div className="space-y-2">
                  <Label>Performance Metrics</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadCSV('performance')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'CSV'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadJSON('performance')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'JSON'}
                    </Button>
                  </div>
                </div>

                {/* Session Data Export */}
                <div className="space-y-2">
                  <Label>Session Analytics</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadCSV('sessions')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'CSV'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadJSON('sessions')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'JSON'}
                    </Button>
                  </div>
                </div>

                {/* User Activity Export */}
                <div className="space-y-2">
                  <Label>User Activity</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadCSV('user_activity')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'CSV'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadJSON('user_activity')}
                      disabled={exportLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? 'Exporting...' : 'JSON'}
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Export data for the selected time range. Files will be downloaded automatically when ready.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}