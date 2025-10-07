'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * Developer Portal - Onboarding and Management Interface
 */
export default function DeveloperPortal() {
  const [user, setUser] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Mock data for demonstration
  useEffect(() => {
    // Simulate loading user data
    setTimeout(() => {
      setUser({
        id: 'dev_123',
        name: 'John Developer',
        email: 'john@example.com',
        tier: 'basic',
        joinedAt: '2024-01-15'
      });

      setApiKeys([
        {
          id: 'key_1',
          name: 'Production API Key',
          key: 'cb_live_abc123...',
          scopes: ['public', 'read'],
          created: '2024-01-15',
          lastUsed: '2024-01-20',
          status: 'active'
        },
        {
          id: 'key_2',
          name: 'Testing API Key',
          key: 'cb_test_def456...',
          scopes: ['public', 'read', 'write'],
          created: '2024-01-16',
          lastUsed: '2024-01-19',
          status: 'active'
        }
      ]);

      setUsage({
        current: {
          requests: 1250,
          tokens: 125000,
          responseTime: 890
        },
        limits: {
          requestsPerDay: 10000,
          tokensPerDay: 1000000
        },
        billing: {
          currentCost: 12.50,
          tier: 'basic'
        }
      });

      setLoading(false);
    }, 1000);
  }, []);

  const [newKeyForm, setNewKeyForm] = useState({
    name: '',
    description: '',
    scopes: ['public'] as string[],
    showForm: false
  });

  const handleCreateApiKey = () => {
    // Simulate API key creation
    const newKey = {
      id: `key_${Date.now()}`,
      name: newKeyForm.name,
      key: `cb_live_${Math.random().toString(36).substring(2, 34)}`,
      scopes: newKeyForm.scopes,
      created: new Date().toISOString().split('T')[0],
      lastUsed: 'Never',
      status: 'active'
    };

    setApiKeys([...apiKeys, newKey]);
    setNewKeyForm({ name: '', description: '', scopes: ['public'], showForm: false });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading developer portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Developer Portal</h1>
              <p className="mt-1 text-sm text-gray-500">
                Welcome back, {user?.name}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant={user?.tier === 'basic' ? 'default' : 'secondary'}>
                {user?.tier?.toUpperCase()} Plan
              </Badge>
              <Button variant="outline" size="sm">
                <a href="/docs/api" className="text-decoration-none">
                  View API Docs
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="usage">Usage & Billing</TabsTrigger>
            <TabsTrigger value="docs">Documentation</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quick Start Guide */}
            <Card>
              <CardHeader>
                <CardTitle>🚀 Quick Start Guide</CardTitle>
                <CardDescription>
                  Get started with the Chatbot API in minutes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border border-gray-200 rounded-lg">
                    <div className="text-2xl mb-2">1️⃣</div>
                    <h3 className="font-semibold mb-2">Create API Key</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Generate your first API key to authenticate requests
                    </p>
                    <Button size="sm" variant="outline">
                      Create Key
                    </Button>
                  </div>
                  <div className="text-center p-4 border border-gray-200 rounded-lg">
                    <div className="text-2xl mb-2">2️⃣</div>
                    <h3 className="font-semibold mb-2">Make First Call</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Send your first message to a chatbot
                    </p>
                    <Button size="sm" variant="outline">
                      Try API
                    </Button>
                  </div>
                  <div className="text-center p-4 border border-gray-200 rounded-lg">
                    <div className="text-2xl mb-2">3️⃣</div>
                    <h3 className="font-semibold mb-2">Integrate</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Use our SDKs to integrate into your app
                    </p>
                    <Button size="sm" variant="outline">
                      View SDKs
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>📊 Usage Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Requests Today</span>
                      <span className="font-semibold">{usage?.current?.requests || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Tokens Used</span>
                      <span className="font-semibold">{usage?.current?.tokens?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Avg Response Time</span>
                      <span className="font-semibold">{usage?.current?.responseTime || 0}ms</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${((usage?.current?.requests || 0) / (usage?.limits?.requestsPerDay || 1)) * 100}%`
                        }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {usage?.current?.requests || 0} / {usage?.limits?.requestsPerDay?.toLocaleString() || 0} daily requests
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>🔑 API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {apiKeys.slice(0, 3).map((key) => (
                      <div key={key.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-gray-500">Last used: {key.lastUsed}</p>
                        </div>
                        <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                          {key.status}
                        </Badge>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full mt-2">
                      Manage All Keys
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">API Keys</h2>
                <p className="text-gray-600">Manage your API keys for accessing the Chatbot API</p>
              </div>
              <Button onClick={() => setNewKeyForm({ ...newKeyForm, showForm: true })}>
                Create New Key
              </Button>
            </div>

            {newKeyForm.showForm && (
              <Card>
                <CardHeader>
                  <CardTitle>Create New API Key</CardTitle>
                  <CardDescription>
                    API keys are used to authenticate your requests to the Chatbot API
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      id="key-name"
                      placeholder="e.g., Production API Key"
                      value={newKeyForm.name}
                      onChange={(e) => setNewKeyForm({ ...newKeyForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="key-description">Description (Optional)</Label>
                    <Textarea
                      id="key-description"
                      placeholder="Describe what this key will be used for..."
                      value={newKeyForm.description}
                      onChange={(e) => setNewKeyForm({ ...newKeyForm, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Scopes</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {['public', 'read', 'write', 'admin'].map((scope) => (
                        <Button
                          key={scope}
                          variant={newKeyForm.scopes.includes(scope) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            const newScopes = newKeyForm.scopes.includes(scope)
                              ? newKeyForm.scopes.filter(s => s !== scope)
                              : [...newKeyForm.scopes, scope];
                            setNewKeyForm({ ...newKeyForm, scopes: newScopes });
                          }}
                        >
                          {scope}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button onClick={handleCreateApiKey} disabled={!newKeyForm.name}>
                      Create Key
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setNewKeyForm({ ...newKeyForm, showForm: false })}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4">
              {apiKeys.map((key) => (
                <Card key={key.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold">{key.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Created: {key.created} • Last used: {key.lastUsed}
                        </p>
                        <div className="flex space-x-2 mt-2">
                          {key.scopes.map((scope: string) => (
                            <Badge key={scope} variant="secondary" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg font-mono text-sm">
                          {key.key}***
                          <Button variant="outline" size="sm" className="ml-2">
                            Copy
                          </Button>
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm">
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Usage & Billing Tab */}
          <TabsContent value="usage" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Usage & Billing</h2>
              <p className="text-gray-600">Monitor your API usage and manage billing</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Current Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between">
                        <span>Requests</span>
                        <span className="font-semibold">{usage?.current?.requests || 0}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{
                            width: `${((usage?.current?.requests || 0) / (usage?.limits?.requestsPerDay || 1)) * 100}%`
                          }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between">
                        <span>Tokens</span>
                        <span className="font-semibold">{usage?.current?.tokens?.toLocaleString() || 0}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${((usage?.current?.tokens || 0) / (usage?.limits?.tokensPerDay || 1)) * 100}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Current Bill</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900">
                      ${usage?.billing?.currentCost || 0}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">This month</p>
                    <Badge variant="default" className="mt-3">
                      {usage?.billing?.tier?.toUpperCase() || 'FREE'} Plan
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Plan Limits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Requests/Day</span>
                      <span className="font-semibold">{usage?.limits?.requestsPerDay?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Tokens/Day</span>
                      <span className="font-semibold">{usage?.limits?.tokensPerDay?.toLocaleString() || 0}</span>
                    </div>
                    <Button size="sm" className="w-full mt-4">
                      Upgrade Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Documentation Tab */}
          <TabsContent value="docs" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Documentation</h2>
              <p className="text-gray-600">Everything you need to integrate with the Chatbot API</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    📖 API Reference
                  </CardTitle>
                  <CardDescription>
                    Complete API documentation with interactive examples
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    View API Docs
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    🚀 Getting Started
                  </CardTitle>
                  <CardDescription>
                    Step-by-step guide to your first API integration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Start Tutorial
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    🛠️ SDKs & Libraries
                  </CardTitle>
                  <CardDescription>
                    Official SDKs for popular programming languages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    View SDKs
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    💡 Examples
                  </CardTitle>
                  <CardDescription>
                    Code examples and sample applications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Browse Examples
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    🔄 Migration Guide
                  </CardTitle>
                  <CardDescription>
                    Upgrade between API versions safely
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    View Guide
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    ⚡ Best Practices
                  </CardTitle>
                  <CardDescription>
                    Tips and patterns for optimal performance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Learn More
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Support</h2>
              <p className="text-gray-600">Get help when you need it</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>💬 Contact Support</CardTitle>
                  <CardDescription>
                    Get help from our technical support team
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <AlertDescription>
                      <strong>Response Time:</strong> We typically respond within 24 hours for {user?.tier} plan users.
                    </AlertDescription>
                  </Alert>
                  <Button className="w-full">
                    Open Support Ticket
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>📊 API Status</CardTitle>
                  <CardDescription>
                    Check the current status of our API services
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm">All Systems Operational</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Last updated: 2 minutes ago
                  </div>
                  <Button variant="outline" className="w-full">
                    View Status Page
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>🔍 Common Issues</CardTitle>
                <CardDescription>
                  Quick solutions to frequently encountered problems
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-semibold">Authentication Issues</h4>
                    <p className="text-sm text-gray-600">
                      Make sure your API key is included in the x-api-key header or Authorization header.
                    </p>
                  </div>
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-semibold">Rate Limiting</h4>
                    <p className="text-sm text-gray-600">
                      Implement exponential backoff when you receive 429 responses.
                    </p>
                  </div>
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-semibold">Response Timeouts</h4>
                    <p className="text-sm text-gray-600">
                      Set appropriate timeout values (recommended: 30 seconds minimum).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}