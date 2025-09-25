'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Database,
  Shield,
  Users,
  Bell,
  Wrench,
  Save,
  AlertCircle,
  CheckCircle,
  Cloud,
  Server,
  Key,
  Lock,
  Globe,
  Palette,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { useTheme } from 'next-themes';

interface SystemSettings {
  database: {
    maxConnections: number;
    connectionTimeout: number;
    queryTimeout: number;
    maintenanceMode: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    apiRateLimit: number;
    sessionTimeout: number;
    passwordPolicy: string;
  };
  notifications: {
    emailNotifications: boolean;
    systemAlerts: boolean;
    userRegistrations: boolean;
    errorReports: boolean;
  };
  aws: {
    region: string;
    bedrockModel: string;
    s3Bucket: string;
    cognitoPoolId: string;
  };
  system: {
    maintenanceMode: boolean;
    debugMode: boolean;
    logLevel: string;
    backupFrequency: string;
  };
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<SystemSettings>({
    database: {
      maxConnections: 100,
      connectionTimeout: 30,
      queryTimeout: 60,
      maintenanceMode: false,
    },
    security: {
      twoFactorEnabled: true,
      apiRateLimit: 1000,
      sessionTimeout: 24,
      passwordPolicy: 'strong',
    },
    notifications: {
      emailNotifications: true,
      systemAlerts: true,
      userRegistrations: false,
      errorReports: true,
    },
    aws: {
      region: 'ap-southeast-1',
      bedrockModel: 'amazon.nova-micro-v1:0',
      s3Bucket: 'chatbot-documents',
      cognitoPoolId: '7p0uanoj10cg99u2qjpe1np74q',
    },
    system: {
      maintenanceMode: false,
      debugMode: false,
      logLevel: 'info',
      backupFrequency: 'daily',
    },
  });

  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    // Check user role for access control
    const checkUserRole = async () => {
      try {
        const response = await fetch('/api/v1/auth/me');
        const data = await response.json();
        if (data.success && data.user.role === 'super_admin') {
          setUserRole(data.user.role);
        } else {
          // Redirect if not super admin
          window.location.href = '/dashboard';
          return;
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/dashboard';
        return;
      }
    };

    checkUserRole();
  }, []);

  const handleSettingsChange = (section: keyof SystemSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Simulate API call to save settings
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Settings saved:', settings);
      // In real implementation, this would be an API call
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  // Show access denied for non-super admin users
  if (!userRole) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-600 mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don&apos;t have permission to access system settings. This feature is restricted to super administrators.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <a href="/dashboard">Return to Dashboard</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground">
            Configure system-wide settings and preferences
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Database Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Configuration
            </CardTitle>
            <CardDescription>
              Manage database connections and performance settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxConnections">Max Connections</Label>
                <Input
                  id="maxConnections"
                  type="number"
                  value={settings.database.maxConnections}
                  onChange={(e) => handleSettingsChange('database', 'maxConnections', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="connectionTimeout">Connection Timeout (seconds)</Label>
                <Input
                  id="connectionTimeout"
                  type="number"
                  value={settings.database.connectionTimeout}
                  onChange={(e) => handleSettingsChange('database', 'connectionTimeout', parseInt(e.target.value))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Enable maintenance mode for database operations
                </p>
              </div>
              <Switch
                checked={settings.database.maintenanceMode}
                onCheckedChange={(checked) => handleSettingsChange('database', 'maintenanceMode', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Settings
            </CardTitle>
            <CardDescription>
              Configure security policies and access controls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="apiRateLimit">API Rate Limit (requests/hour)</Label>
                <Input
                  id="apiRateLimit"
                  type="number"
                  value={settings.security.apiRateLimit}
                  onChange={(e) => handleSettingsChange('security', 'apiRateLimit', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Session Timeout (hours)</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  value={settings.security.sessionTimeout}
                  onChange={(e) => handleSettingsChange('security', 'sessionTimeout', parseInt(e.target.value))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Two-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground">
                  Require 2FA for admin accounts
                </p>
              </div>
              <Switch
                checked={settings.security.twoFactorEnabled}
                onCheckedChange={(checked) => handleSettingsChange('security', 'twoFactorEnabled', checked)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordPolicy">Password Policy</Label>
              <Select
                value={settings.security.passwordPolicy}
                onValueChange={(value) => handleSettingsChange('security', 'passwordPolicy', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select password policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic (8 characters)</SelectItem>
                  <SelectItem value="strong">Strong (12 chars, mixed case, numbers)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (16 chars, symbols required)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* User Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>
              Control user registration and account policies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">127</div>
                  <Badge variant="secondary">+5 this week</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">42</div>
                  <Badge variant="secondary">Online now</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Admin Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <Badge variant="secondary">Super Admin: 2</Badge>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Theme & Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Theme & Appearance
            </CardTitle>
            <CardDescription>
              Customize the application theme and appearance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Theme Preference</Label>
              <div className="grid grid-cols-3 gap-4">
                <Button
                  variant={theme === 'light' ? 'default' : 'outline'}
                  onClick={() => setTheme('light')}
                  className="flex items-center gap-2"
                >
                  <Sun className="h-4 w-4" />
                  Light
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  onClick={() => setTheme('dark')}
                  className="flex items-center gap-2"
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </Button>
                <Button
                  variant={theme === 'system' ? 'default' : 'outline'}
                  onClick={() => setTheme('system')}
                  className="flex items-center gap-2"
                >
                  <Monitor className="h-4 w-4" />
                  System
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose your preferred theme. System theme follows your device&apos;s appearance settings.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Color Scheme</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium">Blue (Default)</span>
                  <Badge variant="secondary">Current</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Additional color schemes will be available in future updates.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Theme Preview</Label>
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-sm text-primary">Primary Color</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary"></div>
                  <span className="text-sm text-secondary-foreground">Secondary Color</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted"></div>
                  <span className="text-sm text-muted-foreground">Muted Color</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Current theme: <span className="font-medium capitalize">{theme}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AWS Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              AWS Configuration
            </CardTitle>
            <CardDescription>
              AWS services configuration and status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary Region</Label>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="font-medium">{settings.aws.region}</span>
                  <Badge variant="secondary">Active</Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bedrock Model</Label>
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  <span className="font-medium">{settings.aws.bedrockModel}</span>
                  <Badge variant="secondary">Connected</Badge>
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>S3 Bucket</Label>
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span className="font-medium">{settings.aws.s3Bucket}</span>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cognito Pool</Label>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  <span className="font-medium">{settings.aws.cognitoPoolId}</span>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              Configure system notifications and alerts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send system alerts via email
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.emailNotifications}
                  onCheckedChange={(checked) => handleSettingsChange('notifications', 'emailNotifications', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">System Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Real-time system status alerts
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.systemAlerts}
                  onCheckedChange={(checked) => handleSettingsChange('notifications', 'systemAlerts', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">User Registration Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when new users register
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.userRegistrations}
                  onCheckedChange={(checked) => handleSettingsChange('notifications', 'userRegistrations', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Maintenance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              System Maintenance
            </CardTitle>
            <CardDescription>
              System maintenance and diagnostic settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Put the system in maintenance mode
                </p>
              </div>
              <Switch
                checked={settings.system.maintenanceMode}
                onCheckedChange={(checked) => handleSettingsChange('system', 'maintenanceMode', checked)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="logLevel">Log Level</Label>
                <Select
                  value={settings.system.logLevel}
                  onValueChange={(value) => handleSettingsChange('system', 'logLevel', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select log level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debug">Debug</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="backupFrequency">Backup Frequency</Label>
                <Select
                  value={settings.system.backupFrequency}
                  onValueChange={(value) => handleSettingsChange('system', 'backupFrequency', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select backup frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">System Information</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Application Version:</span>
              <span>v1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database Version:</span>
              <span>PostgreSQL 15.4</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Backup:</span>
              <span>2024-09-25 06:00 UTC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">System Uptime:</span>
              <span>15 days, 7 hours</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}