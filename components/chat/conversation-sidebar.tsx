"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Bot,
  MessageSquare,
  Search,
  Plus,
  Clock,
  Star,
  Filter,
  MoreHorizontal,
  Trash2,
  Archive,
  Edit,
  ChevronDown,
  Users,
  Activity,
  Calendar,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Chatbot {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  chatbotId: string;
  createdAt: string;
  messageCount: number;
  lastMessageAt: string;
  isStarred?: boolean;
  status?: 'active' | 'archived' | 'ended';
}

interface ConversationSidebarProps {
  chatbots: Chatbot[];
  conversations: Conversation[];
  selectedChatbot: Chatbot | null;
  activeConversation: Conversation | null;
  onChatbotSelect: (chatbot: Chatbot) => void;
  onConversationSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onConversationUpdate?: (conversation: Conversation) => void;
  className?: string;
}

type SortField = 'lastMessageAt' | 'createdAt' | 'messageCount' | 'title';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | 'starred' | 'active' | 'archived';

export function ConversationSidebar({
  chatbots,
  conversations,
  selectedChatbot,
  activeConversation,
  onChatbotSelect,
  onConversationSelect,
  onNewConversation,
  onConversationUpdate,
  className
}: ConversationSidebarProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastMessageAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort conversations
  const filteredConversations = (Array.isArray(conversations) ? conversations : [])
    .filter(conversation => {
      // Filter by search query
      if (searchQuery && !conversation.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Filter by selected chatbot
      if (selectedChatbot && conversation.chatbotId !== selectedChatbot.id) {
        return false;
      }

      // Filter by type
      switch (filter) {
        case 'starred':
          return conversation.isStarred === true;
        case 'active':
          return conversation.status === 'active' || !conversation.status;
        case 'archived':
          return conversation.status === 'archived';
        default:
          return true;
      }
    })
    .sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case 'lastMessageAt':
          aValue = new Date(a.lastMessageAt).getTime();
          bValue = new Date(b.lastMessageAt).getTime();
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'messageCount':
          aValue = a.messageCount;
          bValue = b.messageCount;
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  // Format timestamp
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

  // Toggle conversation star
  const handleToggleStar = async (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const response = await fetch(`/api/v1/conversations/${conversation.id}/star`, {
        method: conversation.isStarred ? 'DELETE' : 'POST'
      });

      if (response.ok) {
        const updatedConversation = {
          ...conversation,
          isStarred: !conversation.isStarred
        };
        onConversationUpdate?.(updatedConversation);

        toast({
          title: conversation.isStarred ? "Removed from favorites" : "Added to favorites",
          description: conversation.isStarred ?
            "Conversation removed from favorites" :
            "Conversation added to favorites"
        });
      }
    } catch (err) {
      console.error('Error toggling star:', err);
      toast({
        title: "Action failed",
        description: "Failed to update conversation",
        variant: "destructive"
      });
    }
  };

  // Archive conversation
  const handleArchive = async (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const response = await fetch(`/api/v1/conversations/${conversation.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: conversation.status === 'archived' ? 'active' : 'archived'
        })
      });

      if (response.ok) {
        const updatedConversation = {
          ...conversation,
          status: conversation.status === 'archived' ? 'active' : 'archived'
        } as Conversation;
        onConversationUpdate?.(updatedConversation);

        toast({
          title: conversation.status === 'archived' ? "Conversation restored" : "Conversation archived",
          description: conversation.status === 'archived' ?
            "Conversation has been restored" :
            "Conversation has been archived"
        });
      }
    } catch (err) {
      console.error('Error archiving conversation:', err);
      toast({
        title: "Action failed",
        description: "Failed to archive conversation",
        variant: "destructive"
      });
    }
  };

  // Delete conversation
  const handleDelete = async (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/conversations/${conversation.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast({
          title: "Conversation deleted",
          description: "Conversation has been permanently deleted"
        });
        // Note: Parent component should handle removing from the list
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
      toast({
        title: "Delete failed",
        description: "Failed to delete conversation",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (conversation: Conversation) => {
    if (conversation.isStarred) {
      return <Star className="h-3 w-3 text-yellow-500 fill-current" />;
    }
    if (conversation.status === 'archived') {
      return <Archive className="h-3 w-3 text-muted-foreground" />;
    }
    return null;
  };

  const getStatusColor = (conversation: Conversation) => {
    if (conversation.status === 'archived') {
      return 'text-muted-foreground';
    }
    return '';
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Conversations</h2>
          </div>
          <Button
            size="sm"
            onClick={onNewConversation}
            disabled={!selectedChatbot}
            className="h-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Chatbot Selector */}
        <Select
          value={selectedChatbot?.id || ''}
          onValueChange={(value) => {
            const chatbot = chatbots.find(c => c.id === value);
            if (chatbot) onChatbotSelect(chatbot);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a chatbot" />
          </SelectTrigger>
          <SelectContent>
            {Array.isArray(chatbots) ? chatbots.map((chatbot) => (
              <SelectItem key={chatbot.id} value={chatbot.id}>
                <div className="flex items-center space-x-2">
                  <Bot className="h-4 w-4" />
                  <span>{chatbot.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {chatbot.status}
                  </Badge>
                </div>
              </SelectItem>
            )) : (
              <SelectItem value="no-chatbots" disabled>
                <span className="text-muted-foreground">No chatbots available</span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters and Sort */}
        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs"
          >
            <Filter className="h-3 w-3 mr-1" />
            Filters
            <ChevronDown className={cn(
              "h-3 w-3 ml-1 transition-transform",
              showFilters && "rotate-180"
            )} />
          </Button>

          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="h-6 w-6 p-0"
            >
              {sortOrder === 'asc' ?
                <SortAsc className="h-3 w-3" /> :
                <SortDesc className="h-3 w-3" />
              }
            </Button>
          </div>
        </div>

        {/* Filter Controls */}
        {showFilters && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              {(['all', 'starred', 'active', 'archived'] as FilterType[]).map((filterType) => (
                <Button
                  key={filterType}
                  variant={filter === filterType ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(filterType)}
                  className="text-xs"
                >
                  {filterType === 'all' && <MessageSquare className="h-3 w-3 mr-1" />}
                  {filterType === 'starred' && <Star className="h-3 w-3 mr-1" />}
                  {filterType === 'active' && <Activity className="h-3 w-3 mr-1" />}
                  {filterType === 'archived' && <Archive className="h-3 w-3 mr-1" />}
                  {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                </Button>
              ))}
            </div>

            <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastMessageAt">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-3 w-3" />
                    <span>Last Activity</span>
                  </div>
                </SelectItem>
                <SelectItem value="createdAt">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-3 w-3" />
                    <span>Created Date</span>
                  </div>
                </SelectItem>
                <SelectItem value="messageCount">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="h-3 w-3" />
                    <span>Message Count</span>
                  </div>
                </SelectItem>
                <SelectItem value="title">
                  <div className="flex items-center space-x-2">
                    <Edit className="h-3 w-3" />
                    <span>Title</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations found</p>
              {selectedChatbot && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNewConversation}
                  className="mt-3"
                >
                  Start First Conversation
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredConversations.map((conversation) => (
                <Card
                  key={conversation.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:bg-accent/50",
                    activeConversation?.id === conversation.id && "ring-2 ring-primary bg-accent",
                    getStatusColor(conversation)
                  )}
                  onClick={() => onConversationSelect(conversation)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          {getStatusIcon(conversation)}
                          <p className="text-sm font-medium truncate">
                            {conversation.title}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>{conversation.messageCount}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatTimestamp(conversation.lastMessageAt)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleToggleStar(conversation, e)}
                          className="h-6 w-6 p-0"
                        >
                          <Star className={cn(
                            "h-3 w-3",
                            conversation.isStarred ? "text-yellow-500 fill-current" : "text-muted-foreground"
                          )} />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleArchive(conversation, e)}
                          className="h-6 w-6 p-0"
                        >
                          <Archive className="h-3 w-3 text-muted-foreground" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDelete(conversation, e)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {filteredConversations.length > 0 && (
        <div className="p-4 border-t">
          <div className="text-xs text-muted-foreground text-center">
            {filteredConversations.length} of {conversations.length} conversations
            {filter !== 'all' && ` (${filter})`}
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationSidebar;