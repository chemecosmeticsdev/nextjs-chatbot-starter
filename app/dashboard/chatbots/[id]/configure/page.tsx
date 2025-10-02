"use client";

import { useState, useEffect } from "react";
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
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, RotateCcw, Eye, Settings, Brain, Shield, Globe, MessageSquare, Clock, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ChatbotConfig {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive" | "training";
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  responseStyle: "professional" | "casual" | "friendly" | "technical";
  language: string;
  timezone: string;
  enableLogging: boolean;
  enableAnalytics: boolean;
  rateLimitPerMinute: number;
  sessionTimeout: number;
  autoSave: boolean;
  enableFallback: boolean;
  fallbackMessage: string;
  enableWelcomeMessage: boolean;
  welcomeMessage: string;
  enableTypingIndicator: boolean;
  maxConversationLength: number;
  retentionDays: number;
  enableEmoticons: boolean;
  enableFileUploads: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  createdAt: string;
  updatedAt: string;
}

const defaultConfig: Partial<ChatbotConfig> = {
  temperature: 0.7,
  maxTokens: 2048,
  responseStyle: "professional",
  language: "en",
  timezone: "UTC",
  enableLogging: true,
  enableAnalytics: true,
  rateLimitPerMinute: 60,
  sessionTimeout: 30,
  autoSave: true,
  enableFallback: true,
  fallbackMessage: "I'm sorry, I didn't understand that. Could you please rephrase your question?",
  enableWelcomeMessage: true,
  welcomeMessage: "Hello! How can I help you today?",
  enableTypingIndicator: true,
  maxConversationLength: 50,
  retentionDays: 30,
  enableEmoticons: false,
  enableFileUploads: false,
  maxFileSize: 10,
  allowedFileTypes: ["pdf", "txt", "docx"]
};

export default function ChatbotConfigurationPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;

  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<ChatbotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [previewMode, setPreviewMode] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchChatbotConfig();
  }, [chatbotId]);

  useEffect(() => {
    if (config && originalConfig) {
      const hasChanged = JSON.stringify(config) !== JSON.stringify(originalConfig);
      setHasChanges(hasChanged);
    }
  }, [config, originalConfig]);

  const fetchChatbotConfig = async () => {
    try {
      setLoading(true);
      setValidationErrors({});

      const response = await fetch(`/api/v1/chatbots/${chatbotId}/config`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Chatbot not found');
        }
        if (response.status === 403) {
          throw new Error('Access denied - insufficient permissions');
        }
        throw new Error(`Failed to load configuration (HTTP ${response.status})`);
      }

      const responseData = await response.json();

      if (!responseData.success) {
        throw new Error(responseData.error?.message || 'Failed to load configuration');
      }

      // Merge default config with API response data
      const configData = { ...defaultConfig, ...responseData.data };
      setConfig(configData as ChatbotConfig);
      setOriginalConfig(configData as ChatbotConfig);

    } catch (error: any) {
      console.error("Failed to fetch chatbot config:", error);
      toast({
        title: "Configuration Error",
        description: error.message || "Failed to load chatbot configuration. Please try again.",
        variant: "destructive",
      });

      // Set fallback config to prevent completely broken state
      const fallbackConfig = { ...defaultConfig, id: chatbotId, name: 'Loading...', description: '' } as ChatbotConfig;
      setConfig(fallbackConfig);
      setOriginalConfig(fallbackConfig);
    } finally {
      setLoading(false);
    }
  };

  const validateConfig = (configToValidate: ChatbotConfig): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!configToValidate.name?.trim()) {
      errors.name = "Chatbot name is required";
    }

    if (configToValidate.temperature < 0 || configToValidate.temperature > 2) {
      errors.temperature = "Temperature must be between 0 and 2";
    }

    if (configToValidate.maxTokens < 100 || configToValidate.maxTokens > 8192) {
      errors.maxTokens = "Max tokens must be between 100 and 8192";
    }

    if (configToValidate.rateLimitPerMinute < 1 || configToValidate.rateLimitPerMinute > 1000) {
      errors.rateLimitPerMinute = "Rate limit must be between 1 and 1000";
    }

    if (configToValidate.sessionTimeout < 5 || configToValidate.sessionTimeout > 180) {
      errors.sessionTimeout = "Session timeout must be between 5 and 180 minutes";
    }

    if (configToValidate.maxFileSize < 1 || configToValidate.maxFileSize > 100) {
      errors.maxFileSize = "Max file size must be between 1 and 100 MB";
    }

    return errors;
  };

  const handleSave = async () => {
    if (!config) return;

    const errors = validateConfig(config);
    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      toast({
        title: "Validation Error",
        description: "Please fix the validation errors before saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: 'include',
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Chatbot not found');
        }
        if (response.status === 403) {
          throw new Error('Access denied - insufficient permissions');
        }
        if (response.status === 400) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || 'Invalid configuration data');
        }
        throw new Error(`Failed to save configuration (HTTP ${response.status})`);
      }

      const responseData = await response.json();

      if (!responseData.success) {
        throw new Error(responseData.error?.message || 'Failed to save configuration');
      }

      // Update state with saved configuration
      const updatedConfig = responseData.data;
      setConfig(updatedConfig);
      setOriginalConfig(updatedConfig);
      setValidationErrors({});

      toast({
        title: "Configuration Saved",
        description: "Chatbot configuration has been saved successfully.",
      });
    } catch (error: any) {
      console.error("Failed to save config:", error);
      toast({
        title: "Save Error",
        description: error.message || "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalConfig) {
      setConfig({ ...originalConfig });
      setValidationErrors({});
      toast({
        title: "Reset",
        description: "Configuration reset to last saved state.",
      });
    }
  };

  const updateConfig = (field: keyof ChatbotConfig, value: any) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  if (loading) {
    return (
      <div className="container max-w-6xl mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container max-w-6xl mx-auto py-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">Configuration Not Found</h2>
              <p className="text-muted-foreground">
                The chatbot configuration could not be loaded. Please try again.
              </p>
              <Button onClick={() => router.back()}>Go Back</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-6">
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
              <Settings className="h-6 w-6" />
              Configuration
            </h1>
            <p className="text-muted-foreground">
              Configure your chatbot's behavior, responses, and settings
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Unsaved Changes
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            {previewMode ? "Exit Preview" : "Preview"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasChanges || saving}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="gap-2"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="model">AI Model</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Basic Information
              </CardTitle>
              <CardDescription>
                Configure the basic details and appearance of your chatbot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Chatbot Name</Label>
                  <Input
                    id="name"
                    value={config.name || ""}
                    onChange={(e) => updateConfig("name", e.target.value)}
                    placeholder="Enter chatbot name"
                    className={validationErrors.name ? "border-destructive" : ""}
                  />
                  {validationErrors.name && (
                    <p className="text-sm text-destructive">{validationErrors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={config.status}
                    onValueChange={(value) => updateConfig("status", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select
                    value={config.language}
                    onValueChange={(value) => updateConfig("language", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="zh">Chinese</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={config.timezone}
                    onValueChange={(value) => updateConfig("timezone", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Paris">Paris</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                      <SelectItem value="Asia/Singapore">Singapore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={config.description || ""}
                  onChange={(e) => updateConfig("description", e.target.value)}
                  placeholder="Describe what your chatbot does..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Model Settings */}
        <TabsContent value="model" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Model Configuration
              </CardTitle>
              <CardDescription>
                Configure the AI model and its behavior parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="model">AI Model</Label>
                <Select
                  value={config.model}
                  onValueChange={(value) => updateConfig("model", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                    <SelectItem value="claude-3">Claude 3</SelectItem>
                    <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Temperature: {config.temperature}</Label>
                  <Slider
                    value={[config.temperature]}
                    onValueChange={(value) => updateConfig("temperature", value[0])}
                    max={2}
                    min={0}
                    step={0.1}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground">
                    Controls randomness. Lower values make responses more focused and deterministic.
                  </p>
                  {validationErrors.temperature && (
                    <p className="text-sm text-destructive">{validationErrors.temperature}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={config.maxTokens}
                    onChange={(e) => updateConfig("maxTokens", parseInt(e.target.value) || 0)}
                    min={100}
                    max={8192}
                    className={validationErrors.maxTokens ? "border-destructive" : ""}
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum length of the response (100-8192 tokens)
                  </p>
                  {validationErrors.maxTokens && (
                    <p className="text-sm text-destructive">{validationErrors.maxTokens}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt</Label>
                  <Textarea
                    id="systemPrompt"
                    value={config.systemPrompt || ""}
                    onChange={(e) => updateConfig("systemPrompt", e.target.value)}
                    placeholder="Enter system instructions for the AI..."
                    rows={6}
                  />
                  <p className="text-sm text-muted-foreground">
                    System-level instructions that define the AI's role and behavior
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Behavior Settings */}
        <TabsContent value="behavior" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Response Behavior
              </CardTitle>
              <CardDescription>
                Configure how your chatbot responds and interacts with users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="responseStyle">Response Style</Label>
                  <Select
                    value={config.responseStyle}
                    onValueChange={(value) => updateConfig("responseStyle", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="technical">Technical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxConversationLength">Max Conversation Length</Label>
                  <Input
                    id="maxConversationLength"
                    type="number"
                    value={config.maxConversationLength}
                    onChange={(e) => updateConfig("maxConversationLength", parseInt(e.target.value) || 0)}
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Welcome & Fallback Messages</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enable Welcome Message</Label>
                    <p className="text-sm text-muted-foreground">
                      Show a greeting when users start a conversation
                    </p>
                  </div>
                  <Switch
                    checked={config.enableWelcomeMessage}
                    onCheckedChange={(checked) => updateConfig("enableWelcomeMessage", checked)}
                  />
                </div>

                {config.enableWelcomeMessage && (
                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Welcome Message</Label>
                    <Textarea
                      id="welcomeMessage"
                      value={config.welcomeMessage || ""}
                      onChange={(e) => updateConfig("welcomeMessage", e.target.value)}
                      placeholder="Enter welcome message..."
                      rows={2}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enable Fallback Response</Label>
                    <p className="text-sm text-muted-foreground">
                      Show a default message when the AI can't understand
                    </p>
                  </div>
                  <Switch
                    checked={config.enableFallback}
                    onCheckedChange={(checked) => updateConfig("enableFallback", checked)}
                  />
                </div>

                {config.enableFallback && (
                  <div className="space-y-2">
                    <Label htmlFor="fallbackMessage">Fallback Message</Label>
                    <Textarea
                      id="fallbackMessage"
                      value={config.fallbackMessage || ""}
                      onChange={(e) => updateConfig("fallbackMessage", e.target.value)}
                      placeholder="Enter fallback message..."
                      rows={2}
                    />
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">UI Behavior</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Show Typing Indicator</Label>
                    <p className="text-sm text-muted-foreground">
                      Display typing animation while generating responses
                    </p>
                  </div>
                  <Switch
                    checked={config.enableTypingIndicator}
                    onCheckedChange={(checked) => updateConfig("enableTypingIndicator", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enable Emoticons</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow the chatbot to use emoticons in responses
                    </p>
                  </div>
                  <Switch
                    checked={config.enableEmoticons}
                    onCheckedChange={(checked) => updateConfig("enableEmoticons", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security & Privacy
              </CardTitle>
              <CardDescription>
                Configure security measures and data handling policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="rateLimitPerMinute">Rate Limit (per minute)</Label>
                  <Input
                    id="rateLimitPerMinute"
                    type="number"
                    value={config.rateLimitPerMinute}
                    onChange={(e) => updateConfig("rateLimitPerMinute", parseInt(e.target.value) || 0)}
                    min={1}
                    max={1000}
                    className={validationErrors.rateLimitPerMinute ? "border-destructive" : ""}
                  />
                  {validationErrors.rateLimitPerMinute && (
                    <p className="text-sm text-destructive">{validationErrors.rateLimitPerMinute}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={config.sessionTimeout}
                    onChange={(e) => updateConfig("sessionTimeout", parseInt(e.target.value) || 0)}
                    min={5}
                    max={180}
                    className={validationErrors.sessionTimeout ? "border-destructive" : ""}
                  />
                  {validationErrors.sessionTimeout && (
                    <p className="text-sm text-destructive">{validationErrors.sessionTimeout}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retentionDays">Data Retention (days)</Label>
                  <Input
                    id="retentionDays"
                    type="number"
                    value={config.retentionDays}
                    onChange={(e) => updateConfig("retentionDays", parseInt(e.target.value) || 0)}
                    min={1}
                    max={365}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Logging & Analytics</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enable Conversation Logging</Label>
                    <p className="text-sm text-muted-foreground">
                      Log conversations for debugging and improvement
                    </p>
                  </div>
                  <Switch
                    checked={config.enableLogging}
                    onCheckedChange={(checked) => updateConfig("enableLogging", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enable Analytics</Label>
                    <p className="text-sm text-muted-foreground">
                      Collect usage analytics and performance metrics
                    </p>
                  </div>
                  <Switch
                    checked={config.enableAnalytics}
                    onCheckedChange={(checked) => updateConfig("enableAnalytics", checked)}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">File Upload Security</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Allow File Uploads</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable users to upload files to the chatbot
                    </p>
                  </div>
                  <Switch
                    checked={config.enableFileUploads}
                    onCheckedChange={(checked) => updateConfig("enableFileUploads", checked)}
                  />
                </div>

                {config.enableFileUploads && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="maxFileSize">Max File Size (MB)</Label>
                      <Input
                        id="maxFileSize"
                        type="number"
                        value={config.maxFileSize}
                        onChange={(e) => updateConfig("maxFileSize", parseInt(e.target.value) || 0)}
                        min={1}
                        max={100}
                        className={validationErrors.maxFileSize ? "border-destructive" : ""}
                      />
                      {validationErrors.maxFileSize && (
                        <p className="text-sm text-destructive">{validationErrors.maxFileSize}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Allowed File Types</Label>
                      <div className="flex flex-wrap gap-2">
                        {["pdf", "txt", "docx", "xlsx", "csv", "json", "md"].map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={type}
                              checked={config.allowedFileTypes?.includes(type) || false}
                              onChange={(e) => {
                                const currentTypes = config.allowedFileTypes || [];
                                if (e.target.checked) {
                                  updateConfig("allowedFileTypes", [...currentTypes, type]);
                                } else {
                                  updateConfig("allowedFileTypes", currentTypes.filter(t => t !== type));
                                }
                              }}
                            />
                            <Label htmlFor={type} className="text-sm font-normal">
                              {type.toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Advanced Configuration
              </CardTitle>
              <CardDescription>
                Advanced settings for power users and developers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Auto-Save Configuration</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically save changes as you make them
                  </p>
                </div>
                <Switch
                  checked={config.autoSave}
                  onCheckedChange={(checked) => updateConfig("autoSave", checked)}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Configuration Export/Import</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Export Configuration
                  </Button>
                  <Button variant="outline" size="sm">
                    Import Configuration
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Export your current configuration or import from a backup file
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Development Mode</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Debug Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable detailed logging for debugging
                      </p>
                    </div>
                    <Switch
                      checked={false}
                      onCheckedChange={() => {}}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Test Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Simulate responses without using API credits
                      </p>
                    </div>
                    <Switch
                      checked={false}
                      onCheckedChange={() => {}}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Danger Zone</h4>
                <div className="space-y-2">
                  <Button variant="destructive" size="sm">
                    Reset to Defaults
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Reset all configuration to default values. This action cannot be undone.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}