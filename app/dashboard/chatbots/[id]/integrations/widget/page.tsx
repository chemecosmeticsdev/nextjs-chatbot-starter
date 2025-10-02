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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Copy,
  Eye,
  Code,
  Palette,
  Settings,
  Monitor,
  Smartphone,
  Download,
  Save,
  RefreshCw,
  ExternalLink,
  Shield,
  Globe,
  MessageSquare,
  Zap,
  CheckCircle,
  AlertCircle,
  Info
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface WidgetConfig {
  id?: string;
  name: string;
  api_key: string;
  theme: {
    primary_color: string;
    secondary_color: string;
    background_color: string;
    text_color: string;
    border_radius: number;
    font_family: string;
    font_size: number;
  };
  layout: {
    position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
    width: number;
    height: number;
    margin: number;
    bubble_style: "circle" | "rounded" | "square";
  };
  behavior: {
    greeting_message: string;
    placeholder_text: string;
    auto_open: boolean;
    auto_open_delay: number;
    show_typing_indicator: boolean;
    sound_enabled: boolean;
    persistent: boolean;
  };
  security: {
    allowed_domains: string[];
    rate_limit_enabled: boolean;
    rate_limit_per_minute: number;
    csrf_protection: boolean;
  };
  branding: {
    show_powered_by: boolean;
    custom_avatar_url?: string;
    bot_name: string;
    company_name?: string;
  };
  analytics: {
    track_events: boolean;
    track_user_behavior: boolean;
    session_recording: boolean;
  };
  status: "active" | "inactive" | "draft";
  created_at?: string;
  updated_at?: string;
}

interface WidgetStats {
  total_conversations: number;
  unique_visitors: number;
  conversion_rate: number;
  average_session_duration: number;
  most_active_domain: string;
  bounce_rate: number;
}

const defaultConfig: WidgetConfig = {
  name: "Website Chat Widget",
  api_key: "",
  theme: {
    primary_color: "#3b82f6",
    secondary_color: "#f3f4f6",
    background_color: "#ffffff",
    text_color: "#374151",
    border_radius: 12,
    font_family: "Inter, sans-serif",
    font_size: 14
  },
  layout: {
    position: "bottom-right",
    width: 380,
    height: 500,
    margin: 20,
    bubble_style: "circle"
  },
  behavior: {
    greeting_message: "Hi! How can I help you today?",
    placeholder_text: "Type your message...",
    auto_open: false,
    auto_open_delay: 3000,
    show_typing_indicator: true,
    sound_enabled: true,
    persistent: true
  },
  security: {
    allowed_domains: [],
    rate_limit_enabled: true,
    rate_limit_per_minute: 30,
    csrf_protection: true
  },
  branding: {
    show_powered_by: true,
    bot_name: "Assistant",
    company_name: ""
  },
  analytics: {
    track_events: true,
    track_user_behavior: false,
    session_recording: false
  },
  status: "draft"
};

export default function WidgetBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;

  const [config, setConfig] = useState<WidgetConfig>(defaultConfig);
  const [stats, setStats] = useState<WidgetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [activeTab, setActiveTab] = useState("design");
  const [generatedCode, setGeneratedCode] = useState("");

  useEffect(() => {
    fetchWidgetConfig();
  }, [chatbotId]);

  useEffect(() => {
    generateWidgetCode();
  }, [config]);

  const fetchWidgetConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/widget`);

      if (response.ok) {
        const data = await response.json();
        setConfig({ ...defaultConfig, ...data.config });
        setStats(data.stats);
      } else if (response.status !== 404) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Generate API key if not exists
      if (!config.api_key) {
        generateApiKey();
      }
    } catch (error) {
      console.error("Failed to fetch widget config:", error);
      toast({
        title: "Error",
        description: "Failed to load widget configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateApiKey = async () => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/widget/api-key`, {
        method: "POST"
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(prev => ({ ...prev, api_key: data.api_key }));
      }
    } catch (error) {
      console.error("Failed to generate API key:", error);
    }
  };

  const generateWidgetCode = () => {
    const code = `<!-- Chat Widget Integration -->
<script>
  (function() {
    // Widget Configuration
    window.ChatbotWidget = {
      apiKey: '${config.api_key}',
      chatbotId: '${chatbotId}',
      config: {
        theme: ${JSON.stringify(config.theme, null, 6)},
        layout: ${JSON.stringify(config.layout, null, 6)},
        behavior: ${JSON.stringify(config.behavior, null, 6)},
        branding: ${JSON.stringify(config.branding, null, 6)}
      }
    };

    // Load Widget Script
    var script = document.createElement('script');
    script.src = '${window.location.origin}/widget.js';
    script.async = true;
    document.head.appendChild(script);
  })();
</script>

<!-- Optional: Custom Styling -->
<style>
  .chatbot-widget {
    --primary-color: ${config.theme.primary_color};
    --secondary-color: ${config.theme.secondary_color};
    --background-color: ${config.theme.background_color};
    --text-color: ${config.theme.text_color};
    --border-radius: ${config.theme.border_radius}px;
    --font-family: ${config.theme.font_family};
    --font-size: ${config.theme.font_size}px;
  }
</style>`;

    setGeneratedCode(code);
  };

  const saveConfiguration = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/widget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setConfig(data.config);

      toast({
        title: "Success",
        description: "Widget configuration saved successfully.",
      });
    } catch (error) {
      console.error("Failed to save widget config:", error);
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard.`,
    });
  };

  const downloadCode = () => {
    const blob = new Blob([generatedCode], { type: "text/html" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `chatbot-widget-${chatbotId}.html`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Widget code downloaded successfully.",
    });
  };

  const refreshPreview = () => {
    setPreviewKey(prev => prev + 1);
    toast({
      title: "Preview Refreshed",
      description: "Widget preview has been updated with latest changes.",
    });
  };

  const updateTheme = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      theme: { ...prev.theme, [field]: value }
    }));
  };

  const updateLayout = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      layout: { ...prev.layout, [field]: value }
    }));
  };

  const updateBehavior = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      behavior: { ...prev.behavior, [field]: value }
    }));
  };

  const updateSecurity = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      security: { ...prev.security, [field]: value }
    }));
  };

  const updateBranding = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      branding: { ...prev.branding, [field]: value }
    }));
  };

  const addAllowedDomain = (domain: string) => {
    if (domain && !config.security.allowed_domains.includes(domain)) {
      setConfig(prev => ({
        ...prev,
        security: {
          ...prev.security,
          allowed_domains: [...prev.security.allowed_domains, domain]
        }
      }));
    }
  };

  const removeDomain = (domain: string) => {
    setConfig(prev => ({
      ...prev,
      security: {
        ...prev.security,
        allowed_domains: prev.security.allowed_domains.filter(d => d !== domain)
      }
    }));
  };

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
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
            onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/integrations`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Integrations
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Monitor className="h-6 w-6 text-blue-600" />
              Widget Builder
            </h1>
            <p className="text-muted-foreground">
              Create and customize a chat widget for your website
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={config.status === "active" ? "default" : "secondary"}>
            {config.status === "active" ? "Published" : "Draft"}
          </Badge>
          <Button
            onClick={saveConfiguration}
            disabled={saving}
            className="gap-2"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="behavior">Behavior</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            {/* Design Tab */}
            <TabsContent value="design" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Theme & Colors
                  </CardTitle>
                  <CardDescription>
                    Customize the visual appearance of your chat widget
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={config.theme.primary_color}
                          onChange={(e) => updateTheme("primary_color", e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={config.theme.primary_color}
                          onChange={(e) => updateTheme("primary_color", e.target.value)}
                          placeholder="#3b82f6"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Background Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={config.theme.background_color}
                          onChange={(e) => updateTheme("background_color", e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={config.theme.background_color}
                          onChange={(e) => updateTheme("background_color", e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Text Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={config.theme.text_color}
                          onChange={(e) => updateTheme("text_color", e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={config.theme.text_color}
                          onChange={(e) => updateTheme("text_color", e.target.value)}
                          placeholder="#374151"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Font Family</Label>
                      <Select
                        value={config.theme.font_family}
                        onValueChange={(value) => updateTheme("font_family", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                          <SelectItem value="Roboto, sans-serif">Roboto</SelectItem>
                          <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                          <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                          <SelectItem value="Times New Roman, serif">Times New Roman</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Border Radius: {config.theme.border_radius}px</Label>
                      <Slider
                        value={[config.theme.border_radius]}
                        onValueChange={(value) => updateTheme("border_radius", value[0])}
                        max={24}
                        min={0}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Font Size: {config.theme.font_size}px</Label>
                      <Slider
                        value={[config.theme.font_size]}
                        onValueChange={(value) => updateTheme("font_size", value[0])}
                        max={20}
                        min={10}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Layout & Position</CardTitle>
                  <CardDescription>
                    Configure widget size and position on your website
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Position</Label>
                      <Select
                        value={config.layout.position}
                        onValueChange={(value) => updateLayout("position", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bottom-right">Bottom Right</SelectItem>
                          <SelectItem value="bottom-left">Bottom Left</SelectItem>
                          <SelectItem value="top-right">Top Right</SelectItem>
                          <SelectItem value="top-left">Top Left</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Bubble Style</Label>
                      <Select
                        value={config.layout.bubble_style}
                        onValueChange={(value) => updateLayout("bubble_style", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="circle">Circle</SelectItem>
                          <SelectItem value="rounded">Rounded</SelectItem>
                          <SelectItem value="square">Square</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Width</Label>
                      <Input
                        type="number"
                        value={config.layout.width}
                        onChange={(e) => updateLayout("width", parseInt(e.target.value) || 380)}
                        min={300}
                        max={600}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Height</Label>
                      <Input
                        type="number"
                        value={config.layout.height}
                        onChange={(e) => updateLayout("height", parseInt(e.target.value) || 500)}
                        min={400}
                        max={800}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Margin: {config.layout.margin}px</Label>
                    <Slider
                      value={[config.layout.margin]}
                      onValueChange={(value) => updateLayout("margin", value[0])}
                      max={50}
                      min={10}
                      step={5}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>
                    Customize branding and identity settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Bot Name</Label>
                    <Input
                      value={config.branding.bot_name}
                      onChange={(e) => updateBranding("bot_name", e.target.value)}
                      placeholder="Assistant"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Company Name (Optional)</Label>
                    <Input
                      value={config.branding.company_name || ""}
                      onChange={(e) => updateBranding("company_name", e.target.value)}
                      placeholder="Your Company Name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Avatar URL (Optional)</Label>
                    <Input
                      value={config.branding.custom_avatar_url || ""}
                      onChange={(e) => updateBranding("custom_avatar_url", e.target.value)}
                      placeholder="https://example.com/avatar.png"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Show "Powered by" Branding</Label>
                      <p className="text-xs text-muted-foreground">
                        Display attribution link in the widget
                      </p>
                    </div>
                    <Switch
                      checked={config.branding.show_powered_by}
                      onCheckedChange={(checked) => updateBranding("show_powered_by", checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Behavior Tab */}
            <TabsContent value="behavior" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Chat Behavior
                  </CardTitle>
                  <CardDescription>
                    Configure how your chat widget behaves and interacts with users
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Greeting Message</Label>
                    <Textarea
                      value={config.behavior.greeting_message}
                      onChange={(e) => updateBehavior("greeting_message", e.target.value)}
                      placeholder="Hi! How can I help you today?"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Input Placeholder Text</Label>
                    <Input
                      value={config.behavior.placeholder_text}
                      onChange={(e) => updateBehavior("placeholder_text", e.target.value)}
                      placeholder="Type your message..."
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Auto-open Widget</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically open the chat widget when page loads
                      </p>
                    </div>
                    <Switch
                      checked={config.behavior.auto_open}
                      onCheckedChange={(checked) => updateBehavior("auto_open", checked)}
                    />
                  </div>

                  {config.behavior.auto_open && (
                    <div className="space-y-2">
                      <Label>Auto-open Delay: {config.behavior.auto_open_delay / 1000}s</Label>
                      <Slider
                        value={[config.behavior.auto_open_delay]}
                        onValueChange={(value) => updateBehavior("auto_open_delay", value[0])}
                        max={10000}
                        min={1000}
                        step={500}
                        className="w-full"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Show Typing Indicator</Label>
                      <p className="text-xs text-muted-foreground">
                        Display typing animation while bot is responding
                      </p>
                    </div>
                    <Switch
                      checked={config.behavior.show_typing_indicator}
                      onCheckedChange={(checked) => updateBehavior("show_typing_indicator", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Sound Notifications</Label>
                      <p className="text-xs text-muted-foreground">
                        Play sound when new messages arrive
                      </p>
                    </div>
                    <Switch
                      checked={config.behavior.sound_enabled}
                      onCheckedChange={(checked) => updateBehavior("sound_enabled", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Persistent Sessions</Label>
                      <p className="text-xs text-muted-foreground">
                        Remember conversation when user returns
                      </p>
                    </div>
                    <Switch
                      checked={config.behavior.persistent}
                      onCheckedChange={(checked) => updateBehavior("persistent", checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security Settings
                  </CardTitle>
                  <CardDescription>
                    Configure security and access control for your widget
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Security settings help protect your widget from unauthorized use
                      and potential abuse. Configure these settings carefully.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Allowed Domains</Label>
                      <div className="space-y-2">
                        {config.security.allowed_domains.map((domain, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input value={domain} readOnly className="flex-1" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeDomain(domain)}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input
                            placeholder="example.com"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                addAllowedDomain((e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              const input = (e.target as HTMLElement).parentElement?.querySelector('input');
                              if (input) {
                                addAllowedDomain(input.value);
                                input.value = '';
                              }
                            }}
                          >
                            Add
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Leave empty to allow all domains. Add specific domains to restrict usage.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Rate Limiting</Label>
                        <p className="text-xs text-muted-foreground">
                          Limit the number of messages per user per minute
                        </p>
                      </div>
                      <Switch
                        checked={config.security.rate_limit_enabled}
                        onCheckedChange={(checked) => updateSecurity("rate_limit_enabled", checked)}
                      />
                    </div>

                    {config.security.rate_limit_enabled && (
                      <div className="space-y-2">
                        <Label>Messages per minute: {config.security.rate_limit_per_minute}</Label>
                        <Slider
                          value={[config.security.rate_limit_per_minute]}
                          onValueChange={(value) => updateSecurity("rate_limit_per_minute", value[0])}
                          max={100}
                          min={5}
                          step={5}
                          className="w-full"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>CSRF Protection</Label>
                        <p className="text-xs text-muted-foreground">
                          Enable Cross-Site Request Forgery protection
                        </p>
                      </div>
                      <Switch
                        checked={config.security.csrf_protection}
                        onCheckedChange={(checked) => updateSecurity("csrf_protection", checked)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        value={config.api_key}
                        readOnly
                        className="font-mono text-sm bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(config.api_key, "API Key")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This API key authenticates your widget with the chatbot service
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Code Tab */}
            <TabsContent value="code" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Widget Code
                  </CardTitle>
                  <CardDescription>
                    Copy and paste this code into your website to add the chat widget
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Installation Instructions:</strong><br />
                      1. Copy the code below<br />
                      2. Paste it before the closing &lt;/body&gt; tag of your HTML<br />
                      3. Save and publish your website
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Generated Widget Code</Label>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(generatedCode, "Widget Code")}
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Copy Code
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadCode}
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={generatedCode}
                      readOnly
                      className="font-mono text-xs bg-muted min-h-[300px]"
                    />
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Note:</strong> The widget will automatically adapt to your website's
                      design and respect the configuration settings you've chosen above.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Analytics Settings
                  </CardTitle>
                  <CardDescription>
                    Configure what data to collect from your widget users
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Track Events</Label>
                      <p className="text-xs text-muted-foreground">
                        Track widget opens, message sends, and other interactions
                      </p>
                    </div>
                    <Switch
                      checked={config.analytics.track_events}
                      onCheckedChange={(checked) => setConfig(prev => ({
                        ...prev,
                        analytics: { ...prev.analytics, track_events: checked }
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Track User Behavior</Label>
                      <p className="text-xs text-muted-foreground">
                        Anonymously track user behavior patterns
                      </p>
                    </div>
                    <Switch
                      checked={config.analytics.track_user_behavior}
                      onCheckedChange={(checked) => setConfig(prev => ({
                        ...prev,
                        analytics: { ...prev.analytics, track_user_behavior: checked }
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Session Recording</Label>
                      <p className="text-xs text-muted-foreground">
                        Record chat sessions for analysis (privacy compliant)
                      </p>
                    </div>
                    <Switch
                      checked={config.analytics.session_recording}
                      onCheckedChange={(checked) => setConfig(prev => ({
                        ...prev,
                        analytics: { ...prev.analytics, session_recording: checked }
                      }))}
                    />
                  </div>

                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      All analytics data is collected in compliance with privacy regulations
                      and can be disabled at any time. No personal information is stored
                      without explicit consent.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              {stats && (
                <Card>
                  <CardHeader>
                    <CardTitle>Widget Performance</CardTitle>
                    <CardDescription>
                      Current statistics for your widget usage
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Total Conversations</p>
                        <p className="text-2xl font-bold">{stats.total_conversations.toLocaleString()}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Unique Visitors</p>
                        <p className="text-2xl font-bold">{stats.unique_visitors.toLocaleString()}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Conversion Rate</p>
                        <p className="text-2xl font-bold">{stats.conversion_rate}%</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Avg Session Duration</p>
                        <p className="text-2xl font-bold">{Math.round(stats.average_session_duration / 60)}m</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Live Preview
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshPreview}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                  <Badge variant="outline">
                    <Monitor className="h-3 w-3 mr-1" />
                    Desktop
                  </Badge>
                </div>
              </CardTitle>
              <CardDescription>
                See how your widget will look on your website
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-8 min-h-[500px] overflow-hidden">
                {/* Mock Website Content */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
                  <div className="h-4 bg-gray-300 rounded mb-3 w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded mb-2 w-5/6"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>

                {/* Widget Preview */}
                <div
                  key={previewKey}
                  className={`absolute ${
                    config.layout.position === "bottom-right" ? "bottom-4 right-4" :
                    config.layout.position === "bottom-left" ? "bottom-4 left-4" :
                    config.layout.position === "top-right" ? "top-4 right-4" :
                    "top-4 left-4"
                  }`}
                  style={{ margin: `${config.layout.margin}px` }}
                >
                  {/* Chat Bubble */}
                  <div
                    className={`w-14 h-14 flex items-center justify-center cursor-pointer shadow-lg transition-all hover:scale-110 ${
                      config.layout.bubble_style === "circle" ? "rounded-full" :
                      config.layout.bubble_style === "rounded" ? "rounded-xl" :
                      "rounded-none"
                    }`}
                    style={{
                      backgroundColor: config.theme.primary_color,
                      color: "white"
                    }}
                  >
                    <MessageSquare className="h-6 w-6" />
                  </div>

                  {/* Chat Window (shown expanded) */}
                  <div
                    className="absolute bottom-16 right-0 bg-white shadow-2xl border overflow-hidden"
                    style={{
                      width: `${config.layout.width}px`,
                      height: `${config.layout.height}px`,
                      borderRadius: `${config.theme.border_radius}px`,
                      fontFamily: config.theme.font_family,
                      fontSize: `${config.theme.font_size}px`
                    }}
                  >
                    {/* Header */}
                    <div
                      className="p-4 text-white flex items-center justify-between"
                      style={{ backgroundColor: config.theme.primary_color }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{config.branding.bot_name}</p>
                          <p className="text-xs opacity-75">Online</p>
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 p-4 space-y-3" style={{ backgroundColor: config.theme.background_color }}>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="h-4 w-4 text-gray-600" />
                        </div>
                        <div
                          className="bg-gray-100 rounded-lg p-3 max-w-[80%]"
                          style={{
                            color: config.theme.text_color,
                            borderRadius: `${config.theme.border_radius}px`
                          }}
                        >
                          <p className="text-sm">{config.behavior.greeting_message}</p>
                        </div>
                      </div>

                      <div className="flex gap-3 justify-end">
                        <div
                          className="text-white rounded-lg p-3 max-w-[80%]"
                          style={{
                            backgroundColor: config.theme.primary_color,
                            borderRadius: `${config.theme.border_radius}px`
                          }}
                        >
                          <p className="text-sm">Hello! I'd like to know more about your services.</p>
                        </div>
                      </div>

                      {config.behavior.show_typing_indicator && (
                        <div className="flex gap-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="h-4 w-4 text-gray-600" />
                          </div>
                          <div className="bg-gray-100 rounded-lg p-3">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Input */}
                    <div className="border-t p-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={config.behavior.placeholder_text}
                          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                          style={{
                            borderRadius: `${config.theme.border_radius}px`,
                            borderColor: config.theme.primary_color + "40",
                            color: config.theme.text_color
                          }}
                          readOnly
                        />
                        <button
                          className="px-4 py-2 text-white rounded-lg"
                          style={{
                            backgroundColor: config.theme.primary_color,
                            borderRadius: `${config.theme.border_radius}px`
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Powered by */}
                    {config.branding.show_powered_by && (
                      <div className="px-4 pb-2">
                        <p className="text-xs text-gray-400 text-center">
                          Powered by ChatBot
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/playground`)}
                className="w-full justify-start gap-2"
                variant="outline"
              >
                <MessageSquare className="h-4 w-4" />
                Test in Playground
              </Button>

              <Button
                onClick={() => window.open("https://example.com", "_blank")}
                className="w-full justify-start gap-2"
                variant="outline"
              >
                <ExternalLink className="h-4 w-4" />
                Preview on Website
              </Button>

              <Button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  status: prev.status === "active" ? "draft" : "active"
                }))}
                className="w-full justify-start gap-2"
                variant="outline"
              >
                <Globe className="h-4 w-4" />
                {config.status === "active" ? "Unpublish" : "Publish"} Widget
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}