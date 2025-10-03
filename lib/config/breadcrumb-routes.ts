import { RouteConfig, RouteConfigItem } from '@/lib/context/breadcrumb-context';

// Define all routes with their breadcrumb configurations
const routes: RouteConfigItem[] = [
  // Main Dashboard
  {
    path: '/dashboard',
    title: 'Dashboard',
    icon: 'Home',
  },

  // Chat System
  {
    path: '/dashboard/chat',
    title: 'Chat',
    icon: 'MessageSquare',
    parent: '/dashboard',
  },

  // Chatbot Management
  {
    path: '/dashboard/chatbots',
    title: 'Chatbots',
    icon: 'Bot',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/chatbots/new',
        title: 'Create Chatbot',
        icon: 'Plus',
        parent: '/dashboard/chatbots',
      },
      {
        path: '/dashboard/chatbots/[id]',
        title: 'Chatbot Details',
        icon: 'Bot',
        parent: '/dashboard/chatbots',
        dynamic: true,
      },
      {
        path: '/dashboard/chatbots/[id]/edit',
        title: 'Edit Chatbot',
        icon: 'Edit',
        parent: '/dashboard/chatbots/[id]',
        dynamic: true,
      },
      {
        path: '/dashboard/chatbots/[id]/settings',
        title: 'Chatbot Settings',
        icon: 'Settings',
        parent: '/dashboard/chatbots/[id]',
        dynamic: true,
      },
      {
        path: '/dashboard/chatbots/[id]/analytics',
        title: 'Chatbot Analytics',
        icon: 'BarChart3',
        parent: '/dashboard/chatbots/[id]',
        dynamic: true,
      },
      {
        path: '/dashboard/chatbots/[id]/conversations',
        title: 'Conversations',
        icon: 'MessageSquare',
        parent: '/dashboard/chatbots/[id]',
        dynamic: true,
      },
      {
        path: '/dashboard/chatbots/[id]/test',
        title: 'Test Chatbot',
        icon: 'PlayCircle',
        parent: '/dashboard/chatbots/[id]',
        dynamic: true,
      },
    ],
  },

  // Analytics
  {
    path: '/dashboard/analytics',
    title: 'Analytics',
    icon: 'BarChart3',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/analytics/overview',
        title: 'Overview',
        icon: 'Eye',
        parent: '/dashboard/analytics',
      },
      {
        path: '/dashboard/analytics/conversations',
        title: 'Conversation Analytics',
        icon: 'MessageSquare',
        parent: '/dashboard/analytics',
      },
      {
        path: '/dashboard/analytics/performance',
        title: 'Performance Metrics',
        icon: 'Activity',
        parent: '/dashboard/analytics',
      },
      {
        path: '/dashboard/analytics/usage',
        title: 'Usage Statistics',
        icon: 'BarChart3',
        parent: '/dashboard/analytics',
      },
      {
        path: '/dashboard/analytics/exports',
        title: 'Data Exports',
        icon: 'Download',
        parent: '/dashboard/analytics',
      },
    ],
  },

  // Knowledge Base
  {
    path: '/dashboard/knowledge',
    title: 'Knowledge Base',
    icon: 'Database',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/knowledge/documents',
        title: 'Documents',
        icon: 'FileText',
        parent: '/dashboard/knowledge',
      },
      {
        path: '/dashboard/knowledge/documents/upload',
        title: 'Upload Documents',
        icon: 'Upload',
        parent: '/dashboard/knowledge/documents',
      },
      {
        path: '/dashboard/knowledge/documents/[id]',
        title: 'Document Details',
        icon: 'FileText',
        parent: '/dashboard/knowledge/documents',
        dynamic: true,
      },
      {
        path: '/dashboard/knowledge/search',
        title: 'Search Knowledge',
        icon: 'Search',
        parent: '/dashboard/knowledge',
      },
      {
        path: '/dashboard/knowledge/categories',
        title: 'Categories',
        icon: 'Filter',
        parent: '/dashboard/knowledge',
      },
    ],
  },

  // Widget Management
  {
    path: '/dashboard/widgets',
    title: 'Widgets',
    icon: 'Globe',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/widgets/deployments',
        title: 'Widget Deployments',
        icon: 'Globe',
        parent: '/dashboard/widgets',
      },
      {
        path: '/dashboard/widgets/new',
        title: 'Deploy New Widget',
        icon: 'Plus',
        parent: '/dashboard/widgets',
      },
      {
        path: '/dashboard/widgets/[id]',
        title: 'Widget Details',
        icon: 'Globe',
        parent: '/dashboard/widgets',
        dynamic: true,
      },
      {
        path: '/dashboard/widgets/[id]/edit',
        title: 'Edit Widget',
        icon: 'Edit',
        parent: '/dashboard/widgets/[id]',
        dynamic: true,
      },
      {
        path: '/dashboard/widgets/[id]/analytics',
        title: 'Widget Analytics',
        icon: 'BarChart3',
        parent: '/dashboard/widgets/[id]',
        dynamic: true,
      },
      {
        path: '/dashboard/widgets/[id]/settings',
        title: 'Widget Settings',
        icon: 'Settings',
        parent: '/dashboard/widgets/[id]',
        dynamic: true,
      },
    ],
  },

  // User Management
  {
    path: '/dashboard/users',
    title: 'Users',
    icon: 'Users',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/users/list',
        title: 'User List',
        icon: 'Users',
        parent: '/dashboard/users',
      },
      {
        path: '/dashboard/users/[id]',
        title: 'User Profile',
        icon: 'User',
        parent: '/dashboard/users',
        dynamic: true,
      },
      {
        path: '/dashboard/users/[id]/edit',
        title: 'Edit User',
        icon: 'Edit',
        parent: '/dashboard/users/[id]',
        dynamic: true,
      },
      {
        path: '/dashboard/users/invite',
        title: 'Invite Users',
        icon: 'Mail',
        parent: '/dashboard/users',
      },
      {
        path: '/dashboard/users/roles',
        title: 'User Roles',
        icon: 'Shield',
        parent: '/dashboard/users',
      },
    ],
  },

  // Organization Settings
  {
    path: '/dashboard/organization',
    title: 'Organization',
    icon: 'Building',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/organization/profile',
        title: 'Organization Profile',
        icon: 'Building',
        parent: '/dashboard/organization',
      },
      {
        path: '/dashboard/organization/members',
        title: 'Members',
        icon: 'Users',
        parent: '/dashboard/organization',
      },
      {
        path: '/dashboard/organization/billing',
        title: 'Billing',
        icon: 'FileText',
        parent: '/dashboard/organization',
      },
      {
        path: '/dashboard/organization/api-keys',
        title: 'API Keys',
        icon: 'Key',
        parent: '/dashboard/organization',
      },
      {
        path: '/dashboard/organization/security',
        title: 'Security Settings',
        icon: 'Shield',
        parent: '/dashboard/organization',
      },
    ],
  },

  // Account Settings
  {
    path: '/dashboard/settings',
    title: 'Settings',
    icon: 'Settings',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/settings/profile',
        title: 'Profile Settings',
        icon: 'User',
        parent: '/dashboard/settings',
      },
      {
        path: '/dashboard/settings/preferences',
        title: 'Preferences',
        icon: 'Settings',
        parent: '/dashboard/settings',
      },
      {
        path: '/dashboard/settings/notifications',
        title: 'Notifications',
        icon: 'Bell',
        parent: '/dashboard/settings',
      },
      {
        path: '/dashboard/settings/security',
        title: 'Security',
        icon: 'Shield',
        parent: '/dashboard/settings',
      },
      {
        path: '/dashboard/settings/api',
        title: 'API Settings',
        icon: 'Key',
        parent: '/dashboard/settings',
      },
      {
        path: '/dashboard/settings/integrations',
        title: 'Integrations',
        icon: 'Share',
        parent: '/dashboard/settings',
      },
    ],
  },

  // System Administration (for admin users)
  {
    path: '/dashboard/admin',
    title: 'Administration',
    icon: 'Shield',
    parent: '/dashboard',
    children: [
      {
        path: '/dashboard/admin/system',
        title: 'System Status',
        icon: 'Activity',
        parent: '/dashboard/admin',
      },
      {
        path: '/dashboard/admin/logs',
        title: 'System Logs',
        icon: 'FileText',
        parent: '/dashboard/admin',
      },
      {
        path: '/dashboard/admin/monitoring',
        title: 'Monitoring',
        icon: 'Activity',
        parent: '/dashboard/admin',
      },
      {
        path: '/dashboard/admin/maintenance',
        title: 'Maintenance',
        icon: 'RefreshCw',
        parent: '/dashboard/admin',
      },
      {
        path: '/dashboard/admin/backups',
        title: 'Backups',
        icon: 'Archive',
        parent: '/dashboard/admin',
      },
    ],
  },
];

// Route configuration object
export const breadcrumbRouteConfig: RouteConfig = {
  routes,
  defaultTitle: 'Dashboard',
  homeRoute: '/dashboard',
};

// Utility functions for route management
export const findRouteByPath = (path: string, routes: RouteConfigItem[] = breadcrumbRouteConfig.routes): RouteConfigItem | null => {
  for (const route of routes) {
    // Exact match
    if (route.path === path) {
      return route;
    }

    // Dynamic route match
    if (route.dynamic && matchDynamicRoute(route.path, path)) {
      return route;
    }

    // Check children recursively
    if (route.children) {
      const childRoute = findRouteByPath(path, route.children);
      if (childRoute) return childRoute;
    }
  }

  return null;
};

export const matchDynamicRoute = (routePath: string, actualPath: string): boolean => {
  const routeSegments = routePath.split('/').filter(Boolean);
  const actualSegments = actualPath.split('/').filter(Boolean);

  if (routeSegments.length !== actualSegments.length) return false;

  return routeSegments.every((segment, index) => {
    // Dynamic segment matches anything
    if (segment.startsWith('[') && segment.endsWith(']')) {
      return true;
    }
    // Static segment must match exactly
    return segment === actualSegments[index];
  });
};

export const extractDynamicParams = (routePath: string, actualPath: string): Record<string, string> => {
  const routeSegments = routePath.split('/').filter(Boolean);
  const actualSegments = actualPath.split('/').filter(Boolean);
  const params: Record<string, string> = {};

  routeSegments.forEach((segment, index) => {
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const paramName = segment.slice(1, -1); // Remove brackets
      params[paramName] = actualSegments[index] || '';
    }
  });

  return params;
};

export const getAllRoutes = (): RouteConfigItem[] => {
  const flattenRoutes = (routes: RouteConfigItem[]): RouteConfigItem[] => {
    const result: RouteConfigItem[] = [];

    for (const route of routes) {
      result.push(route);
      if (route.children) {
        result.push(...flattenRoutes(route.children));
      }
    }

    return result;
  };

  return flattenRoutes(breadcrumbRouteConfig.routes);
};

export const getRouteHierarchy = (path: string): RouteConfigItem[] => {
  const hierarchy: RouteConfigItem[] = [];
  let currentRoute = findRouteByPath(path);

  while (currentRoute) {
    hierarchy.unshift(currentRoute);

    if (currentRoute.parent) {
      currentRoute = findRouteByPath(currentRoute.parent);
    } else {
      break;
    }
  }

  return hierarchy;
};

// Export default configuration
export default breadcrumbRouteConfig;