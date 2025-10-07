/**
 * API Utilities for common API response patterns
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
}

/**
 * Create a successful API response
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Create an error API response
 */
export function createErrorResponse(
  message: string,
  code?: string,
  details?: any
): ApiResponse {
  return {
    success: false,
    error: {
      message,
      code,
      details,
    },
  };
}

/**
 * Create a paginated success response
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasNext: boolean;
    hasPrevious: boolean;
  }
): ApiResponse<{ items: T[]; pagination: typeof pagination }> {
  return {
    success: true,
    data: {
      items: data,
      pagination,
    },
  };
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: any) {
  console.error('API error:', error);

  if (error.name === 'ValidationError') {
    return createErrorResponse(
      'Validation failed',
      'VALIDATION_ERROR',
      error.details
    );
  }

  if (error.code === '23505') { // PostgreSQL unique violation
    return createErrorResponse(
      'Resource already exists',
      'DUPLICATE_RESOURCE'
    );
  }

  return createErrorResponse(
    'Internal server error',
    'INTERNAL_ERROR',
    process.env.NODE_ENV === 'development' ? error.message : undefined
  );
}