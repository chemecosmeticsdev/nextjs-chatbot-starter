/**
 * API Response Utilities for consistent API responses
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