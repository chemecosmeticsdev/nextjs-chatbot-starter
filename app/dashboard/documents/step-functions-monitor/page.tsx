'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  TrendingDown,
  Workflow,
  Database,
  Brain,
  Zap,
  FileCheck,
  Play,
  Pause,
  StopCircle,
  RotateCcw,
  Eye,
  Download,
  Filter,
  Calendar,
  Timer,
  AlertTriangle,
  CheckSquare,
  XCircle,
  Minus
} from 'lucide-react';
import { StepFunctionsRealtimeProvider, ConnectionStatus } from '@/lib/providers/step-functions-realtime-provider';
import { useStepFunctionsRealtime } from '@/lib/hooks/use-step-functions-realtime';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface StepFunctionsExecution {
  id: string;
  executionArn: string;
  executionName: string;
  stateMachineArn: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  startDate: string;
  stopDate?: string;
  duration?: number;
  inputData: {
    fileName: string;
    fileKey: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
    documentType: string;
    documentCategory: string;
  };
  outputData?: any;
  errorData?: any;
  currentStep?: string;
  progress: number;
  steps: Array<{
    name: string;
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
    startTime?: string;
    endTime?: string;
    duration?: number;
    errorMessage?: string;
    output?: any;
  }>;
}

interface ProcessingMetrics {
  totalExecutions: number;
  runningExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageProcessingTime: number;
  averageStepTimes: {
    [stepName: string]: number;
  };
  successRate: number;
  throughputPerHour: number;
  errorsByStep: {
    [stepName: string]: number;
  };
  recentPerformance: Array<{
    timestamp: string;
    executionsCompleted: number;
    averageTime: number;
    errorRate: number;
  }>;
}

interface StepFunctionsAlert {
  id: string;
  type: 'execution_failed' | 'step_timeout' | 'high_error_rate' | 'performance_degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  executionId?: string;
  stepName?: string;
  timestamp: string;
  isRead: boolean;
  acknowledged: boolean;
}

function StepFunctionsProcessingDashboard() {
  const { toast } = useToast();

  // State
  const [executions, setExecutions] = useState<StepFunctionsExecution[]>([]);
  const [metrics, setMetrics] = useState<ProcessingMetrics | null>(null);
  const [alerts, setAlerts] = useState<StepFunctionsAlert[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);

  // Real-time Step Functions updates
  const realtimeState = useStepFunctionsRealtime({
    onUpdate: (update) => {
      console.log('Step Functions monitor update:', update);

      if (update.type === 'execution_update') {
        setExecutions(prev => {
          const existing = prev.find(e => e.id === update.data.execution.id);
          if (existing) {
            return prev.map(e => e.id === update.data.execution.id ? {
              ...e,
              ...update.data.execution,
              progress: update.data.progress?.percentage || e.progress,
              currentStep: update.data.progress?.current_step,
              steps: update.data.steps || e.steps
            } : e);
          } else {
            return [update.data.execution, ...prev];
          }
        });
      }
    }
  });

  // Load Step Functions data
  const loadStepFunctionsData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load executions
      const executionsResponse = await fetch(`/api/step-functions/executions?limit=50&timeRange=${timeFilter}`);
      if (executionsResponse.ok) {
        const executionsData = await executionsResponse.json();
        setExecutions(executionsData.executions || []);
      }

      // Load metrics
      const metricsResponse = await fetch(`/api/step-functions/metrics?timeRange=${timeFilter}`);
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setMetrics(metricsData.metrics);
      }

      // Load alerts
      const alertsResponse = await fetch(`/api/step-functions/alerts?limit=20`);
      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        setAlerts(alertsData.alerts || []);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load Step Functions data:', error);
      toast({
        title: "Error",
        description: "Failed to load Step Functions data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [timeFilter, toast]);

  // Auto-refresh data
  useEffect(() => {
    loadStepFunctionsData();

    if (autoRefresh) {
      const interval = setInterval(loadStepFunctionsData, 10000); // 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, loadStepFunctionsData]);

  // Filter executions
  const filteredExecutions = executions.filter(execution => {
    const matchesSearch = execution.executionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         execution.inputData.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         execution.inputData.uploadedBy.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || execution.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Utility functions
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'RUNNING':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'TIMED_OUT':
        return <Clock className="h-4 w-4 text-orange-600" />;
      case 'ABORTED':
        return <StopCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStepIcon = (stepName: string) => {
    switch (stepName) {
      case 'ValidateFile':
        return <FileCheck className="h-4 w-4" />;
      case 'ProcessOCR':
        return <Brain className="h-4 w-4" />;
      case 'EnhanceMetadata':
        return <Zap className="h-4 w-4" />;
      case 'ChunkDocument':
        return <FileText className="h-4 w-4" />;
      case 'GenerateEmbeddings':
        return <Database className="h-4 w-4" />;
      case 'InsertDatabase':
        return <CheckSquare className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return 'text-green-600';
      case 'FAILED':
        return 'text-red-600';
      case 'RUNNING':
        return 'text-blue-600';
      case 'TIMED_OUT':
        return 'text-orange-600';
      case 'ABORTED':
        return 'text-gray-600';
      default:
        return 'text-gray-500';
    }
  };

  const retryExecution = async (executionId: string) => {
    try {
      const response = await fetch('/api/step-functions/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId })
      });

      if (response.ok) {
        toast({
          title: "Execution Retried",
          description: "Step Functions execution has been retried"
        });
        loadStepFunctionsData();
      } else {
        throw new Error('Failed to retry execution');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to retry execution",
        variant: "destructive"
      });
    }
  };

  const stopExecution = async (executionId: string) => {
    try {
      const response = await fetch('/api/step-functions/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId })
      });

      if (response.ok) {
        toast({
          title: "Execution Stopped",
          description: "Step Functions execution has been stopped"
        });
        loadStepFunctionsData();
      } else {
        throw new Error('Failed to stop execution');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to stop execution",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Workflow className="h-8 w-8 text-blue-600" />
            Step Functions Monitor
          </h1>
          <p className="text-muted-foreground">
            Real-time monitoring and analytics for document processing workflows
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionStatus />
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm">
              Auto Refresh
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStepFunctionsData}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard/documents">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Documents
            </a>
          </Button>
        </div>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalExecutions}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.runningExecutions} currently running
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics.successRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {metrics.successfulExecutions} / {metrics.totalExecutions} successful
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDuration(metrics.averageProcessingTime)}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.throughputPerHour.toFixed(1)} docs/hour
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Executions</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{metrics.failedExecutions}</div>
              <p className="text-xs text-muted-foreground">
                {alerts.filter(a => !a.isRead).length} unread alerts
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="executions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="executions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Step Functions Executions</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search executions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <select
                    className="px-3 py-2 border rounded-md text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Status</option>
                    <option value="running">Running</option>
                    <option value="succeeded">Succeeded</option>
                    <option value="failed">Failed</option>
                    <option value="timed_out">Timed Out</option>
                    <option value="aborted">Aborted</option>
                  </select>
                  <select
                    className="px-3 py-2 border rounded-md text-sm"
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                  >
                    <option value="1h">Last Hour</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {filteredExecutions.map((execution) => (
                    <Card
                      key={execution.id}
                      className={cn(
                        "p-4 cursor-pointer transition-colors",
                        selectedExecution === execution.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedExecution(execution.id)}
                    >
                      <div className="space-y-4">
                        {/* Execution Header */}
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(execution.status)}
                              <span className="font-medium">{execution.inputData.fileName}</span>
                              <Badge
                                variant={execution.status === 'SUCCEEDED' ? 'default' :
                                        execution.status === 'FAILED' ? 'destructive' :
                                        execution.status === 'RUNNING' ? 'secondary' : 'outline'}
                              >
                                {execution.status}
                              </Badge>
                              <Badge variant="outline">{execution.inputData.documentType}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Execution: {execution.executionName}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Size: {(execution.inputData.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                              <span>Type: {execution.inputData.mimeType}</span>
                              <span>Uploaded by: {execution.inputData.uploadedBy}</span>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-muted-foreground">Started</div>
                            <div>{formatTimestamp(execution.startDate)}</div>
                            {execution.duration && (
                              <div className="text-muted-foreground">
                                Duration: {formatDuration(execution.duration)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        {execution.status === 'RUNNING' && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress</span>
                              <span>{execution.progress}%</span>
                            </div>
                            <Progress value={execution.progress} className="h-2" />
                            {execution.currentStep && (
                              <p className="text-sm text-muted-foreground">
                                Current: {execution.currentStep}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Steps */}
                        {execution.steps && execution.steps.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                            {execution.steps.map((step, index) => (
                              <div
                                key={step.name}
                                className={cn(
                                  "p-2 rounded border text-sm",
                                  step.status === 'SUCCEEDED' ? 'bg-green-50 border-green-200 text-green-800' :
                                  step.status === 'RUNNING' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                  step.status === 'FAILED' ? 'bg-red-50 border-red-200 text-red-800' :
                                  'bg-gray-50 border-gray-200 text-gray-600'
                                )}
                              >
                                <div className="flex items-center gap-1 mb-1">
                                  {getStepIcon(step.name)}
                                  <span className="font-medium text-xs">{step.name}</span>
                                </div>
                                <p className="text-xs">{step.status}</p>
                                {step.duration && (
                                  <p className="text-xs text-muted-foreground">
                                    {formatDuration(step.duration)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Error Message */}
                        {execution.status === 'FAILED' && execution.errorData && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              {execution.errorData.Error || execution.errorData.Cause || 'Execution failed'}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2 border-t">
                          {execution.status === 'RUNNING' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                stopExecution(execution.id);
                              }}
                            >
                              <StopCircle className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          )}
                          {execution.status === 'FAILED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                retryExecution(execution.id);
                              }}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Open execution details in AWS console
                              window.open(`https://console.aws.amazon.com/states/home?region=ap-southeast-1#/executions/details/${execution.executionArn}`, '_blank');
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Average Step Processing Times</CardTitle>
                  <CardDescription>Time spent in each processing step</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(metrics.averageStepTimes).map(([step, time]) => (
                      <div key={step} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStepIcon(step)}
                          <span className="text-sm">{step}</span>
                        </div>
                        <span className="font-medium">{formatDuration(time)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Error Distribution by Step</CardTitle>
                  <CardDescription>Number of failures in each step</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(metrics.errorsByStep).map(([step, count]) => (
                      <div key={step} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStepIcon(step)}
                          <span className="text-sm">{step}</span>
                        </div>
                        <span className={cn("font-medium", count > 0 ? "text-red-600" : "text-green-600")}>
                          {count} errors
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Step Functions Alerts</CardTitle>
              <CardDescription>Recent alerts and notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <Alert key={alert.id} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
                      <AlertCircle className="h-4 w-4" />
                      <div className="flex items-start justify-between w-full">
                        <div className="space-y-1">
                          <div className="font-medium">{alert.title}</div>
                          <AlertDescription>{alert.message}</AlertDescription>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                              {alert.severity}
                            </Badge>
                            <span>{alert.type}</span>
                            <span>{formatTimestamp(alert.timestamp)}</span>
                          </div>
                        </div>
                        {!alert.acknowledged && (
                          <Button size="sm" variant="outline">
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </Alert>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Processing Trends</CardTitle>
                <CardDescription>Performance over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-2" />
                  <p>Analytics charts will be implemented with a charting library</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Document Type Distribution</CardTitle>
                <CardDescription>Processing volume by document type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2" />
                  <p>Document analytics will be displayed here</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground text-center">
        Last updated: {formatTimestamp(lastUpdated.toISOString())}
      </div>
    </div>
  );
}

export default function StepFunctionsMonitorPage() {
  // Initialize breadcrumbs
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false,
    customTitles: {
      '/dashboard/documents/step-functions-monitor': 'Step Functions Monitor'
    }
  });

  return (
    <StepFunctionsRealtimeProvider>
      <StepFunctionsProcessingDashboard />
    </StepFunctionsRealtimeProvider>
  );
}