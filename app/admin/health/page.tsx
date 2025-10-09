'use client';

import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfigurationStatus } from '@/components/health/configuration-status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  Server,
  Database,
  Cloud,
  Settings,
  ExternalLink,
  Info,
  AlertTriangle
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';

export default function AdminHealthPage() {
  // Initialize breadcrumbs
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false,
    customTitles: {
      '/admin/health': 'System Health'
    }
  });

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-600" />
              System Health Dashboard
            </h1>
            <p className="text-muted-foreground">
              Monitor system configuration, service health, and production readiness
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              Admin Panel
            </Badge>
          </div>
        </div>

        {/* Environment Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>
                Environment: <strong>{process.env.NODE_ENV || 'unknown'}</strong>
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/health" target="_blank">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Basic Health Check
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/health?detailed=true" target="_blank">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Detailed Health Check
                  </a>
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        {/* Development Warning */}
        {process.env.NODE_ENV === 'development' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Development Environment Detected</p>
                <p className="text-sm">
                  Some health checks may show warnings in development. Production configuration
                  should be verified in the actual production environment.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href="/api/health?detailed=true&secrets=true" target="_blank">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Configuration (Dev Only)
                    </a>
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Health Status */}
          <div className="md:col-span-2">
            <ConfigurationStatus
              showDetails={true}
              autoRefresh={true}
              refreshInterval={30000}
            />
          </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Quick Checks
                </CardTitle>
                <CardDescription>
                  Test individual system components
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="/api/health/database" target="_blank">
                    <Database className="h-4 w-4 mr-2" />
                    Database Health
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="/api/health/step-functions" target="_blank">
                    <Cloud className="h-4 w-4 mr-2" />
                    Step Functions Health
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="/dashboard/documents/step-functions" target="_blank">
                    <Settings className="h-4 w-4 mr-2" />
                    Test Upload Page
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Health Check Benefits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>• <strong>Early Detection:</strong> Identify issues before they affect users</p>
                <p>• <strong>Configuration Validation:</strong> Ensure all required settings are present</p>
                <p>• <strong>Service Monitoring:</strong> Check connectivity to external services</p>
                <p>• <strong>Production Readiness:</strong> Verify deployment prerequisites</p>
                <p>• <strong>Debugging Aid:</strong> Quickly identify misconfiguration issues</p>
                <p>• <strong>Status Monitoring:</strong> Real-time system health visibility</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* API Documentation */}
        <Card>
          <CardHeader>
            <CardTitle>Health Check API Endpoints</CardTitle>
            <CardDescription>
              Available endpoints for programmatic health monitoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium">Basic Health Check</h4>
                <code className="text-sm bg-gray-100 p-2 rounded block">GET /api/health</code>
                <p className="text-sm text-gray-600">
                  Returns overall system status and basic service health
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Detailed Health Check</h4>
                <code className="text-sm bg-gray-100 p-2 rounded block">GET /api/health?detailed=true</code>
                <p className="text-sm text-gray-600">
                  Includes configuration validation and service connectivity tests
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Database Health</h4>
                <code className="text-sm bg-gray-100 p-2 rounded block">GET /api/health/database</code>
                <p className="text-sm text-gray-600">
                  Tests database connectivity and query execution
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Step Functions Health</h4>
                <code className="text-sm bg-gray-100 p-2 rounded block">GET /api/health/step-functions</code>
                <p className="text-sm text-gray-600">
                  Validates AWS credentials and Step Functions access
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}