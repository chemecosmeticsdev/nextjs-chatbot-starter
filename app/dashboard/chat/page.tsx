"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Bot,
  AlertCircle,
  Loader2,
  RotateCcw,
  Settings
} from "lucide-react";
import { PlaygroundChatInterface } from "@/components/chat/playground-chat-interface";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    responseTime?: number;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
    vectorSearchResults?: any[];
    model?: string;
    temperature?: number;
  };
  status: "sending" | "sent" | "error";
}

interface Chatbot {
  id: string;
  name: string;
  description: string;
  status: string;
  configuration: {
    model: string;
    temperature?: number;
  };
  createdAt: string;
}

export default function ChatPage() {
  const { toast } = useToast();

  // State management
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [selectedChatbot, setSelectedChatbot] = useState<Chatbot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Fetch active chatbots on mount
  useEffect(() => {
    fetchActiveChatbots();
  }, []);

  const fetchActiveChatbots = async () => {
    try {
      setLoading(true);

      // Fetch all chatbots
      const response = await fetch('/api/v1/chatbots');
      if (!response.ok) {
        throw new Error('Failed to fetch chatbots');
      }

      const result = await response.json();
      // API returns { success: true, data: { chatbots: [...], pagination: {...} } }
      const allChatbots = result.data?.chatbots || [];

      // Filter for only active chatbots
      const activeChatbots = allChatbots.filter((bot: Chatbot) => bot.status === 'active');
      setChatbots(activeChatbots);

      // Set first active chatbot as default if available
      if (activeChatbots.length > 0) {
        setSelectedChatbot(activeChatbots[0]);
        await createNewSession(activeChatbots[0].id);
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching chatbots:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chatbots');
    } finally {
      setLoading(false);
    }
  };

  const createNewSession = async (chatbotId: string) => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/playground-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Chat Session ${new Date().toLocaleString()}`,
          config_override: {}
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const session = await response.json();
      setCurrentSessionId(session.data.id);
      setMessages([]);

      toast({
        title: "New Chat Session",
        description: "Ready to start chatting!",
      });
    } catch (error) {
      console.error("Failed to create session:", error);
      toast({
        title: "Error",
        description: "Failed to create chat session. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleChatbotChange = async (chatbotId: string) => {
    const chatbot = chatbots.find(bot => bot.id === chatbotId);
    if (chatbot) {
      setSelectedChatbot(chatbot);
      await createNewSession(chatbot.id);
    }
  };

  const handleNewSession = async () => {
    if (selectedChatbot) {
      await createNewSession(selectedChatbot.id);
    }
  };

  const sendMessage = async (messageContent: string) => {
    if (!selectedChatbot || !currentSessionId || !messageContent.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageContent.trim(),
      timestamp: new Date().toISOString(),
      status: "sent"
    };

    setMessages(prev => [...prev, userMessage]);
    setIsSending(true);

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      status: "sending",
      metadata: {
        responseTime: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        vectorSearchResults: []
      }
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      const startTime = Date.now();
      const response = await fetch(`/api/v1/chatbots/${selectedChatbot.id}/playground-sessions/${currentSessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageContent.trim(),
          config_override: {},
          include_vector_results: false
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const responseTime = Date.now() - startTime;

      // Update assistant message with response
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessage.id
          ? {
              ...msg,
              content: data.data.response,
              status: "sent" as const,
              metadata: {
                responseTime,
                tokenUsage: data.data.token_usage || { prompt: 0, completion: 0, total: 0 },
                vectorSearchResults: data.data.vector_search_results || [],
                model: data.data.model,
                temperature: data.data.temperature
              }
            }
          : msg
      ));

    } catch (error) {
      console.error("Failed to send message:", error);

      // Update message status to error
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessage.id
          ? { ...msg, content: "Sorry, I encountered an error. Please try again.", status: "error" as const }
          : msg
      ));

      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleRetryMessage = (messageId: string) => {
    const failedMessage = messages.find(m => m.id === messageId);
    if (failedMessage && failedMessage.role === 'user') {
      sendMessage(failedMessage.content);
    }
  };

  const getModelDisplayName = (modelId: string | undefined): string => {
    if (!modelId) return "Default Model";

    const modelMappings: Record<string, string> = {
      "claude-3": "Claude 3.5 Sonnet",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-haiku": "Claude 3 Haiku",
      "claude-3-opus": "Claude 3 Opus",
      "gpt-4": "GPT-4",
      "gpt-3.5-turbo": "GPT-3.5 Turbo"
    };

    return modelMappings[modelId] || modelId;
  };

  if (loading) {
    return (
      <div className="container max-w-6xl mx-auto py-6 space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-80" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-6xl mx-auto py-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">Failed to Load</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={fetchActiveChatbots} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (chatbots.length === 0) {
    return (
      <div className="container max-w-6xl mx-auto py-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">No Active Chatbots</h2>
              <p className="text-muted-foreground">
                Create and activate a chatbot to start chatting
              </p>
              <Button asChild>
                <a href="/dashboard/chatbots/new">Create Chatbot</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Chat Interface
          </h1>
          <p className="text-muted-foreground">
            Select an active chatbot and start a conversation
          </p>
        </div>

        {/* Chatbot Selection */}
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-80">
            <Select
              value={selectedChatbot?.id || ""}
              onValueChange={handleChatbotChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a chatbot..." />
              </SelectTrigger>
              <SelectContent>
                {chatbots.map((chatbot) => (
                  <SelectItem key={chatbot.id} value={chatbot.id}>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>{chatbot.name}</span>
                      <Badge variant="outline" className="ml-auto">
                        {getModelDisplayName(chatbot.configuration?.model)}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
            disabled={!selectedChatbot}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            New Session
          </Button>
        </div>

        {selectedChatbot && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold">{selectedChatbot.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedChatbot.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {getModelDisplayName(selectedChatbot.configuration?.model)}
                </Badge>
                <Badge variant="default">Active</Badge>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Chat Interface */}
      {selectedChatbot && currentSessionId ? (
        <PlaygroundChatInterface
          messages={messages}
          onSendMessage={sendMessage}
          isSending={isSending}
          placeholder={`Chat with ${selectedChatbot.name}...`}
          maxHeight="600px"
          className="min-h-[600px]"
          showVectorResults={false}
          onRetryMessage={handleRetryMessage}
        />
      ) : (
        <Card className="h-96">
          <CardContent className="h-full flex items-center justify-center">
            <div className="text-center space-y-4">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto" />
              <div>
                <h3 className="font-semibold">Ready to Chat</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedChatbot
                    ? "Creating chat session..."
                    : "Select a chatbot to start chatting"
                  }
                </p>
              </div>
              {selectedChatbot && (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}