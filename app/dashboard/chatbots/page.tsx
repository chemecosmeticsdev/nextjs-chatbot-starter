'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bot, Plus, Settings, Play, Pause, MoreHorizontal, MessageCircle, Users, Clock, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
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
    } catch (err: any) {
      console.error('Error fetching chatbots:', err);
      setError(err.message || 'Failed to load chatbots');
      setChatbots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChatbots();
  }, []);

  const getStatusBadge = (status: 'active' | 'inactive' | 'testing') => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>;
      case 'testing':
        return <Badge className="bg-blue-100 text-blue-800">Testing</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chatbots</h1>
          <p className="text-muted-foreground">
            Manage and monitor your AI chatbots
          </p>
        </div>
        <div className="flex gap-2">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Chatbots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagination.total}</div>
            <p className="text-xs text-muted-foreground">
              Across all pages
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bots</CardTitle>
            <Badge className="bg-green-100 text-green-800">●</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {chatbots.filter(bot => bot.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
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
              {chatbots.reduce((sum, bot) => sum + bot.conversationCount, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
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
              {chatbots.reduce((sum, bot) => sum + bot.userCount, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-8 bg-gray-200 rounded"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            {chatbots.map((bot) => (
              <Card key={bot.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        {bot.name}
                      </CardTitle>
                      <CardDescription>{bot.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(bot.status)}
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
                          <DropdownMenuItem>
                            <Settings className="mr-2 h-4 w-4" />
                            Configure
                          </DropdownMenuItem>
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
                          <DropdownMenuItem>View Analytics</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
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
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{bot.conversationCount}</div>
                      <div className="text-xs text-muted-foreground">Conversations</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{bot.userCount}</div>
                      <div className="text-xs text-muted-foreground">Users</div>
                    </div>
                  </div>

                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="mr-1 h-3 w-3" />
                    Last active {formatLastActivity(bot.lastActivity)}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Test Chat
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
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
            {!loading && !error && chatbots.length === 0 && (
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
  );
}