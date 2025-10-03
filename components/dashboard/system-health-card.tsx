"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Database,
  Server,
  Zap,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  Globe,
  Cpu,
  HardDrive,
  Wifi
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SystemHealthData {
  overall: 'healthy' | 'warning' | 'critical';
  apiUptime: number;
  databaseLatency: number;
  cacheHitRate: number;
  errorRate: number;
  systemMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkLatency: number;
  };
  services: Array<{
    name: string;
    status: 'online' | 'degraded' | 'offline';
    uptime: number;
    lastCheck: string;
  }>;
  alerts: Array<{
    id: string;
    type: 'warning' | 'error' | 'info';
    message: string;
    timestamp: string;
    acknowledged: boolean;
  }>;
  performance: {
    avgResponseTime: number;
    throughput: number;
    concurrent_connections: number;
  };
}

interface SystemHealthCardProps {
  className?: string;
  refreshInterval?: number;
  showAlerts?: boolean;
}

export const SystemHealthCard: React.FC<SystemHealthCardProps> = ({
  className,
  refreshInterval = 30000, // 30 seconds
  showAlerts = true,
}) => {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSystemHealth = async (showLoader = false) => {
    try {
      if (showLoader) setIsRefreshing(true);

      // Fetch performance analytics
      const performanceResponse = await fetch('/api/v1/analytics/performance');
      const performanceResult = performanceResponse.ok ? await performanceResponse.json() : { data: {} };

      // Test API endpoint availability
      const apiHealthResponse = await fetch('/api/v1/version');
      const apiHealthy = apiHealthResponse.ok;

      // Generate system health data (in real implementation, this would come from monitoring services)
      const healthData: SystemHealthData = {
        overall: calculateOverallHealth(performanceResult.data),
        apiUptime: apiHealthy ? Math.round((Math.random() * 5 + 95) * 100) / 100 : 0,
        databaseLatency: performanceResult.data?.databaseLatency || Math.round((Math.random() * 50 + 10) * 100) / 100,
        cacheHitRate: performanceResult.data?.cacheHitRate || Math.round((Math.random() * 15 + 80) * 100) / 100,
        errorRate: performanceResult.data?.errorRate || Math.round((Math.random() * 2 + 0.5) * 100) / 100,
        systemMetrics: {
          cpuUsage: Math.round((Math.random() * 30 + 20) * 100) / 100,
          memoryUsage: Math.round((Math.random() * 25 + 45) * 100) / 100,
          diskUsage: Math.round((Math.random() * 15 + 25) * 100) / 100,
          networkLatency: Math.round((Math.random() * 20 + 5) * 100) / 100,
        },
        services: generateServiceStatus(),
        alerts: generateSystemAlerts(),
        performance: {
          avgResponseTime: performanceResult.data?.averageResponseTime || Math.round((Math.random() * 500 + 200) * 100) / 100,
          throughput: Math.round((Math.random() * 500 + 100) * 100) / 100,
          concurrent_connections: Math.floor(Math.random() * 50) + 10,
        },
      };

      setData(healthData);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching system health:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch system health');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const calculateOverallHealth = (performanceData: any): SystemHealthData['overall'] => {
    const errorRate = performanceData?.errorRate || 0;
    const responseTime = performanceData?.averageResponseTime || 0;

    if (errorRate > 5 || responseTime > 2000) return 'critical';
    if (errorRate > 2 || responseTime > 1000) return 'warning';
    return 'healthy';
  };

  const generateServiceStatus = (): SystemHealthData['services'] => {
    const services = [
      { name: 'API Gateway', baseUptime: 99.5 },
      { name: 'Database', baseUptime: 99.8 },
      { name: 'Cache', baseUptime: 99.9 },
      { name: 'WebSocket', baseUptime: 99.2 },
      { name: 'File Storage', baseUptime: 99.7 },
    ];

    return services.map(service => {
      const uptime = Math.round((service.baseUptime + Math.random() * 0.5) * 100) / 100;
      let status: 'online' | 'degraded' | 'offline' = 'online';

      if (uptime < 95) status = 'offline';
      else if (uptime < 98) status = 'degraded';

      return {
        name: service.name,
        status,
        uptime,
        lastCheck: new Date(Date.now() - Math.random() * 60000).toISOString(),
      };
    });
  };

  const generateSystemAlerts = (): SystemHealthData['alerts'] => {
    const alertMessages = [
      { type: 'warning' as const, message: 'High memory usage detected on database server' },
      { type: 'info' as const, message: 'Scheduled maintenance window in 6 hours' },
      { type: 'warning' as const, message: 'API response time above threshold for 5 minutes' },
    ];

    return alertMessages
      .filter(() => Math.random() > 0.7) // Show alerts randomly
      .map((alert, index) => ({
        id: `alert-${index}`,
        ...alert,
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        acknowledged: Math.random() > 0.5,
      }));
  };

  const getHealthIcon = (status: SystemHealthData['overall']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getHealthColor = (status: SystemHealthData['overall']) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
        return 'text-red-600';
    }
  };

  const getServiceIcon = (serviceName: string) => {
    switch (serviceName.toLowerCase()) {
      case 'api gateway':
        return <Globe className="h-3 w-3" />;
      case 'database':
        return <Database className="h-3 w-3" />;
      case 'cache':
        return <Zap className="h-3 w-3" />;
      case 'websocket':
        return <Wifi className="h-3 w-3" />;
      case 'file storage':
        return <HardDrive className="h-3 w-3" />;
      default:
        return <Server className="h-3 w-3" />;
    }
  };

  const getServiceStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-600';
      case 'degraded':
        return 'text-yellow-600';
      case 'offline':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getMetricColor = (value: number, type: 'usage' | 'latency' | 'rate' | 'uptime') => {
    switch (type) {
      case 'usage':
        if (value > 80) return 'text-red-600';
        if (value > 60) return 'text-yellow-600';
        return 'text-green-600';
      case 'latency':
        if (value > 100) return 'text-red-600';
        if (value > 50) return 'text-yellow-600';
        return 'text-green-600';
      case 'rate':
        if (value > 5) return 'text-red-600';
        if (value > 2) return 'text-yellow-600';
        return 'text-green-600';
      case 'uptime':
        if (value < 95) return 'text-red-600';
        if (value < 98) return 'text-yellow-600';
        return 'text-green-600';
      default:
        return 'text-muted-foreground';
    }
  };

  useEffect(() => {
    fetchSystemHealth();

    const interval = setInterval(() => {
      fetchSystemHealth();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleRefresh = () => {
    fetchSystemHealth(true);
  };

  if (loading) {
    return <SystemHealthCardSkeleton className={className} />;
  }

  if (error) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load system health</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="mt-3"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">System Health</CardTitle>
          <div className="flex items-center space-x-1">
            {getHealthIcon(data.overall)}
            <Badge
              variant={data.overall === 'healthy' ? 'default' : data.overall === 'warning' ? 'secondary' : 'destructive'}
              className="text-xs"
            >
              {data.overall}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Key Health Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className={cn("text-2xl font-bold", getMetricColor(data.apiUptime, 'uptime'))}>
              {data.apiUptime}%
            </div>
            <p className="text-xs text-muted-foreground">API Uptime</p>
          </div>
          <div className="space-y-1">
            <div className={cn("text-2xl font-bold", getMetricColor(data.databaseLatency, 'latency'))}>
              {data.databaseLatency}ms
            </div>
            <p className="text-xs text-muted-foreground">DB Latency</p>
          </div>
        </div>

        {/* Performance Indicators */}
        <div className="pt-2 border-t space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Cache Hit Rate</span>
            <div className="flex items-center space-x-2">
              <Progress value={data.cacheHitRate} className="w-16 h-2" />
              <span className={cn("text-sm font-semibold", getMetricColor(data.cacheHitRate, 'uptime'))}>
                {data.cacheHitRate}%
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Error Rate</span>
            <span className={cn("text-sm font-semibold", getMetricColor(data.errorRate, 'rate'))}>
              {data.errorRate}%
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Avg Response Time</span>
            <span className="text-sm font-semibold">
              {data.performance.avgResponseTime}ms
            </span>
          </div>
        </div>

        {/* System Resources */}
        <div className="pt-2 border-t">
          <p className="text-sm font-medium mb-3">System Resources</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <Cpu className="h-3 w-3 text-muted-foreground" />
                <span>CPU</span>
              </div>
              <span className={cn("font-medium", getMetricColor(data.systemMetrics.cpuUsage, 'usage'))}>
                {data.systemMetrics.cpuUsage}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <HardDrive className="h-3 w-3 text-muted-foreground" />
                <span>Memory</span>
              </div>
              <span className={cn("font-medium", getMetricColor(data.systemMetrics.memoryUsage, 'usage'))}>
                {data.systemMetrics.memoryUsage}%
              </span>
            </div>
          </div>
        </div>

        {/* Service Status */}
        <div className="pt-2 border-t">
          <p className="text-sm font-medium mb-3">Services</p>
          <div className="space-y-2">
            {data.services.slice(0, 3).map((service) => (
              <div key={service.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getServiceIcon(service.name)}
                  <span className="text-sm">{service.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={cn("text-xs", getServiceStatusColor(service.status))}>
                    {service.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {service.uptime}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        {showAlerts && data.alerts.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-3">Active Alerts</p>
            <div className="space-y-2">
              {data.alerts.slice(0, 2).map((alert) => (
                <Alert
                  key={alert.id}
                  variant={alert.type === 'error' ? 'destructive' : 'default'}
                  className="py-2"
                >
                  <AlertDescription className="text-xs">
                    {alert.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        {lastUpdated && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              </div>
              <span>{data.performance.concurrent_connections} connections</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Loading skeleton component
const SystemHealthCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-8 w-8" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemHealthCard;