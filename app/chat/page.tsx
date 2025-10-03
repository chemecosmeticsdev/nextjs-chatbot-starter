"use client";

import { useState, useEffect } from "react";
import { Metadata } from "next";
import { useBreadcrumbs } from "@/lib/hooks/use-breadcrumbs";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { ChatSettings } from "@/components/chat/chat-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Settings,
  PlusCircle,
  Sidebar,
  X,
  Bot,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export default function ChatPage() {
  const { toast } = useToast();

  // Set up breadcrumbs for chat interface
  const breadcrumbs = useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: true,
    customTitles: {
      '/chat': 'Chat Interface'
    }
  });

  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChatbot, setSelectedChatbot] = useState<Chatbot | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Fetch chatbots and conversations on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch chatbots
        const chatbotsResponse = await fetch('/api/v1/chatbots');
        if (!chatbotsResponse.ok) {
          throw new Error('Failed to fetch chatbots');
        }
        const chatbotsResult = await chatbotsResponse.json();
        const chatbotsList = chatbotsResult.data || [];
        setChatbots(chatbotsList);

        // Set first available chatbot as default
        if (chatbotsList.length > 0) {
          setSelectedChatbot(chatbotsList[0]);
        }

        // Fetch conversations
        const conversationsResponse = await fetch('/api/v1/conversations?limit=50');
        if (conversationsResponse.ok) {
          const conversationsResult = await conversationsResponse.json();
          setConversations(conversationsResult.data || []);
        }

        setError(null);
      } catch (err) {
        console.error('Error fetching chat data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chat data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle new conversation creation
  const handleNewConversation = async () => {
    if (!selectedChatbot) {
      toast({
        title: "No chatbot selected",
        description: "Please select a chatbot to start a conversation",
        variant: "destructive"
      });
      return;
    }

    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const response = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatbotId: selectedChatbot.id,
          sessionId,
          title: `New conversation - ${new Date().toLocaleString()}`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }

      const result = await response.json();
      const newConversation = result.data;

      setConversations(prev => [newConversation, ...prev]);
      setActiveConversation(newConversation);

      toast({
        title: "New conversation started",
        description: `Started chatting with ${selectedChatbot.name}`
      });
    } catch (err) {
      console.error('Error creating conversation:', err);
      toast({
        title: "Failed to start conversation",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  // Handle conversation selection
  const handleConversationSelect = (conversation: Conversation) => {
    setActiveConversation(conversation);
    const chatbot = chatbots.find(bot => bot.id === conversation.chatbotId);
    if (chatbot) {
      setSelectedChatbot(chatbot);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar skeleton */}
        <div className="w-80 border-r bg-muted/50 p-4 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
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
    );
  }

  if (chatbots.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center space-y-4">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-semibold">No chatbots available</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a chatbot first to start chatting
              </p>
            </div>
            <Button asChild>
              <a href="/dashboard/chatbots/new">Create Chatbot</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation Sidebar */}
      <div className={cn(
        "border-r bg-muted/50 transition-all duration-300",
        sidebarOpen ? "w-80" : "w-0 overflow-hidden"
      )}>
        <ConversationSidebar
          chatbots={chatbots}
          conversations={conversations}
          selectedChatbot={selectedChatbot}
          activeConversation={activeConversation}
          onChatbotSelect={setSelectedChatbot}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
          onConversationUpdate={(updated) => {
            setConversations(prev =>
              prev.map(conv => conv.id === updated.id ? updated : conv)
            );
          }}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="border-b p-4 flex items-center justify-between bg-background">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Sidebar className="h-4 w-4" />}
            </Button>

            {selectedChatbot && (
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">{selectedChatbot.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedChatbot.description}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewConversation}
              disabled={!selectedChatbot}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              New Chat
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="flex-1 flex">
          <div className="flex-1">
            {selectedChatbot && activeConversation ? (
              <ChatInterface
                chatbotId={selectedChatbot.id}
                conversationId={activeConversation.id}
                className="h-full border-0 rounded-none"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="font-semibold">Start a conversation</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedChatbot
                        ? "Click 'New Chat' to start a conversation"
                        : "Select a chatbot to begin"
                      }
                    </p>
                  </div>
                  {selectedChatbot && (
                    <Button onClick={handleNewConversation}>
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Start Chatting
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="w-80 border-l bg-muted/50">
              <ChatSettings
                selectedChatbot={selectedChatbot}
                onClose={() => setShowSettings(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}