"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Plus,
  ExternalLink,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  Eye,
  BarChart3,
  Smartphone,
  Globe,
  MessageSquare,
  Webhook,
  Code,
  QrCode,
  Link as LinkIcon,
  Monitor,
  Users,
  TrendingUp,
  Clock,
  Activity
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Integration {
  id: string;
  type: "line_oa" | "widget" | "api" | "webhook";
  name: string;
  status: "active" | "inactive" | "error" | "pending";
  description: string;
  last_activity: string;
  usage_stats: {
    messages: number;
    users: number;
    sessions: number;
  };
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface IntegrationStats {
  total_integrations: number;
  active_integrations: number;
  total_messages: number;
  total_users: number;
  popular_platform: string;
  growth_rate: number;
}

const integrationTypes = {
  line_oa: {
    name: "Line Official Account",
    description: "Connect your chatbot to Line messaging platform",
    icon: MessageSquare,
    color: "text-green-600",
    bgColor: "bg-green-50",
    features: ["Rich Messages", "Quick Replies", "Push Notifications", "User Management"]
  },
  widget: {
    name: "Web Widget",
    description: "Embed a chat widget on your website",
    icon: Monitor,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    features: ["Customizable Design", "Mobile Responsive", "Domain Restrictions", "Analytics"]
  },
  api: {
    name: "REST API",
    description: "Integrate via REST API endpoints",
    icon: Code,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    features: ["Full Control", "Custom UI", "Rate Limiting", "Authentication"]
  },
  webhook: {
    name: "Webhooks",
    description: "Receive real-time events via webhooks",
    icon: Webhook,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    features: ["Real-time Events", "Custom Endpoints", "Retry Logic", "Signing"]
  }
};

const statusIcons = {
  active: { icon: CheckCircle, color: "text-green-600" },
  inactive: { icon: XCircle, color: "text-gray-500" },
  error: { icon: AlertTriangle, color: "text-red-600" },
  pending: { icon: Clock, color: "text-yellow-600" }
};

export default function IntegrationsOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;

  const [chatbot, setChatbot] = useState<any>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [stats, setStats] = useState<IntegrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetchData();
  }, [chatbotId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch chatbot details
      const chatbotResponse = await fetch(`/api/v1/chatbots/${chatbotId}`);
      if (chatbotResponse.ok) {
        const chatbotData = await chatbotResponse.json();
        setChatbot(chatbotData);
      }

      // Fetch integrations
      const integrationsResponse = await fetch(`/api/v1/chatbots/${chatbotId}/integrations`);
      if (integrationsResponse.ok) {
        const integrationsData = await integrationsResponse.json();
        setIntegrations(integrationsData.integrations || []);
      }

      // Fetch integration stats
      const statsResponse = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/stats`);
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

    } catch (error) {
      console.error("Failed to fetch integration data:", error);
      toast({
        title: "Error",
        description: "Failed to load integration data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIntegration = (type: string) => {
    if (type === "line_oa") {
      router.push(`/dashboard/chatbots/${chatbotId}/integrations/line`);
    } else if (type === "widget") {
      router.push(`/dashboard/chatbots/${chatbotId}/integrations/widget`);
    } else {
      toast({
        title: "Coming Soon",
        description: `${integrationTypes[type as keyof typeof integrationTypes].name} integration will be available soon.`,
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard.`,
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const getIntegrationRoute = (integration: Integration) => {
    if (integration.type === "line_oa") {
      return `/dashboard/chatbots/${chatbotId}/integrations/line`;
    } else if (integration.type === "widget") {
      return `/dashboard/chatbots/${chatbotId}/integrations/widget`;
    }
    return "#";
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
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
              <LinkIcon className="h-6 w-6" />
              Integrations
            </h1>
            <p className="text-muted-foreground">
              Connect your chatbot to multiple platforms and services
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/chatbots/${chatbotId}/playground`)}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Test Chatbot
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Integrations</p>
                  <p className="text-2xl font-bold">{stats.total_integrations}</p>
                </div>
                <LinkIcon className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Integrations</p>
                  <p className="text-2xl font-bold">{stats.active_integrations}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Messages</p>
                  <p className="text-2xl font-bold">{formatNumber(stats.total_messages)}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold">{formatNumber(stats.total_users)}</p>
                </div>
                <Users className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="active">Active Integrations</TabsTrigger>
          <TabsTrigger value="setup">Setup New</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Current Integrations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Current Integrations
              </CardTitle>
              <CardDescription>
                Active integrations for your chatbot
              </CardDescription>
            </CardHeader>
            <CardContent>
              {integrations.length === 0 ? (
                <div className="text-center py-12">
                  <LinkIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Integrations Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Get started by setting up your first integration
                  </p>
                  <Button onClick={() => setActiveTab("setup")} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Setup Integration
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {integrations.map((integration) => {
                    const integrationConfig = integrationTypes[integration.type];
                    const StatusIcon = statusIcons[integration.status].icon;

                    return (
                      <div
                        key={integration.id}
                        className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4 flex-1">
                            <div className={`p-3 rounded-lg ${integrationConfig.bgColor}`}>
                              <integrationConfig.icon className={`h-6 w-6 ${integrationConfig.color}`} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold">{integration.name}</h3>
                                <Badge
                                  variant={integration.status === "active" ? "default" : "secondary"}
                                  className="gap-1"
                                >
                                  <StatusIcon className={`h-3 w-3 ${statusIcons[integration.status].color}`} />
                                  {integration.status.charAt(0).toUpperCase() + integration.status.slice(1)}
                                </Badge>
                              </div>

                              <p className="text-sm text-muted-foreground mb-2">
                                {integration.description}
                              </p>

                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />
                                  {formatNumber(integration.usage_stats.messages)} messages
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {formatNumber(integration.usage_stats.users)} users
                                </span>
                                <span className="flex items-center gap-1">
                                  <Activity className="h-3 w-3" />
                                  Last active: {new Date(integration.last_activity).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(getIntegrationRoute(integration))}
                              className="gap-2"
                            >
                              <Settings className="h-4 w-4" />
                              Manage
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Integration Insights */}
          {stats && stats.total_integrations > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Integration Insights
                </CardTitle>
                <CardDescription>
                  Performance and usage analytics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Most Popular Platform</span>
                      <Badge variant="outline">{stats.popular_platform}</Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Growth Rate</span>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-600">
                          +{stats.growth_rate}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Integration Health</span>
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Healthy
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Average Response Time</span>
                      <span className="text-sm font-medium">~250ms</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Active Integrations Tab */}
        <TabsContent value="active" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Integrations Management</CardTitle>
              <CardDescription>
                Manage and monitor your active integrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {integrations.filter(i => i.status === "active").length === 0 ? (
                <div className="text-center py-8">
                  <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Active Integrations</h3>
                  <p className="text-muted-foreground">
                    Set up your first integration to start connecting with users
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {integrations
                    .filter(integration => integration.status === "active")
                    .map((integration) => {
                      const integrationConfig = integrationTypes[integration.type];

                      return (
                        <Card key={integration.id}>
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded ${integrationConfig.bgColor}`}>
                                  <integrationConfig.icon className={`h-5 w-5 ${integrationConfig.color}`} />
                                </div>
                                <div>
                                  <h3 className="font-semibold">{integration.name}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {integrationConfig.name}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Active
                              </Badge>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <div className="text-center">
                                <p className="text-2xl font-bold text-blue-600">
                                  {formatNumber(integration.usage_stats.messages)}
                                </p>
                                <p className="text-xs text-muted-foreground">Messages</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-bold text-green-600">
                                  {formatNumber(integration.usage_stats.users)}
                                </p>
                                <p className="text-xs text-muted-foreground">Users</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-bold text-purple-600">
                                  {formatNumber(integration.usage_stats.sessions)}
                                </p>
                                <p className="text-xs text-muted-foreground">Sessions</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(getIntegrationRoute(integration))}
                                className="gap-2"
                              >
                                <Settings className="h-4 w-4" />
                                Configure
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                              >
                                <BarChart3 className="h-4 w-4" />
                                Analytics
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Test
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Setup New Tab */}
        <TabsContent value="setup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Choose Integration Type</CardTitle>
              <CardDescription>
                Select the platform or service you want to integrate with
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(integrationTypes).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <Card
                      key={type}
                      className="cursor-pointer hover:shadow-md transition-all border-2 hover:border-primary/20"
                      onClick={() => handleCreateIntegration(type)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${config.bgColor}`}>
                            <Icon className={`h-8 w-8 ${config.color}`} />
                          </div>

                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-2">{config.name}</h3>
                            <p className="text-muted-foreground text-sm mb-4">
                              {config.description}
                            </p>

                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">Features:</p>
                              <div className="flex flex-wrap gap-1">
                                {config.features.map((feature, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {feature}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>

                          <Button variant="outline" size="sm" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Setup
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quick Setup Guide */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Setup Guide</CardTitle>
              <CardDescription>
                Follow these steps to get your first integration running
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium">Choose Platform</h4>
                    <p className="text-sm text-muted-foreground">
                      Select the platform you want to connect your chatbot to
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium">Configure Settings</h4>
                    <p className="text-sm text-muted-foreground">
                      Follow the setup wizard to configure your integration
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium">Test Connection</h4>
                    <p className="text-sm text-muted-foreground">
                      Verify that your integration is working correctly
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    4
                  </div>
                  <div>
                    <h4 className="font-medium">Go Live</h4>
                    <p className="text-sm text-muted-foreground">
                      Activate your integration and start engaging with users
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}