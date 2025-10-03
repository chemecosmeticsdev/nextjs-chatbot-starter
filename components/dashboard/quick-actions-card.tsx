"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Zap,
  Plus,
  Bot,
  Globe,
  BarChart3,
  PlayCircle,
  Settings,
  MessageSquare,
  Database,
  Upload,
  Download,
  Users,
  FileText,
  Search,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Rocket
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'create' | 'manage' | 'analyze' | 'test';
  priority: 'high' | 'medium' | 'low';
  isExternal?: boolean;
  requiresPermission?: string;
  badge?: string;
  disabled?: boolean;
}

interface QuickActionsCardProps {
  className?: string;
  maxActions?: number;
  showCategories?: boolean;
  userRole?: string;
}

export const QuickActionsCard: React.FC<QuickActionsCardProps> = ({
  className,
  maxActions = 6,
  showCategories = false,
  userRole = 'user',
}) => {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<QuickAction[]>([]);
  const router = useRouter();

  const allActions: QuickAction[] = [
    // Create Category
    {
      id: 'create-chatbot',
      title: 'Create Chatbot',
      description: 'Build a new AI chatbot',
      href: '/dashboard/chatbots/new',
      icon: Bot,
      category: 'create',
      priority: 'high',
      badge: 'Popular',
    },
    {
      id: 'deploy-widget',
      title: 'Deploy Widget',
      description: 'Add chat widget to website',
      href: '/dashboard/widgets/new',
      icon: Globe,
      category: 'create',
      priority: 'high',
    },
    {
      id: 'upload-documents',
      title: 'Upload Documents',
      description: 'Add knowledge base content',
      href: '/dashboard/knowledge/documents/upload',
      icon: Upload,
      category: 'create',
      priority: 'medium',
    },

    // Manage Category
    {
      id: 'manage-chatbots',
      title: 'Manage Chatbots',
      description: 'View and edit chatbots',
      href: '/dashboard/chatbots',
      icon: Settings,
      category: 'manage',
      priority: 'high',
    },
    {
      id: 'view-conversations',
      title: 'Conversations',
      description: 'Review chat history',
      href: '/dashboard/conversations',
      icon: MessageSquare,
      category: 'manage',
      priority: 'medium',
    },
    {
      id: 'manage-users',
      title: 'User Management',
      description: 'Manage team members',
      href: '/dashboard/users',
      icon: Users,
      category: 'manage',
      priority: 'medium',
      requiresPermission: 'admin',
    },

    // Analyze Category
    {
      id: 'view-analytics',
      title: 'Analytics',
      description: 'Performance insights',
      href: '/dashboard/analytics',
      icon: BarChart3,
      category: 'analyze',
      priority: 'high',
    },
    {
      id: 'export-data',
      title: 'Export Data',
      description: 'Download reports',
      href: '/dashboard/analytics/exports',
      icon: Download,
      category: 'analyze',
      priority: 'low',
    },
    {
      id: 'search-knowledge',
      title: 'Search Knowledge',
      description: 'Find information quickly',
      href: '/dashboard/knowledge/search',
      icon: Search,
      category: 'analyze',
      priority: 'medium',
    },

    // Test Category
    {
      id: 'test-chatbot',
      title: 'Test Playground',
      description: 'Try your chatbot',
      href: '/dashboard/playground',
      icon: PlayCircle,
      category: 'test',
      priority: 'high',
      badge: 'New',
    },
    {
      id: 'start-chat',
      title: 'Start Chat',
      description: 'Begin conversation',
      href: '/dashboard/chat',
      icon: MessageSquare,
      category: 'test',
      priority: 'medium',
    },
  ];

  const filterActions = () => {
    let filteredActions = allActions.filter(action => {
      // Filter by user permissions
      if (action.requiresPermission) {
        if (action.requiresPermission === 'admin' && !['admin', 'super_admin'].includes(userRole)) {
          return false;
        }
      }

      // Filter out disabled actions
      return !action.disabled;
    });

    // Sort by priority (high -> medium -> low) and then by category
    filteredActions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];

      if (priorityDiff !== 0) return priorityDiff;

      return a.category.localeCompare(b.category);
    });

    return filteredActions.slice(0, maxActions);
  };

  useEffect(() => {
    // Simulate loading time for more realistic feel
    const timer = setTimeout(() => {
      setActions(filterActions());
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [userRole, maxActions]);

  const handleActionClick = (action: QuickAction) => {
    if (action.isExternal) {
      window.open(action.href, '_blank');
    } else {
      router.push(action.href);
    }
  };

  const getCategoryIcon = (category: QuickAction['category']) => {
    switch (category) {
      case 'create':
        return <Plus className="h-3 w-3" />;
      case 'manage':
        return <Settings className="h-3 w-3" />;
      case 'analyze':
        return <BarChart3 className="h-3 w-3" />;
      case 'test':
        return <PlayCircle className="h-3 w-3" />;
    }
  };

  const getCategoryColor = (category: QuickAction['category']) => {
    switch (category) {
      case 'create':
        return 'text-green-600 bg-green-50';
      case 'manage':
        return 'text-blue-600 bg-blue-50';
      case 'analyze':
        return 'text-purple-600 bg-purple-50';
      case 'test':
        return 'text-orange-600 bg-orange-50';
    }
  };

  if (loading) {
    return <QuickActionsCardSkeleton className={className} />;
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center space-x-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </div>
        <Badge variant="outline" className="text-xs">
          <Rocket className="h-3 w-3 mr-1" />
          Shortcuts
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Actions Grid */}
        <div className="grid grid-cols-1 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <div
                key={action.id}
                className="group relative"
              >
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto p-3 hover:bg-accent/50 transition-colors"
                  onClick={() => handleActionClick(action)}
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <div className={cn(
                      "p-2 rounded-md",
                      getCategoryColor(action.category)
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 text-left">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-sm">{action.title}</span>
                        {action.badge && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                            {action.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {action.description}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1">
                      {showCategories && (
                        <div className="flex items-center space-x-1">
                          {getCategoryIcon(action.category)}
                          <span className="text-xs text-muted-foreground capitalize">
                            {action.category}
                          </span>
                        </div>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </Button>

                {action.isExternal && (
                  <ExternalLink className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>

        {/* Category Summary */}
        {showCategories && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Categories</p>
            <div className="flex flex-wrap gap-2">
              {['create', 'manage', 'analyze', 'test'].map((category) => {
                const count = actions.filter(action => action.category === category).length;
                if (count === 0) return null;

                return (
                  <Badge
                    key={category}
                    variant="outline"
                    className="text-xs"
                  >
                    {getCategoryIcon(category as QuickAction['category'])}
                    <span className="ml-1 capitalize">{category}</span>
                    <span className="ml-1">({count})</span>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer with additional links */}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Need help?</span>
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-1 text-xs"
                asChild
              >
                <Link href="/docs">
                  <FileText className="h-3 w-3 mr-1" />
                  Docs
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-1 text-xs"
                asChild
              >
                <Link href="/dashboard/settings">
                  <Settings className="h-3 w-3 mr-1" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Loading skeleton component
const QuickActionsCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-5 w-16" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center space-x-3 p-3 border rounded-md">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
        <div className="pt-3 border-t">
          <Skeleton className="h-4 w-full" />
        </div>
      </CardContent>
    </Card>
  );
};

export default QuickActionsCard;