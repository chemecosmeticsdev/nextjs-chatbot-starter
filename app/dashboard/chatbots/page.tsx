'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bot, Plus, Settings, Play, Pause, MoreHorizontal, MessageCircle, Users, Clock,
  AlertCircle, RefreshCw, FileText, Search, Filter, Download, Trash2,
  TrendingUp, TrendingDown, Activity, Zap, CheckCircle2, XCircle,
  PlayCircle, StopCircle, Settings2, BarChart3, Link2, Smartphone, Webhook
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

interface ChatbotListResponse {
  success: boolean;
  data: {
    chatbots: Chatbot[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export default function ChatbotsPage() {
  const router = useRouter();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [filteredChatbots, setFilteredChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);
  const [operationProgress, setOperationProgress] = useState(0);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Enhanced state for Phase 3.1 features
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [selectedChatbots, setSelectedChatbots] = useState<Set<string>>(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);

  // Performance metrics state
  const [performanceMetrics, setPerformanceMetrics] = useState({
    totalRequests: 0,
    avgResponseTime: 0,
    successRate: 0,
    errorRate: 0,
    trendsUp: true
  });

  const fetchChatbots = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/chatbots?page=${page}&limit=20`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include session cookies
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in.');
        }
        throw new Error(`Failed to fetch chatbots: ${response.statusText}`);
      }

      const data: ChatbotListResponse = await response.json();

      if (!data.success) {
        throw new Error('Failed to load chatbots');
      }

      setChatbots(data.data.chatbots);
      setPagination(data.data.pagination);

      // Fetch performance metrics
      fetchPerformanceMetrics();
    } catch (err: any) {
      console.error('Error fetching chatbots:', err);
      setError(err.message || 'Failed to load chatbots');
      setChatbots([]);
    } finally {
      setLoading(false);
    }
  };

  // Enhanced function to fetch performance metrics
  const fetchPerformanceMetrics = async () => {
    try {
      const response = await fetch('/api/v1/analytics/performance', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPerformanceMetrics({
            totalRequests: data.data.totalRequests || 0,
            avgResponseTime: data.data.averageResponseTime || 0,
            successRate: data.data.successRate || 0,
            errorRate: data.data.errorRate || 0,
            trendsUp: (data.data.successRate || 0) > 95
          });
        }
      }
    } catch (err) {
      console.error('Error fetching performance metrics:', err);
    }
  };

  // Filter and search functionality
  useEffect(() => {
    let filtered = chatbots;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(bot =>
        bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (bot.description && bot.description.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(bot => bot.status === statusFilter);
    }

    // Model filter
    if (modelFilter !== 'all') {
      filtered = filtered.filter(bot => bot.configuration.model === modelFilter);
    }

    setFilteredChatbots(filtered);
  }, [chatbots, searchQuery, statusFilter, modelFilter]);

  // Selection management
  const handleSelectChatbot = (chatbotId: string, checked: boolean) => {
    const newSelected = new Set(selectedChatbots);
    if (checked) {
      newSelected.add(chatbotId);
    } else {
      newSelected.delete(chatbotId);
    }
    setSelectedChatbots(newSelected);
    setIsAllSelected(newSelected.size === filteredChatbots.length && filteredChatbots.length > 0);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredChatbots.map(bot => bot.id));
      setSelectedChatbots(allIds);
      setIsAllSelected(true);
    } else {
      setSelectedChatbots(new Set());
      setIsAllSelected(false);
    }
  };

  // Bulk operations
  const bulkToggleStatus = async (targetStatus: 'active' | 'inactive') => {
    if (selectedChatbots.size === 0) return;

    setBulkOperationLoading(true);
    setOperationProgress(0);

    const chatbotArray = Array.from(selectedChatbots);
    let completed = 0;

    try {
      for (const chatbotId of chatbotArray) {
        await fetch(`/api/v1/chatbots/${chatbotId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: targetStatus }),
        });

        completed++;
        setOperationProgress((completed / chatbotArray.length) * 100);
      }

      await fetchChatbots(pagination.page);
      setSelectedChatbots(new Set());
      setIsAllSelected(false);
    } catch (err: any) {
      setError(`Bulk operation failed: ${err.message}`);
    } finally {
      setBulkOperationLoading(false);
      setOperationProgress(0);
    }
  };

  const bulkDelete = async () => {
    if (selectedChatbots.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedChatbots.size} chatbots? This action cannot be undone.`)) return;

    setBulkOperationLoading(true);
    setOperationProgress(0);

    const chatbotArray = Array.from(selectedChatbots);
    let completed = 0;

    try {
      for (const chatbotId of chatbotArray) {
        await fetch(`/api/v1/chatbots/${chatbotId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        completed++;
        setOperationProgress((completed / chatbotArray.length) * 100);
      }

      await fetchChatbots(pagination.page);
      setSelectedChatbots(new Set());
      setIsAllSelected(false);
    } catch (err: any) {
      setError(`Bulk delete failed: ${err.message}`);
    } finally {
      setBulkOperationLoading(false);
      setOperationProgress(0);
    }
  };

  useEffect(() => {
    fetchChatbots();

    // Real-time updates every 30 seconds
    let interval: NodeJS.Timeout;
    if (realTimeUpdates) {
      interval = setInterval(() => {
        fetchChatbots(pagination.page);
      }, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [realTimeUpdates, pagination.page]);

  // Enhanced status badge with real-time indicators
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
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  // Get unique models for filter dropdown
  const uniqueModels = Array.from(new Set(chatbots.map(bot => bot.configuration.model)));

  // Mock integration status - in real app this would come from API
  const getIntegrationStatus = (chatbotId: string) => {
    // Mock data - simulate different integration statuses
    const mockIntegrations = [
      { type: 'line_oa', status: 'active', icon: Smartphone },
      { type: 'web_widget', status: 'active', icon: MessageCircle },
      { type: 'rest_api', status: 'active', icon: Link2 },
      { type: 'webhook', status: 'inactive', icon: Webhook }
    ];

    // Simulate different combinations for different chatbots
    const activeCount = Math.floor(Math.random() * 3) + 1; // 1-3 active integrations
    return mockIntegrations.slice(0, activeCount);
  };

  const toggleStatus = async (id: string, currentStatus: 'active' | 'inactive' | 'testing') => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

      const response = await fetch(`/api/v1/chatbots/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update chatbot status');
      }

      // Refresh the chatbots list
      await fetchChatbots(pagination.page);
    } catch (err: any) {
      console.error('Error updating chatbot status:', err);
      setError(err.message || 'Failed to update chatbot status');
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

  const formatCreatedDate = (createdAt: string): string => {
    return new Date(createdAt).toLocaleDateString();
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Enhanced Header with Real-time Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              Chatbots
              {realTimeUpdates && (
                <Tooltip>
                  <TooltipTrigger>
                    <Activity className="h-5 w-5 text-green-500 animate-pulse" />
                  </TooltipTrigger>
                  <TooltipContent>Real-time updates active</TooltipContent>
                </Tooltip>
              )}
            </h1>
            <p className="text-muted-foreground">
              Manage and monitor your AI chatbots
            </p>
          </div>
          <div className="flex gap-2">
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
            <Button variant="outline" onClick={() => fetchChatbots(pagination.page)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button asChild>
              <a href="/dashboard/chatbots/create">
                <Plus className="mr-2 h-4 w-4" />
                Create Chatbot
              </a>
            </Button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chatbots by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="testing">Testing</SelectItem>
              </SelectContent>
            </Select>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {uniqueModels.map(model => (
                  <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Bulk Operations Toolbar */}
        {selectedChatbots.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedChatbots.size} chatbot{selectedChatbots.size !== 1 ? 's' : ''} selected
                </span>
                {bulkOperationLoading && (
                  <div className="flex items-center gap-2">
                    <Progress value={operationProgress} className="w-32" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(operationProgress)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkToggleStatus('active')}
                  disabled={bulkOperationLoading}
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Activate All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkToggleStatus('inactive')}
                  disabled={bulkOperationLoading}
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  Deactivate All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={bulkDelete}
                  disabled={bulkOperationLoading}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All
                </Button>
              </div>
            </div>
          </div>
        )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() => fetchChatbots(pagination.page)}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

        {/* Enhanced Performance Metrics with Trends */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Chatbots</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pagination.total}</div>
              <p className="text-xs text-muted-foreground flex items-center">
                <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                Across all pages
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Bots</CardTitle>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {filteredChatbots.filter(bot => bot.status === 'active').length}
              </div>
              <p className="text-xs text-muted-foreground flex items-center">
                <Activity className="h-3 w-3 mr-1 text-green-500" />
                Currently running
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredChatbots.reduce((sum, bot) => sum + bot.conversationCount, 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground flex items-center">
                {performanceMetrics.trendsUp ? (
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                )}
                All time
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredChatbots.reduce((sum, bot) => sum + bot.userCount, 0)}
              </div>
              <p className="text-xs text-muted-foreground flex items-center">
                <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                All time
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Performance</CardTitle>
              <Tooltip>
                <TooltipTrigger>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Success Rate: {performanceMetrics.successRate.toFixed(1)}%
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {performanceMetrics.avgResponseTime.toFixed(0)}ms
              </div>
              <p className="text-xs text-muted-foreground flex items-center">
                <Zap className="h-3 w-3 mr-1 text-blue-500" />
                Avg response time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Selection Header */}
        {filteredChatbots.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm font-medium">
                  Select All ({filteredChatbots.length})
                </span>
              </div>
              {searchQuery && (
                <span className="text-sm text-muted-foreground">
                  Showing {filteredChatbots.length} of {chatbots.length} chatbots
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedChatbots.size} selected
            </div>
          </div>
        )}

        {/* Enhanced Chatbot Cards with Selection */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 flex-1" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              {filteredChatbots.map((bot) => (
                <Card key={bot.id} className={`transition-all duration-200 ${
                  selectedChatbots.has(bot.id) ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
                }`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedChatbots.has(bot.id)}
                          onCheckedChange={(checked) => handleSelectChatbot(bot.id, checked as boolean)}
                        />
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Bot className="h-5 w-5" />
                            {bot.name}
                          </CardTitle>
                          <CardDescription className="mt-1">{bot.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(bot.status)}

                        {/* Integration Status Indicators */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1">
                              {getIntegrationStatus(bot.id).map((integration, index) => {
                                const IconComponent = integration.icon;
                                return (
                                  <div
                                    key={integration.type}
                                    className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                      integration.status === 'active'
                                        ? 'bg-green-100 text-green-600'
                                        : 'bg-gray-100 text-gray-400'
                                    }`}
                                  >
                                    <IconComponent className="w-3 h-3" />
                                  </div>
                                );
                              })}
                              {getIntegrationStatus(bot.id).length > 0 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  {getIntegrationStatus(bot.id).filter(i => i.status === 'active').length}
                                </span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-sm">
                              <div className="font-medium mb-1">Active Integrations</div>
                              {getIntegrationStatus(bot.id)
                                .filter(i => i.status === 'active')
                                .map(i => (
                                  <div key={i.type} className="text-xs">
                                    {i.type.replace('_', ' ').toUpperCase()}
                                  </div>
                                ))}
                              {getIntegrationStatus(bot.id).filter(i => i.status === 'active').length === 0 && (
                                <div className="text-xs text-muted-foreground">No active integrations</div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/chatbots/${bot.id}/prompt`)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Manage Prompts
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/chatbots/${bot.id}/playground`)}>
                              <PlayCircle className="mr-2 h-4 w-4" />
                              Playground
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/chatbots/${bot.id}/configure`)}>
                              <Settings2 className="mr-2 h-4 w-4" />
                              Configure
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/chatbots/${bot.id}/integrations`)}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Setup Integrations
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => toggleStatus(bot.id, bot.status)}>
                              {bot.status === 'active' ? (
                                <>
                                  <Pause className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <Play className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/analytics?chatbot=${bot.id}`)}>
                              <BarChart3 className="mr-2 h-4 w-4" />
                              View Analytics
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <span>Model: {bot.configuration.model}</span>
                      <span className="mx-2">•</span>
                      <span>Created {formatCreatedDate(bot.createdAt)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{bot.conversationCount}</div>
                            <div className="text-xs text-muted-foreground">Conversations</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Total conversations handled</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-center p-3 bg-green-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{bot.userCount}</div>
                            <div className="text-xs text-muted-foreground">Users</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Unique users served</TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      Last active {formatLastActivity(bot.lastActivity)}
                    </div>

                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => router.push(`/dashboard/chatbots/${bot.id}/playground`)}
                          >
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Test Chat
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Test chatbot in playground</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => router.push(`/dashboard/chatbots/${bot.id}/configure`)}
                          >
                            <Settings className="mr-2 h-4 w-4" />
                            Configure
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Configure chatbot settings</TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Create New Chatbot Card - only show if not loading and not in error state */}
              {!loading && !error && (
                <Card className="border-dashed border-2 hover:border-gray-400 transition-colors">
                  <CardContent className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                    <div className="p-4 bg-blue-100 rounded-full mb-4">
                      <Plus className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Create New Chatbot</h3>
                    <p className="text-muted-foreground mb-4">
                      Set up a new AI chatbot for your specific use case
                    </p>
                    <Button asChild>
                      <a href="/dashboard/chatbots/create">Get Started</a>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* No chatbots message */}
              {!loading && !error && filteredChatbots.length === 0 && chatbots.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No chatbots found</h3>
                  <p className="text-muted-foreground mb-4">
                    Get started by creating your first AI chatbot
                  </p>
                  <Button asChild>
                    <a href="/dashboard/chatbots/create">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Chatbot
                    </a>
                  </Button>
                </div>
              )}

              {/* No filtered results message */}
              {!loading && !error && filteredChatbots.length === 0 && chatbots.length > 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No chatbots match your filters</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search or filter criteria
                  </p>
                  <Button variant="outline" onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setModelFilter('all');
                  }}>
                    Clear Filters
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

      {/* Pagination */}
      {!loading && !error && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} chatbots
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchChatbots(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchChatbots(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
        )}
      </div>
    </TooltipProvider>
  );
}