"use client";

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Activity,
  Zap,
  Clock
} from 'lucide-react';
import { WebSocketConnectionState } from '@/lib/websocket/message-types';
import { useConnectionStatus } from '@/hooks/use-websocket';

interface ConnectionStatusProps {
  showDetails?: boolean;
  showReconnectButton?: boolean;
  compact?: boolean;
  showQualityIndicator?: boolean;
  showAutoReconnect?: boolean;
  onReconnect?: () => void;
}

export function ConnectionStatus({
  showDetails = false,
  showReconnectButton = true,
  compact = false,
  showQualityIndicator = true,
  showAutoReconnect = true,
  onReconnect
}: ConnectionStatusProps) {
  const { connectionState, connectionId, latency, lastActivity, isHealthy } = useConnectionStatus();
  const [timeSinceActivity, setTimeSinceActivity] = useState(0);
  const [autoReconnectAttempts, setAutoReconnectAttempts] = useState(0);
  const [reconnectTimer, setReconnectTimer] = useState<number | null>(null);

  // Update time since last activity
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSinceActivity(Date.now() - lastActivity);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastActivity]);

  // Auto-reconnect logic
  useEffect(() => {
    if (!showAutoReconnect || !onReconnect) return;

    // Reset attempts on successful connection
    if (connectionState === WebSocketConnectionState.CONNECTED) {
      setAutoReconnectAttempts(0);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        setReconnectTimer(null);
      }
      return;
    }

    // Auto-reconnect on connection loss
    if (connectionState === WebSocketConnectionState.DISCONNECTED ||
        connectionState === WebSocketConnectionState.ERROR) {

      const maxAttempts = 5;
      const baseDelay = 2000; // 2 seconds base delay

      if (autoReconnectAttempts < maxAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, autoReconnectAttempts), 30000); // Max 30s

        const timer = setTimeout(() => {
          setAutoReconnectAttempts(prev => prev + 1);
          onReconnect();
        }, delay);

        setReconnectTimer(timer);
      }
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        setReconnectTimer(null);
      }
    };
  }, [connectionState, autoReconnectAttempts, showAutoReconnect, onReconnect, reconnectTimer]);

  const getStatusInfo = () => {
    switch (connectionState) {
      case WebSocketConnectionState.CONNECTED:
        return {
          icon: isHealthy ? CheckCircle : AlertTriangle,
          label: isHealthy ? 'Connected' : 'Connected (High Latency)',
          color: isHealthy ? 'bg-green-500' : 'bg-yellow-500',
          variant: isHealthy ? 'default' : 'secondary' as const,
          textColor: isHealthy ? 'text-green-600' : 'text-yellow-600'
        };

      case WebSocketConnectionState.CONNECTING:
        return {
          icon: Loader2,
          label: 'Connecting...',
          color: 'bg-blue-500',
          variant: 'secondary' as const,
          textColor: 'text-blue-600',
          animate: true
        };

      case WebSocketConnectionState.DISCONNECTING:
        return {
          icon: Loader2,
          label: 'Disconnecting...',
          color: 'bg-orange-500',
          variant: 'secondary' as const,
          textColor: 'text-orange-600',
          animate: true
        };

      case WebSocketConnectionState.ERROR:
        return {
          icon: AlertTriangle,
          label: 'Connection Error',
          color: 'bg-red-500',
          variant: 'destructive' as const,
          textColor: 'text-red-600'
        };

      default:
        return {
          icon: WifiOff,
          label: 'Disconnected',
          color: 'bg-gray-500',
          variant: 'secondary' as const,
          textColor: 'text-gray-600'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const formatLatency = (ms: number) => {
    if (ms < 100) return 'Excellent';
    if (ms < 300) return 'Good';
    if (ms < 1000) return 'Fair';
    return 'Poor';
  };

  const formatTimeSince = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getConnectionQuality = () => {
    if (connectionState !== WebSocketConnectionState.CONNECTED) {
      return { score: 0, label: 'No Connection', color: 'bg-gray-500' };
    }

    let score = 100;

    // Latency impact (0-50 points)
    if (latency > 1000) score -= 50;
    else if (latency > 500) score -= 30;
    else if (latency > 200) score -= 15;
    else if (latency > 100) score -= 5;

    // Activity impact (0-25 points)
    const inactiveSeconds = timeSinceActivity / 1000;
    if (inactiveSeconds > 300) score -= 25; // 5+ minutes
    else if (inactiveSeconds > 120) score -= 15; // 2+ minutes
    else if (inactiveSeconds > 60) score -= 5; // 1+ minute

    // Health impact (0-25 points)
    if (!isHealthy) score -= 25;

    score = Math.max(0, Math.min(100, score));

    if (score >= 80) return { score, label: 'Excellent', color: 'bg-green-500' };
    if (score >= 60) return { score, label: 'Good', color: 'bg-blue-500' };
    if (score >= 40) return { score, label: 'Fair', color: 'bg-yellow-500' };
    if (score >= 20) return { score, label: 'Poor', color: 'bg-orange-500' };
    return { score, label: 'Critical', color: 'bg-red-500' };
  };

  const connectionQuality = getConnectionQuality();

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusInfo.color}`} />
              <StatusIcon
                className={`w-4 h-4 ${statusInfo.textColor} ${statusInfo.animate ? 'animate-spin' : ''}`}
              />
              {showQualityIndicator && connectionState === WebSocketConnectionState.CONNECTED && (
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${connectionQuality.color}`} />
                  <span className="text-xs text-muted-foreground">{connectionQuality.score}%</span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <div className="font-medium">{statusInfo.label}</div>
              {connectionId && (
                <div className="text-xs text-muted-foreground">ID: {connectionId.slice(-8)}</div>
              )}
              {connectionState === WebSocketConnectionState.CONNECTED && (
                <>
                  <div className="text-xs text-muted-foreground">
                    Latency: {latency}ms ({formatLatency(latency)})
                  </div>
                  {showQualityIndicator && (
                    <div className="text-xs text-muted-foreground">
                      Quality: {connectionQuality.label} ({connectionQuality.score}%)
                    </div>
                  )}
                </>
              )}
              {autoReconnectAttempts > 0 && (
                <div className="text-xs text-muted-foreground">
                  Reconnect attempts: {autoReconnectAttempts}/5
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!showDetails) {
    return (
      <Badge variant={statusInfo.variant} className="flex items-center gap-2">
        <StatusIcon
          className={`w-3 h-3 ${statusInfo.animate ? 'animate-spin' : ''}`}
        />
        {statusInfo.label}
      </Badge>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <StatusIcon
              className={`w-4 h-4 ${statusInfo.textColor} ${statusInfo.animate ? 'animate-spin' : ''}`}
            />
            Connection Status
          </CardTitle>
          {showReconnectButton && connectionState !== WebSocketConnectionState.CONNECTED && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReconnect}
              disabled={connectionState === WebSocketConnectionState.CONNECTING}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reconnect
            </Button>
          )}
        </div>
        <CardDescription>
          <Badge variant={statusInfo.variant} className="flex items-center gap-1 w-fit">
            <div className={`w-2 h-2 rounded-full ${statusInfo.color}`} />
            {statusInfo.label}
          </Badge>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {connectionId && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Connection ID:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {connectionId.slice(-12)}
            </code>
          </div>
        )}

        {connectionState === WebSocketConnectionState.CONNECTED && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Latency:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{latency}ms</span>
                  <Badge variant="outline" className="text-xs">
                    {formatLatency(latency)}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <Progress
                  value={Math.max(0, 100 - (latency / 10))}
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0ms</span>
                  <span>1000ms</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last Activity:</span>
              </div>
              <span className="font-mono text-xs">
                {formatTimeSince(timeSinceActivity)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Health:</span>
              </div>
              <Badge variant={isHealthy ? 'default' : 'secondary'}>
                {isHealthy ? 'Healthy' : 'Degraded'}
              </Badge>
            </div>

            {showQualityIndicator && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Quality:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{connectionQuality.score}%</span>
                    <Badge variant="outline" className="text-xs">
                      {connectionQuality.label}
                    </Badge>
                  </div>
                </div>
                <Progress value={connectionQuality.score} className="h-2" />
              </div>
            )}
          </>
        )}

        {connectionState === WebSocketConnectionState.ERROR && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <span>Failed to establish connection</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Check your internet connection and try again.
            </p>
            {showAutoReconnect && autoReconnectAttempts > 0 && autoReconnectAttempts < 5 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Auto-reconnecting... (Attempt {autoReconnectAttempts}/5)</span>
              </div>
            )}
            {autoReconnectAttempts >= 5 && (
              <div className="mt-2 text-xs text-destructive">
                Auto-reconnect failed after 5 attempts. Please reconnect manually.
              </div>
            )}
          </div>
        )}

        {connectionState === WebSocketConnectionState.DISCONNECTED && (
          <div className="p-3 bg-muted/50 border border-muted rounded-md">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <WifiOff className="w-4 h-4" />
              <span>No active connection</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Real-time features are unavailable.
            </p>
            {showAutoReconnect && autoReconnectAttempts > 0 && autoReconnectAttempts < 5 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Auto-reconnecting... (Attempt {autoReconnectAttempts}/5)</span>
              </div>
            )}
            {autoReconnectAttempts >= 5 && (
              <div className="mt-2 text-xs text-destructive">
                Auto-reconnect failed after 5 attempts. Please reconnect manually.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}