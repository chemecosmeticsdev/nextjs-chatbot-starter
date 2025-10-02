'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Bot, Settings, MessageCircle, Users, Clock, Activity, Zap, BarChart3,
  ArrowLeft, Play, Pause, RefreshCw, AlertCircle, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, Edit, FileText, Database, Globe, Calendar,
  Eye, Download, Share2, Copy, ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Chatbot {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'testing';
  apiKeyHint: string;
  configuration: {
    model: string;
    temperature: number;
    maxTokens: number;
    language: string;
    responseTimeout: number;
  };
  conversationCount: number;
  userCount: number;
  lastActivity: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatbotStats {
  totalMessages: number;
  avgResponseTime: number;
  successRate: number;
  errorRate: number;
  topQuestions: Array<{ question: string; count: number }>;
  dailyUsage: Array<{ date: string; messages: number; users: number }>;
  performanceTrend: 'up' | 'down' | 'stable';
}

export default function ChatbotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;

  const [chatbot, setChatbot] = useState<Chatbot | null>(null);
  const [stats, setStats] = useState<ChatbotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);

  const fetchChatbotDetails = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Chatbot not found');
        }
        throw new Error(`Failed to fetch chatbot: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setChatbot(data.data);
      } else {
        throw new Error(data.error?.message || 'Failed to fetch chatbot');
      }
    } catch (err: any) {
      console.error('Error fetching chatbot:', err);
      setError(err.message);
    }
  };

  const fetchChatbotStats = async () => {
    try {
      const response = await fetch(`/api/v1/analytics/performance?chatbot=${chatbotId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats({
            totalMessages: data.data.totalMessages || 0,
            avgResponseTime: data.data.averageResponseTime || 0,
            successRate: data.data.successRate || 0,
            errorRate: data.data.errorRate || 0,
            topQuestions: data.data.topQuestions || [],
            dailyUsage: data.data.dailyUsage || [],
            performanceTrend: data.data.successRate > 95 ? 'up' : data.data.successRate > 80 ? 'stable' : 'down'
          });
        }
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const toggleStatus = async () => {
    if (!chatbot) return;

    setIsToggling(true);
    try {
      const newStatus = chatbot.status === 'active' ? 'inactive' : 'active';
      const response = await fetch(`/api/v1/chatbots/${chatbotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update chatbot status');
      }

      const data = await response.json();
      if (data.success) {
        setChatbot({ ...chatbot, status: newStatus });
        toast({
          title: 'Status Updated',
          description: `Chatbot is now ${newStatus}`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsToggling(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchChatbotDetails(), fetchChatbotStats()]);
      setLoading(false);
    };

    loadData();

    // Real-time updates
    let interval: NodeJS.Timeout;
    if (realTimeUpdates) {
      interval = setInterval(() => {
        fetchChatbotStats();
      }, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [chatbotId, realTimeUpdates]);

  const getStatusBadge = (status: 'active' | 'inactive' | 'testing') => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Active
          </Badge>
        );
      case 'inactive':
        return (
          <Badge className="bg-gray-100 text-gray-800 flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            Inactive
          </Badge>
        );
      case 'testing':
        return (
          <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
            Testing
          </Badge>
        );
    }
  };

  const formatLastActivity = (lastActivity: string | null): string => {
    if (!lastActivity) return 'Never';
    const date = new Date(lastActivity);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <TooltipProvider>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (error || !chatbot) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Chatbot Details</h1>
            <p className="text-muted-foreground">Error loading chatbot information</p>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Chatbot not found'}
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <Bot className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                  {chatbot.name}
                  {getStatusBadge(chatbot.status)}
                  {realTimeUpdates && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Activity className="h-4 w-4 text-green-500 animate-pulse" />
                      </TooltipTrigger>
                      <TooltipContent>Real-time updates active</TooltipContent>
                    </Tooltip>
                  )}
                </h1>
                <p className="text-muted-foreground">
                  {chatbot.description || 'No description provided'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={realTimeUpdates}
                    onCheckedChange={setRealTimeUpdates}
                  />
                  <span className="text-sm">Live</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Toggle real-time updates</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={toggleStatus} disabled={isToggling}>
                  {chatbot.status === 'active' ? (
                    <Pause className="mr-2 h-4 w-4" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {isToggling ? 'Updating...' : chatbot.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {chatbot.status === 'active' ? 'Deactivate chatbot' : 'Activate chatbot'}
              </TooltipContent>
            </Tooltip>
            <Button onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/configure`)}>
              <Settings className="mr-2 h-4 w-4" />
              Configure
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stats?.totalMessages || chatbot.conversationCount).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground flex items-center">
                {stats?.performanceTrend === 'up' ? (
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                ) : stats?.performanceTrend === 'down' ? (
                  <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                ) : (
                  <Activity className="h-3 w-3 mr-1 text-blue-500" />
                )}
                All time total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{chatbot.userCount}</div>
              <p className="text-xs text-muted-foreground">
                Unique users served
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Response Time</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.avgResponseTime?.toFixed(0) || 0}ms</div>
              <p className="text-xs text-muted-foreground">
                Average response time
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <Tooltip>
                <TooltipTrigger>
                  {stats?.successRate >= 95 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : stats?.successRate >= 80 ? (
                    <BarChart3 className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  Error Rate: {stats?.errorRate?.toFixed(1) || 0}%
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.successRate?.toFixed(1) || 0}%</div>
              <p className="text-xs text-muted-foreground">
                Successful responses
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Chatbot Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Model</Label>
                      <p className="text-sm text-muted-foreground">{chatbot.configuration.model}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Language</Label>
                      <p className="text-sm text-muted-foreground">{chatbot.configuration.language}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">API Key</Label>
                      <p className="text-sm text-muted-foreground font-mono">{chatbot.apiKeyHint}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Last Activity</Label>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatLastActivity(chatbot.lastActivity)}
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Temperature</span>
                      <span>{chatbot.configuration.temperature}</span>
                    </div>
                    <Progress value={chatbot.configuration.temperature * 100} className="h-2" />
                    <div className="flex justify-between text-sm">
                      <span>Max Tokens</span>
                      <span>{chatbot.configuration.maxTokens}</span>
                    </div>
                    <Progress value={(chatbot.configuration.maxTokens / 4000) * 100} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/playground`)}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Test in Playground
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/prompt`)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Manage Prompts
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/knowledge`)}
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Knowledge Base
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/configure`)}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Configuration
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/analytics?chatbot=${chatbotId}`)}
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    View Analytics
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>
                  Real-time performance data and trends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Performance analytics integration will be available when analytics services are fully operational.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="configuration" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configuration Details</CardTitle>
                <CardDescription>
                  Current chatbot configuration settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Model</Label>
                    <p className="text-sm text-muted-foreground">{chatbot.configuration.model}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Temperature</Label>
                    <p className="text-sm text-muted-foreground">{chatbot.configuration.temperature}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Max Tokens</Label>
                    <p className="text-sm text-muted-foreground">{chatbot.configuration.maxTokens}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Response Timeout</Label>
                    <p className="text-sm text-muted-foreground">{chatbot.configuration.responseTimeout}s</p>
                  </div>
                </div>
                <div className="pt-4">
                  <Button onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/configure`)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest conversations and interactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Activity logs will be displayed here when conversation tracking is implemented.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}