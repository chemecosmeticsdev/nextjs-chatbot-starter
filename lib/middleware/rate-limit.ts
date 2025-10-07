import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter, getClientIdentifier, RateLimitResult, rateLimiters as securityRateLimiters } from '@/lib/security/rate-limiter';
import { AuthTokenService } from '@/lib/auth';

export interface RateLimitOptions {
  rateLimiter: RateLimiter;
  keyGenerator?: (request: NextRequest, userId?: string) => string;
  skip?: (request: NextRequest) => boolean;
  onLimitReached?: (request: NextRequest, result: RateLimitResult) => NextResponse;
  includeHeaders?: boolean;
}

/**
 * Rate limiting middleware for API routes
 */
export function withRateLimit(options: RateLimitOptions) {
  return async function rateLimitMiddleware(
    request: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    try {
      // Skip rate limiting if condition is met
      if (options.skip && options.skip(request)) {
        return await next();
      }

      // Get user ID from session if available
      let userId: string | undefined;
      try {
        const session = await AuthTokenService.verifyRequest(request);
        userId = session?.userId;
      } catch (error) {
        // Continue without user ID if session verification fails
      }

      // Generate identifier for rate limiting
      const identifier = options.keyGenerator
        ? options.keyGenerator(request, userId)
        : getClientIdentifier(request, userId);

      // Check rate limit
      const result = await options.rateLimiter.checkLimit(identifier);

      // Add rate limit headers if enabled
      const response = result.allowed ? await next() : createRateLimitResponse(result);

      if (options.includeHeaders !== false) {
        addRateLimitHeaders(response, result);
      }

      return response;
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Fail open - allow request if rate limiting fails
      return await next();
    }
  };
}

/**
 * Create a rate limit exceeded response
 */
function createRateLimitResponse(result: RateLimitResult): NextResponse {
  const response = NextResponse.json(
    {
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      limit: result.limit,
      remaining: result.remaining,
      resetTime: result.resetTime,
      retryAfter: result.retryAfter,
    },
    { status: 429 }
  );

  if (result.retryAfter) {
    response.headers.set('Retry-After', result.retryAfter.toString());
  }

  return response;
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(response: NextResponse, result: RateLimitResult): void {
  response.headers.set('X-RateLimit-Limit', result.limit.toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

  if (result.retryAfter) {
    response.headers.set('X-RateLimit-RetryAfter', result.retryAfter.toString());
  }
}

/**
 * Utility function to apply rate limiting to an API route handler
 */
export function applyRateLimit(rateLimiter: RateLimiter, options?: Partial<RateLimitOptions>) {
  const fullOptions: RateLimitOptions = {
    rateLimiter,
    includeHeaders: true,
    ...options,
  };

  return (handler: (request: NextRequest) => Promise<NextResponse>) => {
    return withRateLimit(fullOptions)(request, () => handler(request));
  };
}

/**
 * Create a higher-order function for API route protection
 */
export function createRateLimitedHandler(
  rateLimiter: RateLimiter,
  handler: (request: NextRequest) => Promise<NextResponse>,
  options?: Partial<RateLimitOptions>
) {
  const middleware = withRateLimit({
    rateLimiter,
    includeHeaders: true,
    ...options,
  });

  return async (request: NextRequest) => {
    return middleware(request, () => handler(request));
  };
}

/**
 * Skip rate limiting for specific user roles
 */
export function skipForRoles(roles: string[]) {
  return async (request: NextRequest): Promise<boolean> => {
    try {
      const session = await AuthTokenService.verifyRequest(request);
      return session ? roles.includes(session.role) : false;
    } catch (error) {
      return false;
    }
  };
}

/**
 * Skip rate limiting for specific IP addresses (whitelist)
 */
export function skipForIPs(allowedIPs: string[]) {
  return (request: NextRequest): boolean => {
    const clientIP = getClientIdentifier(request).split(':')[0];
    return allowedIPs.includes(clientIP);
  };
}

/**
 * Custom key generator that includes endpoint path for more granular limiting
 */
export function pathBasedKeyGenerator(request: NextRequest, userId?: string): string {
  const path = new URL(request.url).pathname;
  const baseIdentifier = getClientIdentifier(request, userId);
  return `${baseIdentifier}:${path}`;
}

/**
 * Custom key generator for API key-based requests
 */
export function apiKeyBasedGenerator(request: NextRequest): string {
  const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  if (apiKey) {
    return `api-key:${apiKey}`;
  }
  return getClientIdentifier(request);
}

/**
 * Re-export rate limiters from security module for compatibility
 */
export const rateLimiters = securityRateLimiters;

/**
 * Rate limit middleware function for API routes
 * Compatible with existing usage patterns
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  limitType: keyof typeof rateLimiters = 'api'
): Promise<{ success: boolean; error?: string }> {
  try {
    const rateLimiter = rateLimiters[limitType];
    if (!rateLimiter) {
      console.error(`Unknown rate limiter type: ${String(limitType)}`);
      return { success: true }; // Fail open
    }

    // Get user ID from session if available
    let userId: string | undefined;
    try {
      const session = await AuthTokenService.verifyRequest(request);
      userId = session?.userId;
    } catch (error) {
      // Continue without user ID if session verification fails
    }

    // Generate identifier for rate limiting
    const identifier = getClientIdentifier(request, userId);

    // Check rate limit
    const result = await rateLimiter.checkLimit(identifier);

    return {
      success: result.allowed,
      error: result.allowed ? undefined : 'Rate limit exceeded'
    };
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // Fail open - allow request if rate limiting fails
    return { success: true };
  }
}