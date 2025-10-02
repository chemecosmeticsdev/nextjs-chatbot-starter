"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Send,
  Download,
  RotateCcw,
  Settings,
  PlayCircle,
  StopCircle,
  MessageSquare,
  Clock,
  Zap,
  BarChart3,
  FileText,
  Brain,
  Search,
  Copy,
  Trash2,
  MoreVertical,
  User,
  Bot,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Database
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
    vectorSearchResults?: VectorSearchResult[];
    model?: string;
    temperature?: number;
  };
  status: "sending" | "sent" | "error";
}

interface VectorSearchResult {
  document_id: string;
  chunk_id: string;
  content: string;
  similarity_score: number;
  metadata: {
    title?: string;
    source?: string;
    page?: number;
  };
}

interface ChatSession {
  id: string;
  name: string;
  created_at: string;
  message_count: number;
  last_message: string;
}

interface PerformanceMetrics {
  averageResponseTime: number;
  totalMessages: number;
  successRate: number;
  totalTokensUsed: number;
  vectorSearchHits: number;
  sessionDuration: number;
}

interface ConfigOverride {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  enableVectorSearch?: boolean;
  similarityThreshold?: number;
  debugMode?: boolean;
}

export default function ChatbotPlaygroundPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State management
  const [chatbot, setChatbot] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [configOverride, setConfigOverride] = useState<ConfigOverride>({});
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showVectorResults, setShowVectorResults] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    averageResponseTime: 0,
    totalMessages: 0,
    successRate: 100,
    totalTokensUsed: 0,
    vectorSearchHits: 0,
    sessionDuration: 0
  });
  const [sessionStartTime, setSessionStartTime] = useState<Date>(new Date());

  useEffect(() => {
    fetchChatbotDetails();
    fetchChatSessions();
    createNewSession();
  }, [chatbotId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Update session duration every second
    const interval = setInterval(() => {
      const duration = Math.floor((new Date().getTime() - sessionStartTime.getTime()) / 1000);
      setMetrics(prev => ({ ...prev, sessionDuration: duration }));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime]);

  const fetchChatbotDetails = async () => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setChatbot(data);
    } catch (error) {
      console.error("Failed to fetch chatbot details:", error);
      toast({
        title: "Error",
        description: "Failed to load chatbot details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChatSessions = async () => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/playground-sessions`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error("Failed to fetch chat sessions:", error);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/playground-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Session ${new Date().toLocaleString()}`,
          config_override: configOverride
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const session = await response.json();
      setCurrentSessionId(session.id);
      setMessages([]);
      setSessionStartTime(new Date());
      setMetrics({
        averageResponseTime: 0,
        totalMessages: 0,
        successRate: 100,
        totalTokensUsed: 0,
        vectorSearchHits: 0,
        sessionDuration: 0
      });

      await fetchChatSessions();

      toast({
        title: "New Session",
        description: "Started a new conversation session.",
      });
    } catch (error) {
      console.error("Failed to create session:", error);
      toast({
        title: "Error",
        description: "Failed to create new session. Please try again.",
        variant: "destructive",
      });
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/playground-sessions/${sessionId}/messages`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setMessages(data.messages || []);
      setCurrentSessionId(sessionId);

      toast({
        title: "Session Loaded",
        description: "Previous conversation loaded successfully.",
      });
    } catch (error) {
      console.error("Failed to load session:", error);
      toast({
        title: "Error",
        description: "Failed to load session. Please try again.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isSending || !currentSessionId) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputMessage.trim(),
      timestamp: new Date().toISOString(),
      status: "sent"
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
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
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/playground-sessions/${currentSessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: inputMessage.trim(),
          config_override: configOverride,
          include_vector_results: showVectorResults
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
              content: data.response,
              status: "sent" as const,
              metadata: {
                responseTime,
                tokenUsage: data.token_usage || { prompt: 0, completion: 0, total: 0 },
                vectorSearchResults: data.vector_search_results || [],
                model: data.model,
                temperature: data.temperature
              }
            }
          : msg
      ));

      // Update metrics
      setMetrics(prev => {
        const newTotalMessages = prev.totalMessages + 1;
        const newAverageResponseTime = (prev.averageResponseTime * (newTotalMessages - 1) + responseTime) / newTotalMessages;
        const newTotalTokens = prev.totalTokensUsed + (data.token_usage?.total || 0);
        const newVectorHits = prev.vectorSearchHits + (data.vector_search_results?.length || 0);

        return {
          ...prev,
          averageResponseTime: newAverageResponseTime,
          totalMessages: newTotalMessages,
          totalTokensUsed: newTotalTokens,
          vectorSearchHits: newVectorHits
        };
      });

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

  const exportConversation = async (format: "json" | "txt" | "csv") => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/playground-sessions/${currentSessionId}/export?format=${format}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `conversation-${currentSessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Conversation exported as ${format.toUpperCase()}.`,
      });
    } catch (error) {
      console.error("Failed to export conversation:", error);
      toast({
        title: "Error",
        description: "Failed to export conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setSessionStartTime(new Date());
    setMetrics({
      averageResponseTime: 0,
      totalMessages: 0,
      successRate: 100,
      totalTokensUsed: 0,
      vectorSearchHits: 0,
      sessionDuration: 0
    });

    toast({
      title: "Conversation Cleared",
      description: "Chat history has been cleared.",
    });
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied",
      description: "Message copied to clipboard.",
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="container max-w-7xl mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Skeleton className="h-96" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!chatbot) {
    return (
      <div className="container max-w-7xl mx-auto py-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">Chatbot Not Found</h2>
              <p className="text-muted-foreground">
                The chatbot could not be loaded. Please try again.
              </p>
              <Button onClick={() => router.back()}>Go Back</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PlayCircle className="h-6 w-6" />
              Playground - {chatbot.name}
            </h1>
            <p className="text-muted-foreground">
              Test and interact with your chatbot in real-time
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfigPanel(!showConfigPanel)}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            {showConfigPanel ? "Hide" : "Show"} Config
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportConversation("json")}>
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportConversation("txt")}>
                Export as Text
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportConversation("csv")}>
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={createNewSession}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            New Session
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Chat Interface */}
        <div className="lg:col-span-3 space-y-4">
          {/* Performance Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Avg Response</p>
                  <p className="text-sm font-medium">{metrics.averageResponseTime.toFixed(0)}ms</p>
                </div>
              </div>
            </Card>

            <Card className="p-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Messages</p>
                  <p className="text-sm font-medium">{metrics.totalMessages}</p>
                </div>
              </div>
            </Card>

            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Tokens</p>
                  <p className="text-sm font-medium">{metrics.totalTokensUsed.toLocaleString()}</p>
                </div>
              </div>
            </Card>

            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Vector Hits</p>
                  <p className="text-sm font-medium">{metrics.vectorSearchHits}</p>
                </div>
              </div>
            </Card>

            <Card className="p-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-red-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                  <p className="text-sm font-medium">{metrics.successRate.toFixed(1)}%</p>
                </div>
              </div>
            </Card>

            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Session Time</p>
                  <p className="text-sm font-medium">{formatDuration(metrics.sessionDuration)}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Chat Interface */}
          <Card className="flex flex-col h-[600px]">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Bot className="h-3 w-3" />
                    {chatbot.model || "GPT-4"}
                  </Badge>
                  <Badge variant={chatbot.status === "active" ? "default" : "secondary"}>
                    {chatbot.status === "active" ? "Online" : "Offline"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowVectorResults(!showVectorResults)}
                    className="gap-2"
                  >
                    {showVectorResults ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    Vector Results
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearConversation}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col gap-4 p-0">
              {/* Messages Area */}
              <ScrollArea className="flex-1 px-6">
                <div className="space-y-4 pb-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-8 space-y-4">
                      <Bot className="h-12 w-12 text-muted-foreground mx-auto" />
                      <div>
                        <h3 className="text-lg font-semibold">Start a Conversation</h3>
                        <p className="text-muted-foreground">
                          Send a message to begin testing your chatbot
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex gap-3 max-w-[80%] ${
                            message.role === "user" ? "flex-row-reverse" : "flex-row"
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {message.role === "user" ? (
                              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                                <User className="h-4 w-4 text-primary-foreground" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                                <Bot className="h-4 w-4 text-secondary-foreground" />
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div
                              className={`rounded-lg p-3 ${
                                message.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  {message.status === "sending" ? (
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      <span className="text-sm">Thinking...</span>
                                    </div>
                                  ) : (
                                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                  )}
                                </div>

                                {message.role === "assistant" && message.status === "sent" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      <DropdownMenuItem onClick={() => copyMessage(message.content)}>
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </div>

                            {/* Message Metadata */}
                            {message.role === "assistant" && message.metadata && message.status === "sent" && (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span>⏱️ {message.metadata.responseTime}ms</span>
                                  {message.metadata.tokenUsage && (
                                    <span>🔤 {message.metadata.tokenUsage.total} tokens</span>
                                  )}
                                  {message.metadata.vectorSearchResults && message.metadata.vectorSearchResults.length > 0 && (
                                    <span>🔍 {message.metadata.vectorSearchResults.length} sources</span>
                                  )}
                                </div>

                                {/* Vector Search Results */}
                                {showVectorResults && message.metadata.vectorSearchResults && message.metadata.vectorSearchResults.length > 0 && (
                                  <div className="space-y-2 mt-2">
                                    <div className="text-xs font-medium text-muted-foreground">
                                      📚 Knowledge Sources:
                                    </div>
                                    {message.metadata.vectorSearchResults.slice(0, 3).map((result, index) => (
                                      <div key={index} className="bg-muted/50 rounded p-2 text-xs space-y-1">
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">{result.metadata.title || "Untitled"}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {(result.similarity_score * 100).toFixed(1)}%
                                          </Badge>
                                        </div>
                                        <p className="text-muted-foreground line-clamp-2">
                                          {result.content.substring(0, 100)}...
                                        </p>
                                        {result.metadata.source && (
                                          <p className="text-muted-foreground">
                                            Source: {result.metadata.source}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="border-t p-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={isSending}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isSending}
                    className="gap-2"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">
                  Press Enter to send, Shift+Enter for new line
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Configuration Override Panel */}
          {showConfigPanel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Configuration Override
                </CardTitle>
                <CardDescription className="text-xs">
                  Temporarily override chatbot settings for testing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Temperature</Label>
                  <Input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={configOverride.temperature || ""}
                    onChange={(e) => setConfigOverride(prev => ({
                      ...prev,
                      temperature: parseFloat(e.target.value) || undefined
                    }))}
                    placeholder="0.7"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Max Tokens</Label>
                  <Input
                    type="number"
                    min="100"
                    max="8192"
                    value={configOverride.maxTokens || ""}
                    onChange={(e) => setConfigOverride(prev => ({
                      ...prev,
                      maxTokens: parseInt(e.target.value) || undefined
                    }))}
                    placeholder="2048"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">System Prompt Override</Label>
                  <Textarea
                    value={configOverride.systemPrompt || ""}
                    onChange={(e) => setConfigOverride(prev => ({
                      ...prev,
                      systemPrompt: e.target.value || undefined
                    }))}
                    placeholder="Override system prompt..."
                    rows={3}
                    className="text-xs"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">Enable Vector Search</Label>
                  <Switch
                    checked={configOverride.enableVectorSearch ?? true}
                    onCheckedChange={(checked) => setConfigOverride(prev => ({
                      ...prev,
                      enableVectorSearch: checked
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">Debug Mode</Label>
                  <Switch
                    checked={configOverride.debugMode ?? false}
                    onCheckedChange={(checked) => setConfigOverride(prev => ({
                      ...prev,
                      debugMode: checked
                    }))}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfigOverride({})}
                  className="w-full text-xs"
                >
                  Reset Override
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Session Management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat Sessions
              </CardTitle>
              <CardDescription className="text-xs">
                Previous playground conversations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No previous sessions
                  </p>
                ) : (
                  sessions.slice(0, 5).map((session) => (
                    <div
                      key={session.id}
                      className={`p-2 rounded border cursor-pointer hover:bg-muted/50 transition-colors ${
                        session.id === currentSessionId ? "border-primary bg-primary/5" : ""
                      }`}
                      onClick={() => loadSession(session.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{session.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {session.message_count} messages
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(session.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {session.id === currentSessionId && (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={createNewSession}
                className="w-full mt-4 text-xs"
              >
                New Session
              </Button>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/configure`)}
                className="w-full justify-start text-xs gap-2"
              >
                <Settings className="h-4 w-4" />
                Edit Configuration
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/knowledge`)}
                className="w-full justify-start text-xs gap-2"
              >
                <Brain className="h-4 w-4" />
                Manage Knowledge
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/prompt`)}
                className="w-full justify-start text-xs gap-2"
              >
                <FileText className="h-4 w-4" />
                Edit Prompts
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}