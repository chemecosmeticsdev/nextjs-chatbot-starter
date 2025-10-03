import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService, ApiKeyData } from '@/lib/security/api-keys';
import { AuthTokenService, SessionData } from '@/lib/auth';

export interface ApiAuthOptions {
  requiredScopes?: string[];
  allowSessionAuth?: boolean; // Allow both API key and session auth
  requireApiKey?: boolean; // Force API key auth only
}

export interface AuthResult {
  success: boolean;
  user?: SessionData | ApiKeyData;
  authType: 'session' | 'api_key' | 'none';
  error?: string;
}

/**
 * Middleware for API authentication with support for both JWT sessions and API keys
 */
export function withApiAuth(options: ApiAuthOptions = {}) {
  return async function apiAuthMiddleware(
    request: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const authResult = await authenticateRequest(request, options);

    if (!authResult.success) {
      return NextResponse.json(
        {
          error: authResult.error || 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        },
        { status: 401 }
      );
    }

    // Add auth info to request headers for downstream handlers
    const response = await next();

    // Add authentication info to response headers
    response.headers.set('X-Auth-Type', authResult.authType);
    if (authResult.user) {
      if (authResult.authType === 'session') {
        response.headers.set('X-Auth-User-ID', (authResult.user as SessionData).userId);
      } else if (authResult.authType === 'api_key') {
        response.headers.set('X-Auth-User-ID', (authResult.user as ApiKeyData).userId);
        response.headers.set('X-Auth-API-Key-ID', (authResult.user as ApiKeyData).id);
      }
    }

    return response;
  };
}

/**
 * Authenticate a request using API key or JWT session
 */
export async function authenticateRequest(
  request: NextRequest,
  options: ApiAuthOptions = {}
): Promise<AuthResult> {
  const { allowSessionAuth = true, requireApiKey = false, requiredScopes = [] } = options;

  // Try API key authentication first
  const apiKeyResult = await tryApiKeyAuth(request, requiredScopes);
  if (apiKeyResult.success) {
    return apiKeyResult;
  }

  // If API key is required, don't fallback to session auth
  if (requireApiKey) {
    return { success: false, authType: 'none', error: 'API key required' };
  }

  // Try session authentication if allowed
  if (allowSessionAuth) {
    const sessionResult = await trySessionAuth(request);
    if (sessionResult.success) {
      return sessionResult;
    }
  }

  return { success: false, authType: 'none', error: 'Authentication failed' };
}

/**
 * Try to authenticate using API key
 */
async function tryApiKeyAuth(
  request: NextRequest,
  requiredScopes: string[] = []
): Promise<AuthResult> {
  try {
    // Check for API key in headers
    const apiKey =
      request.headers.get('x-api-key') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/, '');

    if (!apiKey) {
      return { success: false, authType: 'none', error: 'No API key provided' };
    }

    // Validate API key
    const validation = await ApiKeyService.validateApiKey(apiKey);
    if (!validation.valid || !validation.apiKey) {
      return {
        success: false,
        authType: 'none',
        error: validation.error || 'Invalid API key'
      };
    }

    // Check required scopes if any
    if (requiredScopes.length > 0) {
      const hasRequiredScope = ApiKeyService.hasAnyScope(validation.apiKey, requiredScopes);
      if (!hasRequiredScope) {
        return {
          success: false,
          authType: 'api_key',
          error: `Insufficient scopes. Required: ${requiredScopes.join(', ')}`,
        };
      }
    }

    return {
      success: true,
      authType: 'api_key',
      user: validation.apiKey,
    };
  } catch (error) {
    console.error('API key authentication error:', error);
    return { success: false, authType: 'none', error: 'Authentication failed' };
  }
}

/**
 * Try to authenticate using JWT session
 */
async function trySessionAuth(request: NextRequest): Promise<AuthResult> {
  try {
    const session = await AuthTokenService.verifyRequest(request);
    if (!session) {
      return { success: false, authType: 'none', error: 'Invalid session' };
    }

    return {
      success: true,
      authType: 'session',
      user: session,
    };
  } catch (error) {
    console.error('Session authentication error:', error);
    return { success: false, authType: 'none', error: 'Session validation failed' };
  }
}

/**
 * Extract user ID from authenticated request
 */
export function getUserId(authResult: AuthResult): string | null {
  if (!authResult.success || !authResult.user) {
    return null;
  }

  if (authResult.authType === 'session') {
    return (authResult.user as SessionData).userId;
  } else if (authResult.authType === 'api_key') {
    return (authResult.user as ApiKeyData).userId;
  }

  return null;
}

/**
 * Check if authenticated user has required role
 */
export function hasRole(authResult: AuthResult, requiredRole: string): boolean {
  if (!authResult.success || !authResult.user) {
    return false;
  }

  if (authResult.authType === 'session') {
    const session = authResult.user as SessionData;
    return session.role === requiredRole || session.role === 'super_admin';
  }

  // For API keys, we can't check user role directly, but we can check scopes
  return false;
}

/**
 * Check if authenticated request has any of the required roles
 */
export function hasAnyRole(authResult: AuthResult, requiredRoles: string[]): boolean {
  return requiredRoles.some(role => hasRole(authResult, role));
}

/**
 * Create a higher-order function for API route protection
 */
export function createProtectedHandler<T = any>(
  handler: (request: NextRequest, auth: AuthResult) => Promise<NextResponse>,
  options?: ApiAuthOptions
) {
  const middleware = withApiAuth(options);

  return async (request: NextRequest, context?: T) => {
    return middleware(request, async () => {
      const authResult = await authenticateRequest(request, options);
      return handler(request, authResult);
    });
  };
}

/**
 * Require specific API scopes for endpoint access
 */
export function requireScopes(scopes: string[]) {
  return (options: ApiAuthOptions = {}): ApiAuthOptions => ({
    ...options,
    requiredScopes: [...(options.requiredScopes || []), ...scopes],
  });
}

/**
 * Require API key authentication (no session fallback)
 */
export function requireApiKey(options: ApiAuthOptions = {}): ApiAuthOptions {
  return {
    ...options,
    requireApiKey: true,
    allowSessionAuth: false,
  };
}

/**
 * Allow both session and API key authentication
 */
export function allowBothAuth(options: ApiAuthOptions = {}): ApiAuthOptions {
  return {
    ...options,
    allowSessionAuth: true,
    requireApiKey: false,
  };
}