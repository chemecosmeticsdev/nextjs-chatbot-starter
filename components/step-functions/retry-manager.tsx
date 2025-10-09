'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RotateCcw,
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  Settings,
  Activity,
  TrendingUp,
  History,
  Zap,
  Shield
} from 'lucide-react';

interface RetryAttempt {
  attemptNumber: number;
  executionId: string;
  originalExecutionId: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  startedAt: string;
  endedAt?: string;
  retryType: string;
  failureReason?: string;
  duration?: number;
}

interface RetryHistory {
  originalExecutionId: string;
  fileName: string;
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  lastAttemptAt: string;
  currentStatus: string;
  attempts: RetryAttempt[];
}

interface RetryManagerProps {
  executionId: string;
  onRetryRequested?: (retryOptions: any) => Promise<void>;
  className?: string;
}

interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
  retryableErrors: string[];
  autoRetryEnabled: boolean;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelay: 30,
  maxDelay: 300,
  retryableErrors: ['TIMEOUT_ERROR', 'DATABASE_ERROR', 'NETWORK_ERROR'],
  autoRetryEnabled: false
};

export function RetryManager({
  executionId,
  onRetryRequested,
  className = ''
}: RetryManagerProps) {
  const [retryHistory, setRetryHistory] = useState<RetryHistory | null>(null);
  const [retryPolicy, setRetryPolicy] = useState<RetryPolicy>(DEFAULT_RETRY_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRetryActive, setAutoRetryActive] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Fetch retry history
  const fetchRetryHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/step-functions/retry?executionId=${executionId}`);
      if (response.ok) {
        const data = await response.json();
        setRetryHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch retry history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    fetchRetryHistory();
    const interval = setInterval(fetchRetryHistory, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchRetryHistory]);

  // Auto-retry countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0 && autoRetryActive) {
      setAutoRetryActive(false);
      handleAutoRetry();
    }
    return () => clearTimeout(timer);
  }, [countdown, autoRetryActive]);

  const calculateNextRetryDelay = (attemptNumber: number) => {
    const delay = Math.min(
      retryPolicy.initialDelay * Math.pow(retryPolicy.backoffMultiplier, attemptNumber - 1),
      retryPolicy.maxDelay
    );
    return delay;
  };

  const handleAutoRetry = useCallback(async () => {
    if (!retryHistory || !onRetryRequested) return;

    const nextAttempt = retryHistory.totalAttempts + 1;
    if (nextAttempt > retryPolicy.maxRetries) return;

    try {
      await onRetryRequested({
        retryType: 'from_failure',
        autoRetry: true,
        attemptNumber: nextAttempt
      });
    } catch (error) {
      console.error('Auto retry failed:', error);
    }
  }, [retryHistory, retryPolicy, onRetryRequested]);

  const handleManualRetry = useCallback(async (retryType: string) => {
    if (!onRetryRequested) return;

    try {
      await onRetryRequested({
        retryType,
        autoRetry: false,
        attemptNumber: (retryHistory?.totalAttempts || 0) + 1
      });
      // Refresh history after retry
      setTimeout(() => fetchRetryHistory(), 2000);
    } catch (error) {
      console.error('Manual retry failed:', error);
    }
  }, [onRetryRequested, retryHistory, fetchRetryHistory]);

  const scheduleAutoRetry = useCallback(() => {
    if (!retryHistory || retryHistory.totalAttempts >= retryPolicy.maxRetries) return;

    const nextAttempt = retryHistory.totalAttempts + 1;
    const delay = calculateNextRetryDelay(nextAttempt);

    setCountdown(delay);
    setAutoRetryActive(true);
  }, [retryHistory, retryPolicy]);

  const cancelAutoRetry = useCallback(() => {
    setAutoRetryActive(false);
    setCountdown(0);
  }, []);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCEEDED': return 'text-green-600';
      case 'FAILED': return 'text-red-600';
      case 'RUNNING': return 'text-blue-600';
      case 'CANCELLED': return 'text-gray-600';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCEEDED': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'FAILED': return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'RUNNING': return <Play className="h-4 w-4 text-blue-600" />;
      case 'CANCELLED': return <Pause className="h-4 w-4 text-gray-600" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <div className="animate-pulse">Loading retry information...</div>
        </CardContent>
      </Card>
    );
  }

  if (!retryHistory) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Retry Management
          </CardTitle>
          <CardDescription>No retry history available for this execution</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canRetry = retryHistory.totalAttempts < retryPolicy.maxRetries &&
                  retryHistory.currentStatus === 'FAILED';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Retry Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Retry Summary
          </CardTitle>
          <CardDescription>
            {retryHistory.fileName} • {retryHistory.totalAttempts} attempt{retryHistory.totalAttempts !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{retryHistory.totalAttempts}</div>
              <div className="text-sm text-gray-600">Total Attempts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{retryHistory.successfulRetries}</div>
              <div className="text-sm text-gray-600">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{retryHistory.failedRetries}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {Math.max(0, retryPolicy.maxRetries - retryHistory.totalAttempts)}
              </div>
              <div className="text-sm text-gray-600">Remaining</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Retry Progress</span>
              <span>{retryHistory.totalAttempts} / {retryPolicy.maxRetries}</span>
            </div>
            <Progress
              value={(retryHistory.totalAttempts / retryPolicy.maxRetries) * 100}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto Retry Status */}
      {autoRetryActive && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600 animate-pulse" />
                <span className="font-medium">Auto-retry scheduled</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-blue-600">
                  Retrying in {formatDuration(countdown * 1000)}
                </span>
                <Button size="sm" variant="outline" onClick={cancelAutoRetry}>
                  Cancel
                </Button>
              </div>
            </div>
            <Progress value={((retryPolicy.initialDelay - countdown) / retryPolicy.initialDelay) * 100} className="mt-2 h-1" />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="attempts" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attempts">Retry Attempts</TabsTrigger>
          <TabsTrigger value="policy">Retry Policy</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="attempts" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-5 w-5" />
                Attempt History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {retryHistory.attempts.map((attempt) => (
                  <div key={attempt.executionId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(attempt.status)}
                      <div>
                        <div className="font-medium">
                          Attempt #{attempt.attemptNumber}
                        </div>
                        <div className="text-sm text-gray-600">
                          {new Date(attempt.startedAt).toLocaleString()}
                        </div>
                        {attempt.duration && (
                          <div className="text-xs text-gray-500">
                            Duration: {formatDuration(attempt.duration)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={
                        attempt.status === 'SUCCEEDED' ? 'default' :
                        attempt.status === 'FAILED' ? 'destructive' :
                        attempt.status === 'RUNNING' ? 'secondary' : 'outline'
                      }>
                        {attempt.status}
                      </Badge>
                      {attempt.failureReason && (
                        <div className="text-xs text-red-600 mt-1">
                          {attempt.failureReason}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Retry Policy Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max Retries</Label>
                  <Select
                    value={retryPolicy.maxRetries.toString()}
                    onValueChange={(value) => setRetryPolicy(prev => ({ ...prev, maxRetries: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 retry</SelectItem>
                      <SelectItem value="3">3 retries</SelectItem>
                      <SelectItem value="5">5 retries</SelectItem>
                      <SelectItem value="10">10 retries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Initial Delay (seconds)</Label>
                  <Select
                    value={retryPolicy.initialDelay.toString()}
                    onValueChange={(value) => setRetryPolicy(prev => ({ ...prev, initialDelay: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 seconds</SelectItem>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">1 minute</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-retry enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically retry failed executions based on policy
                  </p>
                </div>
                <Switch
                  checked={retryPolicy.autoRetryEnabled}
                  onCheckedChange={(checked) => setRetryPolicy(prev => ({ ...prev, autoRetryEnabled: checked }))}
                />
              </div>

              <Alert>
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  <strong>Next retry delay:</strong> {formatDuration(calculateNextRetryDelay(retryHistory.totalAttempts + 1) * 1000)}
                  <br />
                  <strong>Backoff strategy:</strong> Exponential (x{retryPolicy.backoffMultiplier})
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Retry Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canRetry ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                      onClick={() => handleManualRetry('full')}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Full Restart
                    </Button>
                    <Button
                      onClick={() => handleManualRetry('from_failure')}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Resume from Failure
                    </Button>
                  </div>

                  {retryPolicy.autoRetryEnabled && !autoRetryActive && (
                    <Button
                      onClick={scheduleAutoRetry}
                      variant="outline"
                      className="w-full flex items-center gap-2"
                    >
                      <Clock className="h-4 w-4" />
                      Schedule Auto-retry ({formatDuration(calculateNextRetryDelay(retryHistory.totalAttempts + 1) * 1000)})
                    </Button>
                  )}
                </>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {retryHistory.currentStatus === 'SUCCEEDED'
                      ? 'Execution completed successfully - no retry needed'
                      : `Maximum retry limit reached (${retryPolicy.maxRetries} attempts)`
                    }
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2">Recovery Tips</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• Check error logs for root cause before retrying</p>
                  <p>• Consider reducing file size or complexity</p>
                  <p>• Verify all required services are operational</p>
                  <p>• Try retrying during off-peak hours</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}