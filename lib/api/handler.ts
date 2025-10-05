import { NextRequest, NextResponse } from 'next/server';
import { cache, CacheKeys } from '@/lib/services/cache-service';
import { z } from 'zod';

// Standard API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
}

// Standard error codes
export const ErrorCodes = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMIT',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',

  // Business logic errors
  CHATBOT_NOT_FOUND: 'CHATBOT_NOT_FOUND',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  DOCUMENT_PROCESSING_ERROR: 'DOCUMENT_PROCESSING_ERROR',
  VECTOR_SEARCH_ERROR: 'VECTOR_SEARCH_ERROR'
} as const;

// HTTP status code mappings
const statusCodeMap: Record<string, number> = {
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.INVALID_REQUEST]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.RATE_LIMIT]: 429,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.EXTERNAL_API_ERROR]: 502,
  [ErrorCodes.CACHE_ERROR]: 500,
  [ErrorCodes.CHATBOT_NOT_FOUND]: 404,
  [ErrorCodes.CONVERSATION_NOT_FOUND]: 404,
  [ErrorCodes.DOCUMENT_PROCESSING_ERROR]: 422,
  [ErrorCodes.VECTOR_SEARCH_ERROR]: 500
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.statusCode = statusCode || statusCodeMap[code] || 500;
  }
}

// Middleware types
export type ApiMiddleware = (
  request: NextRequest,
  context: ApiContext
) => Promise<void | NextResponse>;

export interface ApiContext {
  requestId: string;
  startTime: number;
  userId?: string;
  chatbotId?: string;
  params: Record<string, string>;
  query: Record<string, string>;
  [key: string]: any;
}

// Handler configuration
export interface HandlerConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  validation?: {
    params?: z.ZodSchema;
    query?: z.ZodSchema;
    body?: z.ZodSchema;
  };
  auth?: {
    required: boolean;
    roles?: string[];
  };
  rateLimit?: {
    windowMs: number;
    max: number;
    keyGenerator?: (req: NextRequest) => string;
  };
  cache?: {
    ttl: number;
    keyGenerator?: (req: NextRequest, context: ApiContext) => string;
  };
  middleware?: ApiMiddleware[];
}

// Main API handler class
export class ApiHandler {
  private config: HandlerConfig;
  private handler: (request: NextRequest, context: ApiContext) => Promise<any>;

  constructor(
    config: HandlerConfig,
    handler: (request: NextRequest, context: ApiContext) => Promise<any>
  ) {
    this.config = config;
    this.handler = handler;
  }

  async handle(request: NextRequest, params?: Record<string, string>): Promise<NextResponse> {
    const context: ApiContext = {
      requestId: this.generateRequestId(),
      startTime: Date.now(),
      params: params || {},
      query: this.parseQuery(request.url)
    };

    try {
      // Method validation
      if (request.method !== this.config.method) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST,
          `Method ${request.method} not allowed. Expected ${this.config.method}`
        );
      }

      // Run middleware chain
      const middlewareResponse = await this.runMiddleware(request, context);
      if (middlewareResponse) {
        return middlewareResponse;
      }

      // Validation
      await this.validateRequest(request, context);

      // Check cache for GET requests
      if (this.config.method === 'GET' && this.config.cache) {
        const cacheKey = this.config.cache.keyGenerator
          ? this.config.cache.keyGenerator(request, context)
          : this.generateCacheKey(request, context);

        const cached = await cache.get(cacheKey);
        if (cached) {
          return this.createResponse(cached, context, 200, true);
        }

        // Store cache key in context for later use
        context.cacheKey = cacheKey;
      }

      // Execute main handler
      const result = await this.handler(request, context);

      // Cache successful GET responses
      if (this.config.method === 'GET' && this.config.cache && context.cacheKey) {
        await cache.set(context.cacheKey, result, this.config.cache.ttl);
      }

      return this.createResponse(result, context);

    } catch (error) {
      return this.handleError(error, context);
    }
  }

  private async runMiddleware(
    request: NextRequest,
    context: ApiContext
  ): Promise<NextResponse | void> {
    const middleware = [
      ...(this.config.middleware || []),
      ...(this.config.auth?.required ? [this.authMiddleware] : []),
      ...(this.config.rateLimit ? [this.rateLimitMiddleware] : [])
    ];

    for (const mw of middleware) {
      const response = await mw(request, context);
      if (response) {
        return response;
      }
    }
  }

  private async validateRequest(request: NextRequest, context: ApiContext): Promise<void> {
    const { validation } = this.config;
    if (!validation) return;

    // Validate URL parameters
    if (validation.params) {
      try {
        context.validatedParams = validation.params.parse(context.params);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid URL parameters',
            400,
            error.issues
          );
        }
        throw error;
      }
    }

    // Validate query parameters
    if (validation.query) {
      try {
        context.validatedQuery = validation.query.parse(context.query);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid query parameters',
            400,
            error.issues
          );
        }
        throw error;
      }
    }

    // Validate request body
    if (validation.body && ['POST', 'PUT', 'PATCH'].includes(this.config.method)) {
      try {
        const body = await request.json();
        context.validatedBody = validation.body.parse(body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid request body',
            400,
            error.issues
          );
        }
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST,
          'Invalid JSON in request body'
        );
      }
    }
  }

  private authMiddleware: ApiMiddleware = async (request, context) => {
    // TODO: Implement authentication logic
    // This would typically:
    // 1. Extract JWT token from Authorization header
    // 2. Verify token signature and expiration
    // 3. Extract user info and add to context
    // 4. Check user roles if specified in config

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(ErrorCodes.UNAUTHORIZED, 'Missing or invalid authorization header');
    }

    // Placeholder - in real implementation would verify JWT
    context.userId = 'user-123'; // Extract from token
  };

  private rateLimitMiddleware: ApiMiddleware = async (request, context) => {
    if (!this.config.rateLimit) return;

    const { windowMs, max, keyGenerator } = this.config.rateLimit;
    const key = keyGenerator
      ? keyGenerator(request)
      : `rate_limit:${this.getClientIP(request)}:${request.nextUrl.pathname}`;

    const current = await cache.increment(key, 1, Math.ceil(windowMs / 1000));

    if (current > max) {
      throw new ApiError(
        ErrorCodes.RATE_LIMIT,
        `Rate limit exceeded. Max ${max} requests per ${windowMs}ms`
      );
    }
  };

  private createResponse(
    data: any,
    context: ApiContext,
    status: number = 200,
    fromCache: boolean = false
  ): NextResponse {
    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: context.requestId,
        ...(fromCache && { cached: true })
      }
    };

    // Add performance metrics
    const duration = Date.now() - context.startTime;
    response.meta.duration = `${duration}ms`;

    return NextResponse.json(response, { status });
  }

  private handleError(error: unknown, context: ApiContext): NextResponse {
    console.error(`API Error [${context.requestId}]:`, error);

    let apiError: ApiError;

    if (error instanceof ApiError) {
      apiError = error;
    } else if (error instanceof z.ZodError) {
      apiError = new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        'Validation failed',
        400,
        error.issues
      );
    } else {
      apiError = new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        'An unexpected error occurred'
      );
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details && { details: apiError.details })
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: context.requestId,
        duration: `${Date.now() - context.startTime}ms`
      }
    };

    return NextResponse.json(response, { status: apiError.statusCode || 500 });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseQuery(url: string): Record<string, string> {
    const { searchParams } = new URL(url);
    const query: Record<string, string> = {};

    for (const [key, value] of searchParams.entries()) {
      query[key] = value;
    }

    return query;
  }

  private generateCacheKey(request: NextRequest, context: ApiContext): string {
    const url = new URL(request.url);
    const pathAndQuery = `${url.pathname}${url.search}`;
    return CacheKeys.apiResponse(pathAndQuery, JSON.stringify(context.params));
  }

  private getClientIP(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0] ||
           request.headers.get('x-real-ip') ||
           'unknown';
  }
}

// Helper function to create API handlers
export function createApiHandler(
  config: HandlerConfig,
  handler: (request: NextRequest, context: ApiContext) => Promise<any>
) {
  return new ApiHandler(config, handler);
}

// Common validation schemas
export const CommonSchemas = {
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  }),

  chatbotId: z.object({
    chatbotId: z.string().uuid('Invalid chatbot ID format')
  }),

  conversationId: z.object({
    conversationId: z.string().uuid('Invalid conversation ID format')
  }),

  documentId: z.object({
    documentId: z.string().uuid('Invalid document ID format')
  }),

  timeRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    range: z.enum(['1h', '24h', '7d', '30d', '90d']).optional()
  })
};

// Export types for use in API routes
export type { ApiResponse, ApiContext, HandlerConfig, ApiMiddleware };
export { ErrorCodes, ApiError };