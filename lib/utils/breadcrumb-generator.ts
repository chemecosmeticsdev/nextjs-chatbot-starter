import { BreadcrumbItem, RouteConfig } from '@/lib/context/breadcrumb-context';
import {
  findRouteByPath,
  matchDynamicRoute,
  extractDynamicParams,
  getRouteHierarchy,
  breadcrumbRouteConfig,
} from '@/lib/config/breadcrumb-routes';

export interface BreadcrumbGenerationOptions {
  routeConfig?: RouteConfig;
  maxItems?: number;
  includeHome?: boolean;
  customTitles?: Record<string, string>;
  metadata?: Record<string, any>;
}

/**
 * Generate breadcrumbs from a given pathname
 */
export const generateBreadcrumbsFromPath = (
  pathname: string,
  options: BreadcrumbGenerationOptions = {}
): BreadcrumbItem[] => {
  const {
    routeConfig = breadcrumbRouteConfig,
    maxItems = 5,
    includeHome = true,
    customTitles = {},
    metadata = {},
  } = options;

  const breadcrumbs: BreadcrumbItem[] = [];

  // Always include home/dashboard if enabled
  if (includeHome && pathname !== routeConfig.homeRoute) {
    breadcrumbs.push({
      id: 'home',
      title: customTitles[routeConfig.homeRoute] || routeConfig.defaultTitle,
      href: routeConfig.homeRoute,
      isCurrentPage: false,
      metadata: { ...metadata, isHome: true },
    });
  }

  // Handle home route specifically
  if (pathname === routeConfig.homeRoute) {
    return [{
      id: 'home',
      title: customTitles[routeConfig.homeRoute] || routeConfig.defaultTitle,
      href: routeConfig.homeRoute,
      isCurrentPage: true,
      metadata: { ...metadata, isHome: true },
    }];
  }

  // Get route hierarchy for the current path
  const hierarchy = getRouteHierarchy(pathname);

  if (hierarchy.length === 0) {
    // Fallback: generate breadcrumbs from path segments
    return generateFallbackBreadcrumbs(pathname, routeConfig, customTitles, metadata);
  }

  // Generate breadcrumbs from hierarchy
  for (let i = 0; i < hierarchy.length; i++) {
    const route = hierarchy[i];
    const isLast = i === hierarchy.length - 1;

    // Extract dynamic parameters if route is dynamic
    const dynamicParams = route.dynamic
      ? extractDynamicParams(route.path, pathname)
      : {};

    // Use custom titles or fallback to route title
    let title = customTitles[route.path] || route.title;

    const breadcrumbItem: BreadcrumbItem = {
      id: route.path,
      title,
      href: route.dynamic ? pathname : route.path,
      isCurrentPage: isLast,
      icon: route.icon,
      metadata: {
        ...metadata,
        routeType: route.dynamic ? 'dynamic' : 'static',
        dynamicParams: route.dynamic ? dynamicParams : undefined,
        hierarchyLevel: i,
      },
    };

    // Skip home if already added and this is the dashboard route
    if (includeHome && route.path === routeConfig.homeRoute) {
      continue;
    }

    breadcrumbs.push(breadcrumbItem);
  }

  // Trim to max items if specified
  if (maxItems > 0 && breadcrumbs.length > maxItems) {
    const currentPage = breadcrumbs[breadcrumbs.length - 1];
    const trimmedBreadcrumbs = breadcrumbs.slice(0, 1); // Keep home

    if (breadcrumbs.length > maxItems + 1) {
      // Add ellipsis indicator
      trimmedBreadcrumbs.push({
        id: 'ellipsis',
        title: '...',
        href: '#',
        isCurrentPage: false,
        metadata: { ...metadata, isEllipsis: true },
      });
    }

    // Add the last few items
    const itemsToShow = Math.max(1, maxItems - 2); // Reserve space for home and ellipsis
    const lastItems = breadcrumbs.slice(-itemsToShow);
    trimmedBreadcrumbs.push(...lastItems);

    return trimmedBreadcrumbs;
  }

  return breadcrumbs;
};

/**
 * Fallback breadcrumb generation for unknown routes
 */
const generateFallbackBreadcrumbs = (
  pathname: string,
  routeConfig: RouteConfig,
  customTitles: Record<string, string>,
  metadata: Record<string, any>
): BreadcrumbItem[] => {
  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  // Always start with home
  breadcrumbs.push({
    id: 'home',
    title: customTitles[routeConfig.homeRoute] || routeConfig.defaultTitle,
    href: routeConfig.homeRoute,
    isCurrentPage: false,
    metadata: { ...metadata, isHome: true, isFallback: true },
  });

  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    const isLast = i === segments.length - 1;
    const segment = segments[i];

    // Try to find a known route for this path
    const knownRoute = findRouteByPath(currentPath);

    let title = customTitles[currentPath] ||
                (knownRoute ? knownRoute.title : formatSegmentTitle(segment));

    breadcrumbs.push({
      id: currentPath,
      title,
      href: currentPath,
      isCurrentPage: isLast,
      icon: knownRoute?.icon,
      metadata: {
        ...metadata,
        isFallback: true,
        segment,
        segmentIndex: i,
      },
    });
  }

  return breadcrumbs;
};

/**
 * Format a URL segment into a readable title
 */
const formatSegmentTitle = (segment: string): string => {
  // Handle UUIDs and hashes
  if (segment.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
    return `ID: ${segment.slice(0, 8)}...`;
  }

  // Handle other hash-like segments
  if (segment.length > 20 && segment.match(/^[a-zA-Z0-9]+$/)) {
    return `${segment.slice(0, 8)}...`;
  }

  // Convert kebab-case and snake_case to Title Case
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};

/**
 * Update existing breadcrumbs with new data
 */
export const updateBreadcrumbItems = (
  currentItems: BreadcrumbItem[],
  updates: Partial<BreadcrumbItem> & { id: string }[]
): BreadcrumbItem[] => {
  const updatedItems = [...currentItems];

  updates.forEach(update => {
    const index = updatedItems.findIndex(item => item.id === update.id);
    if (index !== -1) {
      updatedItems[index] = { ...updatedItems[index], ...update };
    }
  });

  return updatedItems;
};

/**
 * Add custom breadcrumb item at specific position
 */
export const insertBreadcrumbItem = (
  currentItems: BreadcrumbItem[],
  newItem: BreadcrumbItem,
  position: number = -1
): BreadcrumbItem[] => {
  const items = [...currentItems];

  // Update isCurrentPage flags
  items.forEach(item => {
    item.isCurrentPage = false;
  });

  if (position === -1 || position >= items.length) {
    // Add to end
    newItem.isCurrentPage = true;
    items.push(newItem);
  } else {
    // Insert at position
    items.splice(position, 0, newItem);

    // Update current page if this is the last item
    if (position === items.length - 1) {
      newItem.isCurrentPage = true;
    }
  }

  return items;
};

/**
 * Remove breadcrumb item by ID
 */
export const removeBreadcrumbItem = (
  currentItems: BreadcrumbItem[],
  itemId: string
): BreadcrumbItem[] => {
  return currentItems.filter(item => item.id !== itemId);
};

/**
 * Validate breadcrumb structure
 */
export const validateBreadcrumbs = (items: BreadcrumbItem[]): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (items.length === 0) {
    errors.push('Breadcrumb list is empty');
  }

  // Check for duplicate IDs
  const ids = items.map(item => item.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate breadcrumb IDs found: ${duplicateIds.join(', ')}`);
  }

  // Check for multiple current pages
  const currentPages = items.filter(item => item.isCurrentPage);
  if (currentPages.length > 1) {
    errors.push('Multiple breadcrumb items marked as current page');
  }

  // Check for empty titles
  const emptyTitles = items.filter(item => !item.title || item.title.trim() === '');
  if (emptyTitles.length > 0) {
    errors.push('Some breadcrumb items have empty titles');
  }

  // Check for invalid hrefs
  const invalidHrefs = items.filter(item => !item.href || item.href.trim() === '');
  if (invalidHrefs.length > 0) {
    errors.push('Some breadcrumb items have invalid hrefs');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Generate breadcrumb analytics data
 */
export const generateBreadcrumbAnalytics = (
  items: BreadcrumbItem[],
  pathname: string,
  userAgent?: string
): {
  breadcrumbPath: string[];
  hierarchyDepth: number;
  dynamicSegments: number;
  fallbackSegments: number;
  currentRoute: string;
  timestamp: string;
  userAgent?: string;
} => {
  const breadcrumbPath = items.map(item => item.title);
  const hierarchyDepth = items.length;
  const dynamicSegments = items.filter(item =>
    item.metadata?.routeType === 'dynamic'
  ).length;
  const fallbackSegments = items.filter(item =>
    item.metadata?.isFallback === true
  ).length;

  return {
    breadcrumbPath,
    hierarchyDepth,
    dynamicSegments,
    fallbackSegments,
    currentRoute: pathname,
    timestamp: new Date().toISOString(),
    userAgent,
  };
};

/**
 * Export utilities for easy access
 */
export const breadcrumbUtils = {
  generateBreadcrumbsFromPath,
  updateBreadcrumbItems,
  insertBreadcrumbItem,
  removeBreadcrumbItem,
  validateBreadcrumbs,
  generateBreadcrumbAnalytics,
  formatSegmentTitle,
};

export default breadcrumbUtils;