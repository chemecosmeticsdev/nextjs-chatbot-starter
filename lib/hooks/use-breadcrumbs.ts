"use client";

import { useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  useBreadcrumbContext,
  useBreadcrumbContextOptional,
  BreadcrumbItem,
} from '@/lib/context/breadcrumb-context';
import {
  generateBreadcrumbsFromPath,
  updateBreadcrumbItems,
  insertBreadcrumbItem,
  removeBreadcrumbItem,
  validateBreadcrumbs,
  generateBreadcrumbAnalytics,
  BreadcrumbGenerationOptions,
} from '@/lib/utils/breadcrumb-generator';
import { breadcrumbRouteConfig } from '@/lib/config/breadcrumb-routes';

export interface UseBreadcrumbsOptions extends BreadcrumbGenerationOptions {
  autoGenerate?: boolean;
  trackAnalytics?: boolean;
  validateOnUpdate?: boolean;
  customItems?: BreadcrumbItem[];
  onBreadcrumbChange?: (items: BreadcrumbItem[]) => void;
}

export interface UseBreadcrumbsReturn {
  // Current breadcrumb state
  items: BreadcrumbItem[];
  isReady: boolean;

  // Navigation
  currentPage: BreadcrumbItem | null;
  canGoBack: boolean;
  goBack: () => void;

  // Breadcrumb management
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
  addBreadcrumb: (item: BreadcrumbItem) => void;
  updateBreadcrumb: (id: string, updates: Partial<BreadcrumbItem>) => void;
  removeBreadcrumb: (id: string) => void;
  clearBreadcrumbs: () => void;

  // Utilities
  regenerateBreadcrumbs: () => void;
  insertCustomItem: (item: BreadcrumbItem, position?: number) => void;
  validateCurrentBreadcrumbs: () => { isValid: boolean; errors: string[] };

  // Analytics
  getAnalytics: () => ReturnType<typeof generateBreadcrumbAnalytics>;

  // Configuration
  setMaxItems: (max: number) => void;
  maxItems: number;
}

/**
 * Primary hook for breadcrumb management
 * Provides comprehensive breadcrumb functionality with auto-generation
 */
export const useBreadcrumbs = (options: UseBreadcrumbsOptions = {}): UseBreadcrumbsReturn => {
  const context = useBreadcrumbContext();
  const pathname = usePathname();
  const router = useRouter();

  const {
    autoGenerate = true,
    trackAnalytics = false,
    validateOnUpdate = false,
    customItems = [],
    onBreadcrumbChange,
    ...generationOptions
  } = options;

  // Memoize generation options to prevent unnecessary re-runs
  const memoizedGenerationOptions = useMemo(() => generationOptions, [
    JSON.stringify(generationOptions)
  ]);

  // Memoize custom items to prevent unnecessary re-runs
  const memoizedCustomItems = useMemo(() => customItems, [
    JSON.stringify(customItems)
  ]);

  // Auto-generate breadcrumbs when pathname changes (removed context.isReady dependency)
  useEffect(() => {
    if (autoGenerate && pathname) {
      const generatedItems = generateBreadcrumbsFromPath(pathname, {
        routeConfig: breadcrumbRouteConfig,
        ...memoizedGenerationOptions,
      });

      // Merge with custom items if provided
      let finalItems = generatedItems;
      if (memoizedCustomItems.length > 0) {
        finalItems = [...generatedItems];
        memoizedCustomItems.forEach(customItem => {
          // Check if custom item already exists
          const existingIndex = finalItems.findIndex(item => item.id === customItem.id);
          if (existingIndex !== -1) {
            finalItems[existingIndex] = { ...finalItems[existingIndex], ...customItem };
          } else {
            finalItems.push(customItem);
          }
        });
      }

      // Validate if enabled
      if (validateOnUpdate) {
        const validation = validateBreadcrumbs(finalItems);
        if (!validation.isValid) {
          console.warn('Generated breadcrumbs failed validation:', validation.errors);
        }
      }

      context.setItems(finalItems);

      // Track analytics if enabled (but don't log in development to prevent spam)
      if (trackAnalytics) {
        const analytics = generateBreadcrumbAnalytics(finalItems, pathname);
        // You can send this to your analytics service
        if (process.env.NODE_ENV !== 'development') {
          console.debug('Breadcrumb Analytics:', analytics);
        }
      }

      // Call onChange callback if provided
      if (onBreadcrumbChange) {
        onBreadcrumbChange(finalItems);
      }
    }
  }, [pathname, autoGenerate, memoizedCustomItems, memoizedGenerationOptions, trackAnalytics, validateOnUpdate, context.setItems, onBreadcrumbChange]);

  // Memoized current page
  const currentPage = useMemo(() => {
    return context.items.find(item => item.isCurrentPage) || null;
  }, [context.items]);

  // Enhanced breadcrumb management functions
  const setBreadcrumbs = useCallback((items: BreadcrumbItem[]) => {
    if (validateOnUpdate) {
      const validation = validateBreadcrumbs(items);
      if (!validation.isValid) {
        console.warn('Setting invalid breadcrumbs:', validation.errors);
      }
    }
    context.setItems(items);
    if (onBreadcrumbChange) {
      onBreadcrumbChange(items);
    }
  }, [context, validateOnUpdate, onBreadcrumbChange]);

  const addBreadcrumb = useCallback((item: BreadcrumbItem) => {
    context.addItem(item);
    if (onBreadcrumbChange) {
      onBreadcrumbChange([...context.items, item]);
    }
  }, [context, onBreadcrumbChange]);

  const updateBreadcrumb = useCallback((id: string, updates: Partial<BreadcrumbItem>) => {
    context.updateItem(id, updates);
    const updatedItems = updateBreadcrumbItems(context.items, [{ id, ...updates }]);
    if (onBreadcrumbChange) {
      onBreadcrumbChange(updatedItems);
    }
  }, [context, onBreadcrumbChange]);

  const removeBreadcrumb = useCallback((id: string) => {
    context.removeItem(id);
    const updatedItems = removeBreadcrumbItem(context.items, id);
    if (onBreadcrumbChange) {
      onBreadcrumbChange(updatedItems);
    }
  }, [context, onBreadcrumbChange]);

  const clearBreadcrumbs = useCallback(() => {
    context.clearItems();
    if (onBreadcrumbChange) {
      onBreadcrumbChange([]);
    }
  }, [context, onBreadcrumbChange]);

  // Utility functions
  const regenerateBreadcrumbs = useCallback(() => {
    if (pathname) {
      const generatedItems = generateBreadcrumbsFromPath(pathname, {
        routeConfig: breadcrumbRouteConfig,
        ...generationOptions,
      });
      setBreadcrumbs(generatedItems);
    }
  }, [pathname, generationOptions, setBreadcrumbs]);

  const insertCustomItem = useCallback((item: BreadcrumbItem, position?: number) => {
    const updatedItems = insertBreadcrumbItem(context.items, item, position);
    setBreadcrumbs(updatedItems);
  }, [context.items, setBreadcrumbs]);

  const validateCurrentBreadcrumbs = useCallback(() => {
    return validateBreadcrumbs(context.items);
  }, [context.items]);

  const getAnalytics = useCallback(() => {
    return generateBreadcrumbAnalytics(context.items, pathname);
  }, [context.items, pathname]);

  const setMaxItems = useCallback((max: number) => {
    context.setMaxItems(max);
  }, [context]);

  return {
    // Current state
    items: context.items,
    isReady: context.isReady,

    // Navigation
    currentPage,
    canGoBack: context.canGoBack,
    goBack: context.goBack,

    // Management
    setBreadcrumbs,
    addBreadcrumb,
    updateBreadcrumb,
    removeBreadcrumb,
    clearBreadcrumbs,

    // Utilities
    regenerateBreadcrumbs,
    insertCustomItem,
    validateCurrentBreadcrumbs,

    // Analytics
    getAnalytics,

    // Configuration
    setMaxItems,
    maxItems: context.maxItems,
  };
};

/**
 * Hook for manual breadcrumb management without auto-generation
 */
export const useBreadcrumbsManual = (): Omit<UseBreadcrumbsReturn, 'regenerateBreadcrumbs'> => {
  const result = useBreadcrumbs({ autoGenerate: false });
  const { regenerateBreadcrumbs, ...rest } = result;
  return rest;
};

/**
 * Hook that only provides read-only breadcrumb state
 */
export const useBreadcrumbsReadOnly = () => {
  const context = useBreadcrumbContextOptional();
  const pathname = usePathname();

  const currentPage = useMemo(() => {
    return context?.items.find(item => item.isCurrentPage) || null;
  }, [context?.items]);

  return {
    items: context?.items || [],
    isReady: context?.isReady || false,
    currentPage,
    canGoBack: context?.canGoBack || false,
    maxItems: context?.maxItems || 4,
    pathname,
  };
};

/**
 * Hook for setting custom breadcrumbs for specific pages
 */
export const useCustomBreadcrumbs = (customItems: BreadcrumbItem[]) => {
  const { setBreadcrumbs, items, isReady } = useBreadcrumbs({
    autoGenerate: false,
    customItems,
  });

  useEffect(() => {
    if (isReady && customItems.length > 0) {
      setBreadcrumbs(customItems);
    }
  }, [customItems, setBreadcrumbs, isReady]);

  return { items, isReady };
};

/**
 * Hook for pages that need specific breadcrumb behavior
 */
export const useBreadcrumbPage = (
  pageTitle: string,
  parentPath?: string,
  options: Partial<UseBreadcrumbsOptions> = {}
) => {
  const pathname = usePathname();
  const breadcrumbs = useBreadcrumbs({
    autoGenerate: true,
    customTitles: {
      [pathname]: pageTitle,
    },
    ...options,
  });

  // Update current page title if it differs
  useEffect(() => {
    if (breadcrumbs.isReady && breadcrumbs.currentPage?.title !== pageTitle) {
      breadcrumbs.updateBreadcrumb(breadcrumbs.currentPage?.id || pathname, {
        title: pageTitle,
      });
    }
  }, [breadcrumbs, pageTitle, pathname]);

  return breadcrumbs;
};

/**
 * Hook for dynamic routes that need parameter-based titles
 * Note: titleResolver functionality removed to prevent function serialization errors
 */
export const useDynamicBreadcrumbs = (
  customTitle?: string,
  dependencies: any[] = []
) => {
  const pathname = usePathname();
  const breadcrumbs = useBreadcrumbs({ autoGenerate: true });

  // Memoize dependencies to prevent infinite loops
  const memoizedDependencies = useMemo(() => dependencies, [
    JSON.stringify(dependencies)
  ]);

  useEffect(() => {
    if (customTitle && breadcrumbs.currentPage) {
      breadcrumbs.updateBreadcrumb(breadcrumbs.currentPage.id, {
        title: customTitle,
      });
    }
  }, [breadcrumbs.currentPage, breadcrumbs.updateBreadcrumb, customTitle, pathname]);

  // Regenerate when dependencies change (with memoized dependencies)
  useEffect(() => {
    if (memoizedDependencies.length > 0) {
      breadcrumbs.regenerateBreadcrumbs();
    }
  }, [breadcrumbs.regenerateBreadcrumbs, memoizedDependencies]);

  return breadcrumbs;
};

// Default export removed to prevent conflict with named export