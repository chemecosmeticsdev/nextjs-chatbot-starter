'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Plus, Settings, Play, Pause, MoreHorizontal, MessageCircle, Users, Clock } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Chatbot {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'training';
  model: string;
  conversations: number;
  users: number;
  lastActive: string;
  createdAt: string;
}

export default function ChatbotsPage() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading chatbots
    setTimeout(() => {
      setChatbots([
        {
          id: '1',
          name: 'Customer Support Bot',
          description: 'Handles customer inquiries and support tickets',
          status: 'active',
          model: 'gpt-4',
          conversations: 1247,
          users: 389,
          lastActive: '2 minutes ago',
          createdAt: '2024-01-10'
        },
        {
          id: '2',
          name: 'Sales Assistant',
          description: 'Helps with product information and sales inquiries',
          status: 'active',
          model: 'gpt-3.5-turbo',
          conversations: 892,
          users: 156,
          lastActive: '5 minutes ago',
          createdAt: '2024-01-08'
        },
        {
          id: '3',
          name: 'Technical Documentation Bot',
          description: 'Provides technical documentation and API help',
          status: 'training',
          model: 'gpt-4',
          conversations: 234,
          users: 67,
          lastActive: '1 hour ago',
          createdAt: '2024-01-12'
        },
        {
          id: '4',
          name: 'HR Assistant',
          description: 'Internal HR support and policy information',
          status: 'inactive',
          model: 'gpt-3.5-turbo',
          conversations: 45,
          users: 12,
          lastActive: '2 days ago',
          createdAt: '2024-01-05'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>;
      case 'training':
        return <Badge className="bg-blue-100 text-blue-800">Training</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  const toggleStatus = (id: string) => {
    setChatbots(prev => prev.map(bot => {
      if (bot.id === id) {
        const newStatus = bot.status === 'active' ? 'inactive' : 'active';
        return { ...bot, status: newStatus };
      }
      return bot;
    }));
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
        <Button asChild>
          <a href="/dashboard/chatbots/create">
            <Plus className="mr-2 h-4 w-4" />
            Create Chatbot
          </a>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Chatbots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chatbots.length}</div>
            <p className="text-xs text-muted-foreground">
              +1 from last month
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
              {chatbots.reduce((sum, bot) => sum + bot.conversations, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              +12% from last month
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
              {chatbots.reduce((sum, bot) => sum + bot.users, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              +8% from last month
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
                          <DropdownMenuItem>
                            <Settings className="mr-2 h-4 w-4" />
                            Configure
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatus(bot.id)}>
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
                    <span>Model: {bot.model}</span>
                    <span className="mx-2">•</span>
                    <span>Created {bot.createdAt}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{bot.conversations}</div>
                      <div className="text-xs text-muted-foreground">Conversations</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{bot.users}</div>
                      <div className="text-xs text-muted-foreground">Users</div>
                    </div>
                  </div>

                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="mr-1 h-3 w-3" />
                    Last active {bot.lastActive}
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

            {/* Create New Chatbot Card */}
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
          </>
        )}
      </div>
    </div>
  );
}