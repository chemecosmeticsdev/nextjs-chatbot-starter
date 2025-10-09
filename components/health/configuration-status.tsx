'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Info,
  Settings,
  Database,
  Cloud,
  Activity
} from 'lucide-react';

interface HealthResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: string;
  required: boolean;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  results: HealthResult[];
}

interface ConfigurationStatusProps {
  showDetails?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function ConfigurationStatus({
  showDetails = true,
  autoRefresh = false,
  refreshInterval = 30000
}: ConfigurationStatusProps) {
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealthData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/health?detailed=true');

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      setHealthData(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch health data:', err);
      setError(err instanceof Error ? err.message : 'Failed to check system health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();

    if (autoRefresh) {
      const interval = setInterval(fetchHealthData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'unhealthy':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Activity className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-800">Healthy</Badge>;
      case 'degraded':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Degraded</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getServiceIcon = (service: string) => {
    switch (service.toLowerCase()) {
      case 'database':
        return <Database className="h-4 w-4" />;
      case 'step_functions':
        return <Cloud className="h-4 w-4" />;
      case 'configuration':
        return <Settings className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getRecommendations = (results: HealthResult[]) => {
    const unhealthyServices = results.filter(r => r.status === 'unhealthy' && r.required);
    const degradedServices = results.filter(r => r.status === 'degraded');

    const recommendations: string[] = [];

    unhealthyServices.forEach(service => {
      switch (service.service) {
        case 'database':
          recommendations.push('Check DATABASE_URL environment variable and database connectivity');
          break;
        case 'configuration':
          recommendations.push('Verify all required environment variables are set in production');
          break;
        case 'step_functions':
          recommendations.push('Configure AWS credentials and Step Functions state machine ARN');
          break;
        default:
          recommendations.push(`Check ${service.service} configuration and connectivity`);
      }
    });

    if (degradedServices.length > 0) {
      recommendations.push('Some optional services are not fully configured but the system should still function');
    }

    return recommendations;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Checking System Health...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Health Check Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={fetchHealthData} className="mt-4" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!healthData) {
    return null;
  }

  const recommendations = getRecommendations(healthData.results);
  const criticalIssues = healthData.results.filter(r => r.status === 'unhealthy' && r.required);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(healthData.status)}
              System Health Status
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(healthData.status)}
              <Button onClick={fetchHealthData} variant="ghost" size="sm">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Last updated: {lastUpdated?.toLocaleTimeString()}
          </CardDescription>
        </CardHeader>

        {showDetails && (
          <CardContent className="space-y-4">
            {/* Critical Issues */}
            {criticalIssues.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Critical issues detected that may prevent normal operation:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {criticalIssues.map((issue, index) => (
                        <li key={index} className="text-sm">
                          {issue.service}: {issue.details}
                        </li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Service Status Details */}
            <div className="grid gap-3">
              {healthData.results.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border-l-4 ${
                    result.status === 'healthy' ? 'border-l-green-500 bg-green-50' :
                    result.status === 'degraded' ? 'border-l-yellow-500 bg-yellow-50' :
                    'border-l-red-500 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {getServiceIcon(result.service)}
                      <span className="font-medium capitalize">
                        {result.service.replace('_', ' ')}
                      </span>
                      {result.required && (
                        <Badge variant="outline" className="text-xs">Required</Badge>
                      )}
                    </div>
                    {getStatusBadge(result.status)}
                  </div>
                  {result.details && (
                    <p className="text-sm text-gray-600 mt-1">{result.details}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Recommendations:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {recommendations.map((rec, index) => (
                        <li key={index}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Environment Info */}
            {process.env.NODE_ENV === 'development' && (
              <div className="pt-4 border-t">
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/health?detailed=true&secrets=true" target="_blank">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Raw Health Data
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}