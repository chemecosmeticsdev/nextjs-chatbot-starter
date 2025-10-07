/**
 * Route Helper Utilities
 * Provides utilities for route management, validation, and manipulation
 */

export interface RouteConfig {
  path: string
  name: string
  component?: string
  permissions?: string[]
  params?: Record<string, string>
}

export interface RouteParams {
  [key: string]: string | string[]
}

export interface RouteMatch {
  matched: boolean
  params?: RouteParams
  query?: Record<string, string>
}

/**
 * Validates if a route path is correctly formatted
 */
export function validateRoute(path: string, options?: { maxLength?: number }): boolean {
  if (!path || typeof path !== 'string') {
    return false
  }

  // Check max length if specified
  if (options?.maxLength && path.length > options.maxLength) {
    return false
  }

  // Must start with /
  if (!path.startsWith('/')) {
    return false
  }

  // Allow more characters including Unicode for internationalization
  // Allow alphanumeric, dash, underscore, slash, colon for params, dots, spaces, and Unicode
  const validRouteRegex = /^\/[\w\-_/:.\s\u00a0-\uffff]*$/
  return validRouteRegex.test(path)
}

/**
 * Builds a URL with parameters
 */
export function buildUrl(
  basePath: string,
  params?: Record<string, string | number>,
  query?: Record<string, string | number>
): string {
  let url = basePath

  // Replace path parameters
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, String(value))
    })
  }

  // Add query parameters
  if (query) {
    const queryString = new URLSearchParams(
      Object.entries(query).reduce((acc, [key, value]) => {
        acc[key] = String(value)
        return acc
      }, {} as Record<string, string>)
    ).toString()

    if (queryString) {
      url += `?${queryString}`
    }
  }

  return url
}

/**
 * Extracts parameters from a route path
 */
export function getRouteParams(
  pattern: string,
  path: string
): RouteParams | null {
  const params: RouteParams = {}

  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/:[^/]+/g, '([^/]+)')
    .replace(/\*/g, '(.*)')

  const regex = new RegExp(`^${regexPattern}$`)
  const match = path.match(regex)

  if (!match) {
    return null
  }

  // Extract parameter names from pattern
  const paramNames = pattern.match(/:[^/]+/g)?.map(p => p.slice(1)) || []

  // Map matched groups to parameter names
  paramNames.forEach((name, index) => {
    params[name] = match[index + 1]
  })

  return params
}

/**
 * Checks if a path matches a route pattern
 */
export function matchRoute(pattern: string, path: string): RouteMatch {
  const params = getRouteParams(pattern, path)

  if (params === null) {
    return { matched: false }
  }

  // Extract query parameters from path
  const [pathname, search] = path.split('?')
  const query: Record<string, string> = {}

  if (search) {
    const searchParams = new URLSearchParams(search)
    searchParams.forEach((value, key) => {
      query[key] = value
    })
  }

  return {
    matched: true,
    params,
    query
  }
}

/**
 * Generates a unique route ID
 */
export function generateRouteId(path: string): string {
  return path
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Gets route hierarchy from a path
 */
export function getRouteHierarchy(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  const hierarchy: string[] = []

  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`
    hierarchy.push(currentPath)
  }

  return hierarchy
}

/**
 * Normalizes a route path
 */
export function normalizeRoute(path: string): string {
  // Remove trailing slash except for root
  let normalized = path === '/' ? path : path.replace(/\/$/, '')

  // Ensure leading slash
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  // Remove double slashes
  normalized = normalized.replace(/\/+/g, '/')

  return normalized
}

/**
 * Gets permissions required for a route
 */
export function getRoutePermissions(
  path: string,
  routes: RouteConfig[]
): string[] {
  const route = routes.find(r => matchRoute(r.path, path).matched)
  return route?.permissions || []
}

/**
 * Checks if user has permission to access a route
 */
export function hasRoutePermission(
  path: string,
  userPermissions: string[],
  routes: RouteConfig[]
): boolean {
  const requiredPermissions = getRoutePermissions(path, routes)

  if (requiredPermissions.length === 0) {
    return true // No permissions required
  }

  return requiredPermissions.some(permission =>
    userPermissions.includes(permission)
  )
}

/**
 * Gets the parent route path
 */
export function getParentRoute(path: string): string | null {
  const segments = path.split('/').filter(Boolean)

  if (segments.length <= 1) {
    return null // Root or single segment has no parent
  }

  return `/${segments.slice(0, -1).join('/')}`
}

/**
 * Gets all child routes for a given path
 */
export function getChildRoutes(
  parentPath: string,
  allRoutes: string[]
): string[] {
  const normalizedParent = normalizeRoute(parentPath)

  return allRoutes.filter(route => {
    const normalizedRoute = normalizeRoute(route)
    return (
      normalizedRoute.startsWith(normalizedParent) &&
      normalizedRoute !== normalizedParent &&
      !normalizedRoute.slice(normalizedParent.length + 1).includes('/')
    )
  })
}

/**
 * Converts route path to breadcrumb format
 */
export function routeToBreadcrumbs(path: string): Array<{ name: string; path: string }> {
  const segments = path.split('/').filter(Boolean)
  const breadcrumbs: Array<{ name: string; path: string }> = []

  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`

    // Convert segment to readable name
    const name = segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())

    breadcrumbs.push({
      name,
      path: currentPath
    })
  }

  return breadcrumbs
}

/**
 * Sanitizes route parameters
 */
export function sanitizeRouteParams(params: Record<string, any>): Record<string, string> {
  const sanitized: Record<string, string> = {}

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      sanitized[key] = String(value).trim()
    }
  })

  return sanitized
}

/**
 * Checks if a route is active based on current path
 */
export function isActiveRoute(
  routePath: string,
  currentPath: string,
  exact: boolean = false
): boolean {
  const normalizedRoute = normalizeRoute(routePath)
  const normalizedCurrent = normalizeRoute(currentPath)

  if (exact) {
    return normalizedRoute === normalizedCurrent
  }

  return normalizedCurrent.startsWith(normalizedRoute)
}

/**
 * Parse route into components
 */
export function parseRoute(path: string): {
  segments: string[]
  params: string[]
  query: Record<string, string>
  hash: string
} {
  const [pathname, search] = path.split('?')
  const [pathPart, hash] = pathname.split('#')

  const segments = pathPart.split('/').filter(Boolean)
  const params = segments.filter(segment => segment.startsWith(':'))

  const query: Record<string, string> = {}
  if (search) {
    const searchParams = new URLSearchParams(search)
    searchParams.forEach((value, key) => {
      query[key] = value
    })
  }

  return {
    segments,
    params,
    query,
    hash: hash || ''
  }
}

/**
 * Gets route metadata
 */
export function getRouteMetadata(path: string): {
  segments: string[]
  depth: number
  isRoot: boolean
  hasParams: boolean
  paramCount: number
  title?: string
  description?: string
  layout?: string
  permissions?: string[]
  complexity?: string
  parentRoute?: string
  possibleChildRoutes?: string[]
} {
  const segments = path.split('/').filter(Boolean)
  const paramCount = (path.match(/:[^/]+/g) || []).length

  // Find matching route config
  const routeConfig = DEFAULT_ROUTES.find(route => matchRoute(route.path, path).matched)

  // Determine complexity based on depth and params
  let complexity = 'low'
  if (segments.length > 3 || paramCount > 1) {
    complexity = 'high'
  } else if (segments.length > 1 || paramCount === 1) {
    complexity = 'medium'
  }

  // Find parent route
  const parentRoute = getParentRoute(path)

  // Find possible child routes (simplified)
  const possibleChildRoutes = DEFAULT_ROUTES
    .filter(route => route.path.startsWith(path) && route.path !== path)
    .map(route => route.path)

  return {
    segments,
    depth: segments.length,
    isRoot: path === '/',
    hasParams: paramCount > 0,
    paramCount,
    title: routeConfig?.name,
    description: routeConfig?.name ? `${routeConfig.name} page` : undefined,
    layout: 'default',
    permissions: routeConfig?.permissions || [],
    complexity,
    parentRoute,
    possibleChildRoutes
  }
}

/**
 * Default route configurations
 */
export const DEFAULT_ROUTES: RouteConfig[] = [
  { path: '/', name: 'Home' },
  { path: '/dashboard', name: 'Dashboard', permissions: ['dashboard.view'] },
  { path: '/dashboard/analytics', name: 'Analytics', permissions: ['analytics.view'] },
  { path: '/dashboard/chatbots', name: 'Chatbots', permissions: ['chatbots.view'] },
  { path: '/dashboard/chatbots/:id', name: 'Chatbot Details', permissions: ['chatbots.view'] },
  { path: '/dashboard/chatbots/:id/settings', name: 'Chatbot Settings', permissions: ['chatbots.edit'] },
  { path: '/chat', name: 'Chat' },
  { path: '/chat/:conversationId', name: 'Conversation' },
  { path: '/settings', name: 'Settings', permissions: ['settings.view'] },
  { path: '/admin', name: 'Admin', permissions: ['admin.access'] }
]