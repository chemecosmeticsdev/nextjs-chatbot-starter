"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  QrCode,
  Settings,
  Users,
  BarChart3,
  Webhook,
  Shield,
  Save,
  TestTube,
  Download,
  Upload,
  Eye,
  EyeOff,
  RefreshCw,
  Link as LinkIcon,
  Smartphone
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface LineConfig {
  id?: string;
  channel_id: string;
  channel_secret: string;
  channel_access_token: string;
  webhook_url: string;
  verification_token: string;
  status: "active" | "inactive" | "pending";
  line_bot_basic_id?: string;
  rich_menu_id?: string;
  greeting_message?: string;
  webhook_events: string[];
  created_at?: string;
  updated_at?: string;
}

interface LineStats {
  total_followers: number;
  messages_sent: number;
  messages_received: number;
  active_sessions: number;
  response_rate: number;
  average_response_time: number;
}

export default function LineOASetupPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;

  const [config, setConfig] = useState<LineConfig>({
    channel_id: "",
    channel_secret: "",
    channel_access_token: "",
    webhook_url: "",
    verification_token: "",
    status: "inactive",
    webhook_events: ["message", "follow", "unfollow"]
  });
  const [stats, setStats] = useState<LineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showSecrets, setShowSecrets] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const webhookEvents = [
    { id: "message", label: "Messages", description: "Receive user messages" },
    { id: "follow", label: "Follow Events", description: "User follows your bot" },
    { id: "unfollow", label: "Unfollow Events", description: "User unfollows your bot" },
    { id: "join", label: "Join Events", description: "Bot joins a group" },
    { id: "leave", label: "Leave Events", description: "Bot leaves a group" },
    { id: "postback", label: "Postback Events", description: "User clicks buttons" },
    { id: "beacon", label: "Beacon Events", description: "LINE Beacon interactions" }
  ];

  useEffect(() => {
    fetchLineConfig();
    generateWebhookUrl();
  }, [chatbotId]);

  const fetchLineConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/line`);

      if (response.ok) {
        const data = await response.json();
        setConfig(data.config || config);
        setStats(data.stats);

        if (data.config?.status === "active") {
          setCurrentStep(4); // Configuration complete
          generateQRCode();
        }
      } else if (response.status !== 404) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to fetch Line config:", error);
      toast({
        title: "Error",
        description: "Failed to load Line configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/api/v1/webhooks/line/${chatbotId}`;
    setConfig(prev => ({ ...prev, webhook_url: webhookUrl }));
  };

  const generateQRCode = async () => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/line/qr-code`);
      if (response.ok) {
        const data = await response.json();
        setQrCodeUrl(data.qr_code_url);
      }
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    }
  };

  const saveConfiguration = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/line`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setConfig(data.config);

      toast({
        title: "Success",
        description: "Line configuration saved successfully.",
      });

      if (data.config.status === "active") {
        setCurrentStep(4);
        generateQRCode();
      }
    } catch (error) {
      console.error("Failed to save Line config:", error);
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    try {
      setTesting(true);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/line/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: config.webhook_url }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Success",
          description: "Webhook test successful. Connection verified!",
        });
        setCurrentStep(3);
      } else {
        throw new Error(data.error || "Test failed");
      }
    } catch (error) {
      console.error("Webhook test failed:", error);
      toast({
        title: "Test Failed",
        description: "Webhook connection test failed. Please check your configuration.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard.`,
    });
  };

  const toggleEventSubscription = (eventId: string) => {
    setConfig(prev => ({
      ...prev,
      webhook_events: prev.webhook_events.includes(eventId)
        ? prev.webhook_events.filter(e => e !== eventId)
        : [...prev.webhook_events, eventId]
    }));
  };

  if (loading) {
    return (
      <div className="container max-w-4xl mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/chatbots">Chatbots</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/dashboard/chatbots/${chatbotId}`}>
              Chatbot
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/dashboard/chatbots/${chatbotId}/integrations`}>
              Integrations
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>LINE Official Account</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            LINE Official Account Setup
          </h1>
          <p className="text-muted-foreground">
            Connect your chatbot to LINE messaging platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config.status === "active" && (
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Active
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/integrations`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Integrations
          </Button>
        </div>
      </div>

      {/* Progress Indicator */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Setup Progress</h3>
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of 4
            </span>
          </div>
          <Progress value={(currentStep / 4) * 100} className="mb-4" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={currentStep >= 1 ? "text-primary font-medium" : ""}>
              Line Channel
            </span>
            <span className={currentStep >= 2 ? "text-primary font-medium" : ""}>
              Configure
            </span>
            <span className={currentStep >= 3 ? "text-primary font-medium" : ""}>
              Test
            </span>
            <span className={currentStep >= 4 ? "text-primary font-medium" : ""}>
              Go Live
            </span>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="setup" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Setup Tab */}
        <TabsContent value="setup" className="space-y-6">
          {/* Step 1: Line Channel Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Step 1: Line Channel Information
              </CardTitle>
              <CardDescription>
                Enter your Line Official Account channel details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You need to create a Line Official Account and get your channel credentials from the
                  <a
                    href="https://developers.line.biz/console/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-primary hover:underline"
                  >
                    Line Developers Console
                    <ExternalLink className="h-3 w-3 inline ml-1" />
                  </a>
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="channelId">Channel ID</Label>
                  <Input
                    id="channelId"
                    value={config.channel_id}
                    onChange={(e) => setConfig(prev => ({ ...prev, channel_id: e.target.value }))}
                    placeholder="1234567890"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="basicId">Basic ID (Optional)</Label>
                  <Input
                    id="basicId"
                    value={config.line_bot_basic_id || ""}
                    onChange={(e) => setConfig(prev => ({ ...prev, line_bot_basic_id: e.target.value }))}
                    placeholder="@abc1234"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="channelSecret">Channel Secret</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSecrets(!showSecrets)}
                    className="gap-2"
                  >
                    {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showSecrets ? "Hide" : "Show"}
                  </Button>
                </div>
                <Input
                  id="channelSecret"
                  type={showSecrets ? "text" : "password"}
                  value={config.channel_secret}
                  onChange={(e) => setConfig(prev => ({ ...prev, channel_secret: e.target.value }))}
                  placeholder="Enter your channel secret"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">Channel Access Token</Label>
                <div className="flex gap-2">
                  <Input
                    id="accessToken"
                    type={showSecrets ? "text" : "password"}
                    value={config.channel_access_token}
                    onChange={(e) => setConfig(prev => ({ ...prev, channel_access_token: e.target.value }))}
                    placeholder="Enter your channel access token"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(config.channel_access_token, "Access Token")}
                    disabled={!config.channel_access_token}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setCurrentStep(2)}
                  disabled={!config.channel_id || !config.channel_secret || !config.channel_access_token}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Continue to Configuration
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Webhook Configuration */}
          {currentStep >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  Step 2: Webhook Configuration
                </CardTitle>
                <CardDescription>
                  Configure webhook URL in your Line Developers Console
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={config.webhook_url}
                      readOnly
                      className="font-mono text-sm bg-muted"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(config.webhook_url, "Webhook URL")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copy this URL and paste it in your Line Developers Console webhook settings
                  </p>
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Important:</strong> Enable "Use webhook" in your Line Developers Console
                    and paste the webhook URL above. Also enable all the events you want to receive.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label>Greeting Message (Optional)</Label>
                  <Textarea
                    value={config.greeting_message || ""}
                    onChange={(e) => setConfig(prev => ({ ...prev, greeting_message: e.target.value }))}
                    placeholder="Hello! Welcome to our chatbot. How can I help you today?"
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={testWebhook}
                    disabled={testing || !config.webhook_url}
                    className="gap-2"
                  >
                    {testing ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                    Test Webhook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(3)}
                    disabled={currentStep < 3}
                  >
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Save Configuration */}
          {currentStep >= 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Save className="h-5 w-5" />
                  Step 3: Save & Activate
                </CardTitle>
                <CardDescription>
                  Save your configuration and activate the Line integration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Channel ID</p>
                    <p className="text-sm text-muted-foreground">{config.channel_id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Webhook URL</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {config.webhook_url.replace(/https?:\/\/[^/]+/, "...")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
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
                    Save & Activate
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Success & QR Code */}
          {currentStep >= 4 && config.status === "active" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Step 4: Integration Active!
                </CardTitle>
                <CardDescription>
                  Your Line integration is now active and ready to receive messages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Success!</strong> Your chatbot is now connected to Line.
                    Users can start chatting with your bot through Line.
                  </AlertDescription>
                </Alert>

                {qrCodeUrl && (
                  <div className="flex flex-col items-center space-y-4 p-6 bg-muted rounded-lg">
                    <QrCode className="h-8 w-8 text-muted-foreground" />
                    <div className="text-center">
                      <h4 className="font-medium mb-2">Line Bot QR Code</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Scan this QR code to add your bot as a friend on Line
                      </p>
                      <div className="w-48 h-48 bg-white rounded-lg mx-auto flex items-center justify-center">
                        <img
                          src={qrCodeUrl}
                          alt="Line Bot QR Code"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(qrCodeUrl, "QR Code URL")}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copy QR Code URL
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/playground`)}
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Test in Playground
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/integrations`)}
                    className="gap-2"
                  >
                    <LinkIcon className="h-4 w-4" />
                    View All Integrations
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Webhook Events Tab */}
        <TabsContent value="webhook" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Events Configuration</CardTitle>
              <CardDescription>
                Configure which Line events your chatbot should receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {webhookEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium">{event.label}</h4>
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                  </div>
                  <Switch
                    checked={config.webhook_events.includes(event.id)}
                    onCheckedChange={() => toggleEventSubscription(event.id)}
                  />
                </div>
              ))}

              <div className="flex items-center gap-2 pt-4">
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
                  Save Webhook Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Line Features</CardTitle>
              <CardDescription>
                Advanced Line-specific features and capabilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <MessageSquare className="h-5 w-5 text-green-600" />
                      <h4 className="font-medium">Rich Messages</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Send interactive rich messages with buttons, carousels, and quick replies
                    </p>
                    <Button variant="outline" size="sm" disabled>
                      Coming Soon
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Users className="h-5 w-5 text-blue-600" />
                      <h4 className="font-medium">Rich Menu</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Create custom rich menus for easier user interaction
                    </p>
                    <Button variant="outline" size="sm" disabled>
                      Coming Soon
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Smartphone className="h-5 w-5 text-purple-600" />
                      <h4 className="font-medium">Push Messages</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Send proactive messages to your Line friends
                    </p>
                    <Button variant="outline" size="sm" disabled>
                      Coming Soon
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <BarChart3 className="h-5 w-5 text-orange-600" />
                      <h4 className="font-medium">User Insights</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Get insights about your Line friends and their behavior
                    </p>
                    <Button variant="outline" size="sm" disabled>
                      Coming Soon
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Line Integration Analytics</CardTitle>
              <CardDescription>
                Monitor your Line chatbot performance and usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total Followers</p>
                    <p className="text-2xl font-bold">{stats.total_followers.toLocaleString()}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Messages Sent</p>
                    <p className="text-2xl font-bold">{stats.messages_sent.toLocaleString()}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Messages Received</p>
                    <p className="text-2xl font-bold">{stats.messages_received.toLocaleString()}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Active Sessions</p>
                    <p className="text-2xl font-bold">{stats.active_sessions}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Response Rate</p>
                    <p className="text-2xl font-bold">{stats.response_rate}%</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Avg Response Time</p>
                    <p className="text-2xl font-bold">{stats.average_response_time}ms</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Analytics Data</h3>
                  <p className="text-muted-foreground">
                    {config.status === "active"
                      ? "Analytics data will appear once users start interacting with your bot"
                      : "Activate your Line integration to start collecting analytics"
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}