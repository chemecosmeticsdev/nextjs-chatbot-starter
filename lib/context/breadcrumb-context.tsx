"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Core breadcrumb item interface
export interface BreadcrumbItem {
  id: string;
  title: string;
  href: string;
  isCurrentPage: boolean;
  icon?: string;
  metadata?: Record<string, any>;
}

// Route configuration interfaces
export interface RouteConfigItem {
  path: string;
  title: string;
  icon?: string;
  parent?: string;
  dynamic?: boolean;
  children?: RouteConfigItem[];
}

export interface RouteConfig {
  routes: RouteConfigItem[];
  defaultTitle: string;
  homeRoute: string;
}

// Context value interface
export interface BreadcrumbContextValue {
  items: BreadcrumbItem[];
  maxItems: number;
  setItems: (items: BreadcrumbItem[]) => void;
  addItem: (item: BreadcrumbItem) => void;
  updateItem: (id: string, updates: Partial<BreadcrumbItem>) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  setMaxItems: (max: number) => void;
  isReady: boolean;
  history: BreadcrumbItem[][];
  goBack: () => void;
  canGoBack: boolean;
}

// Provider props interface
export interface BreadcrumbProviderProps {
  children: React.ReactNode;
  defaultMaxItems?: number;
  routeConfig?: RouteConfig;
  enableAutoGeneration?: boolean;
  enableHistory?: boolean;
}

// Create the context
const BreadcrumbContext = createContext<BreadcrumbContextValue | undefined>(undefined);

// Auto-generation utility function (simplified for context provider)
const generateBreadcrumbsFromPath = (
  path: string,
  routeConfig?: RouteConfig
): BreadcrumbItem[] => {
  if (!routeConfig) return [];

  const segments = path.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  // Always start with home/dashboard
  breadcrumbs.push({
    id: 'home',
    title: routeConfig.defaultTitle,
    href: routeConfig.homeRoute,
    isCurrentPage: false,
  });

  if (path === routeConfig.homeRoute) {
    breadcrumbs[0].isCurrentPage = true;
    return breadcrumbs;
  }

  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    const route = findRouteByPath(currentPath, routeConfig.routes);

    if (route) {
      const isLast = i === segments.length - 1;

      breadcrumbs.push({
        id: route.path,
        title: route.title,
        href: route.path,
        isCurrentPage: isLast,
        icon: route.icon,
      });
    }
  }

  return breadcrumbs;
};

const findRouteByPath = (path: string, routes: RouteConfigItem[]): RouteConfigItem | null => {
  for (const route of routes) {
    if (route.path === path || matchDynamicRoute(route.path, path)) {
      return route;
    }

    if (route.children) {
      const childRoute = findRouteByPath(path, route.children);
      if (childRoute) return childRoute;
    }
  }

  return null;
};

const matchDynamicRoute = (routePath: string, actualPath: string): boolean => {
  const routeSegments = routePath.split('/');
  const actualSegments = actualPath.split('/');

  if (routeSegments.length !== actualSegments.length) return false;

  return routeSegments.every((segment, index) => {
    if (segment.startsWith('[') && segment.endsWith(']')) {
      return true; // Dynamic segment matches anything
    }
    return segment === actualSegments[index];
  });
};

// Breadcrumb Provider Component
export const BreadcrumbProvider: React.FC<BreadcrumbProviderProps> = ({
  children,
  defaultMaxItems = 4,
  routeConfig,
  enableAutoGeneration = true,
  enableHistory = true,
}) => {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  const [maxItems, setMaxItems] = useState(defaultMaxItems);
  const [isReady, setIsReady] = useState(true); // Initialize as ready to prevent infinite loops
  const [history, setHistory] = useState<BreadcrumbItem[][]>([]);

  const router = useRouter();
  const pathname = usePathname();

  // Removed auto-generation from context to prevent circular dependencies
  // Breadcrumbs will now be generated only by hooks to centralize control

  // Debounced setItems to prevent rapid state changes
  const debouncedSetItems = useCallback(
    React.useMemo(() => {
      let timeoutId: NodeJS.Timeout;
      return (newItems: BreadcrumbItem[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setItems(newItems);
          // Update history if enabled
          if (enableHistory && newItems.length > 0) {
            setHistory(prev => {
              const newHistory = [...prev, newItems];
              // Keep only last 10 entries for performance
              return newHistory.slice(-10);
            });
          }
        }, 16); // 16ms debounce for smooth updates
      };
    }, [enableHistory]),
    [enableHistory]
  );

  // Breadcrumb management functions with debouncing
  const addItem = useCallback((item: BreadcrumbItem) => {
    setItems(prev => {
      const newItems = [...prev, item];
      debouncedSetItems(newItems);
      return newItems;
    });
  }, [debouncedSetItems]);

  const updateItem = useCallback((id: string, updates: Partial<BreadcrumbItem>) => {
    setItems(prev => {
      const newItems = prev.map(item => item.id === id ? { ...item, ...updates } : item);
      debouncedSetItems(newItems);
      return newItems;
    });
  }, [debouncedSetItems]);

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const newItems = prev.filter(item => item.id !== id);
      debouncedSetItems(newItems);
      return newItems;
    });
  }, [debouncedSetItems]);

  const clearItems = useCallback(() => {
    setItems([]);
    setHistory([]);
  }, []);

  // Controlled setItems function that replaces all items
  const setItemsControlled = useCallback((newItems: BreadcrumbItem[]) => {
    setItems(newItems);
    // Update history if enabled
    if (enableHistory && newItems.length > 0) {
      setHistory(prev => {
        const newHistory = [...prev, newItems];
        // Keep only last 10 entries for performance
        return newHistory.slice(-10);
      });
    }
  }, [enableHistory]);

  const goBack = useCallback(() => {
    if (history.length > 1) {
      const previousItems = history[history.length - 2];
      const previousPath = previousItems[previousItems.length - 1]?.href;

      if (previousPath && previousPath !== pathname) {
        router.push(previousPath);
      }
    }
  }, [history, pathname, router]);

  const canGoBack = history.length > 1 &&
    history[history.length - 2]?.[history[history.length - 2].length - 1]?.href !== pathname;

  // Context value
  const contextValue: BreadcrumbContextValue = {
    items,
    maxItems,
    setItems: setItemsControlled,
    addItem,
    updateItem,
    removeItem,
    clearItems,
    setMaxItems,
    isReady,
    history,
    goBack,
    canGoBack,
  };

  return (
    <BreadcrumbContext.Provider value={contextValue}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

// Custom hook to use breadcrumb context
export const useBreadcrumbContext = (): BreadcrumbContextValue => {
  const context = useContext(BreadcrumbContext);

  if (!context) {
    throw new Error(
      'useBreadcrumbContext must be used within a BreadcrumbProvider. ' +
      'Make sure to wrap your component tree with <BreadcrumbProvider>.'
    );
  }

  return context;
};

// Convenience hook for checking if breadcrumb context is available
export const useBreadcrumbContextOptional = (): BreadcrumbContextValue | null => {
  return useContext(BreadcrumbContext) || null;
};

// Export the context for advanced usage
export { BreadcrumbContext };