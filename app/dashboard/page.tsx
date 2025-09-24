"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, User, LogOut, Settings, Database } from "lucide-react";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  last_login_at?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/v1/auth/me');
      const data = await response.json();

      if (response.ok && data.success) {
        setUser(data.user);
      } else {
        // If not authenticated, redirect to login
        router.push('/login');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect even if logout request fails
      router.push('/login');
      router.refresh();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="flex h-16 items-center px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            <span className="font-bold">Chatbot Dashboard</span>
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4" />
              <span>{user.full_name}</span>
              <span className="text-muted-foreground">({user.role})</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome back, {user.full_name}!
            </h1>
            <p className="text-muted-foreground mt-2">
              Here&apos;s your dashboard overview. More features will be available soon.
            </p>
          </div>

          {/* Dashboard Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* User Profile Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Profile Information</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{user.full_name}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {user.email}
                </p>
                <div className="mt-4 space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Role:</span>{" "}
                    <span className="capitalize">{user.role}</span>
                  </p>
                  <p>
                    <span className="font-medium">Member since:</span>{" "}
                    {new Date(user.created_at).toLocaleDateString()}
                  </p>
                  {user.last_login_at && (
                    <p>
                      <span className="font-medium">Last login:</span>{" "}
                      {new Date(user.last_login_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Database Status Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Database Connection</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Connected</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Neon PostgreSQL with Vector Support
                </p>
                <div className="mt-4 space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Authentication:</span> AWS Cognito
                  </p>
                  <p>
                    <span className="font-medium">Session:</span> Active
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => router.push('/chat')}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Start Chat Session
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    disabled
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Manage Documents
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    disabled
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  More features coming soon...
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Placeholder for Future Features */}
          <div className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle>Coming Soon</CardTitle>
                <CardDescription>
                  These features will be available in future updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <p>• Document management and upload</p>
                  <p>• Vector similarity search</p>
                  <p>• Chat history and analytics</p>
                  <p>• User management (for admins)</p>
                  <p>• System settings and configuration</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}