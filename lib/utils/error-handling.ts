/**
 * Enhanced error handling utilities for Step Functions upload
 */

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: Error) => boolean;
}

export interface ErrorContext {
  operation: string;
  fileName?: string;
  fileSize?: number;
  attempt?: number;
  timestamp?: string;
}

export interface EnhancedError extends Error {
  code?: string;
  category?: ErrorCategory;
  isRetryable?: boolean;
  userMessage?: string;
  suggestion?: string;
  context?: ErrorContext;
}

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  SERVER = 'server',
  TIMEOUT = 'timeout',
  CONFIGURATION = 'configuration',
  CLIENT = 'client',
  UNKNOWN = 'unknown'
}

/**
 * Categorize errors for better handling and user messages
 */
export function categorizeError(error: Error | any): ErrorCategory {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.code;

  // Network-related errors
  if (error.name === 'TypeError' && message.includes('fetch')) {
    return ErrorCategory.NETWORK;
  }
  if (error.name === 'AbortError' || message.includes('timeout')) {
    return ErrorCategory.TIMEOUT;
  }

  // HTTP status-based categorization
  if (status === 401) return ErrorCategory.AUTHENTICATION;
  if (status === 403) return ErrorCategory.AUTHORIZATION;
  if (status >= 400 && status < 500) return ErrorCategory.CLIENT;
  if (status >= 500) return ErrorCategory.SERVER;

  // Content-based categorization
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorCategory.VALIDATION;
  }
  if (message.includes('environment variables') || message.includes('configuration')) {
    return ErrorCategory.CONFIGURATION;
  }
  if (message.includes('network') || message.includes('connection')) {
    return ErrorCategory.NETWORK;
  }
  if (message.includes('auth') || message.includes('credential')) {
    return ErrorCategory.AUTHENTICATION;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Enhance error with additional metadata and user-friendly messaging
 */
export function enhanceError(error: Error | any, context?: ErrorContext): EnhancedError {
  const category = categorizeError(error);
  const enhanced: EnhancedError = {
    ...error,
    name: error.name || 'Error',
    message: error.message || 'Unknown error occurred',
    category,
    context: {
      timestamp: new Date().toISOString(),
      ...context
    }
  };

  // Add user-friendly messages and suggestions based on category
  switch (category) {
    case ErrorCategory.NETWORK:
      enhanced.userMessage = 'Network connection issue detected';
      enhanced.suggestion = 'Please check your internet connection and try again';
      enhanced.isRetryable = true;
      break;

    case ErrorCategory.TIMEOUT:
      enhanced.userMessage = 'Request timed out';
      enhanced.suggestion = 'The operation took too long. Try with a smaller file or check your connection';
      enhanced.isRetryable = true;
      break;

    case ErrorCategory.AUTHENTICATION:
      enhanced.userMessage = 'Authentication failed';
      enhanced.suggestion = 'Please refresh the page and sign in again';
      enhanced.isRetryable = false;
      break;

    case ErrorCategory.AUTHORIZATION:
      enhanced.userMessage = 'Permission denied';
      enhanced.suggestion = 'You don\'t have permission for this operation. Contact support if this persists';
      enhanced.isRetryable = false;
      break;

    case ErrorCategory.VALIDATION:
      enhanced.userMessage = 'File validation failed';
      enhanced.suggestion = 'Please check the file format and size requirements';
      enhanced.isRetryable = false;
      break;

    case ErrorCategory.SERVER:
      enhanced.userMessage = 'Server error occurred';
      enhanced.suggestion = 'Please try again in a few moments. Contact support if the problem persists';
      enhanced.isRetryable = true;
      break;

    case ErrorCategory.CONFIGURATION:
      enhanced.userMessage = 'Service temporarily unavailable';
      enhanced.suggestion = 'The service is being configured. Please try again later';
      enhanced.isRetryable = true;
      break;

    case ErrorCategory.CLIENT:
      enhanced.userMessage = 'Request failed';
      enhanced.suggestion = 'Please check your input and try again';
      enhanced.isRetryable = false;
      break;

    default:
      enhanced.userMessage = 'An unexpected error occurred';
      enhanced.suggestion = 'Please try again or contact support if the problem persists';
      enhanced.isRetryable = true;
  }

  return enhanced;
}

/**
 * Retry mechanism with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryCondition = (error: Error) => {
      const enhanced = enhanceError(error);
      return enhanced.isRetryable ?? true;
    }
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const enhanced = enhanceError(lastError, { attempt });

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === maxAttempts || !retryCondition(enhanced)) {
        throw enhanced;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);

      console.warn(`Operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`, enhanced.message);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw enhanceError(lastError!);
}

/**
 * File upload with enhanced error handling
 */
export async function uploadFileWithRetry(
  file: File,
  uploadFn: (file: File) => Promise<any>,
  options: Partial<RetryOptions> = {}
): Promise<any> {
  const context: ErrorContext = {
    operation: 'file_upload',
    fileName: file.name,
    fileSize: file.size
  };

  return retryWithBackoff(
    async () => {
      try {
        return await uploadFn(file);
      } catch (error) {
        throw enhanceError(error as Error, context);
      }
    },
    {
      maxAttempts: 2, // Conservative retry for uploads
      baseDelay: 2000,
      ...options
    }
  );
}

/**
 * API request with enhanced error handling
 */
export async function apiRequestWithRetry<T>(
  url: string,
  options: RequestInit,
  retryOptions: Partial<RetryOptions> = {}
): Promise<T> {
  const context: ErrorContext = {
    operation: 'api_request'
  };

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
          (error as any).status = response.status;
          throw error;
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw enhanceError(error as Error, context);
      }
    },
    {
      maxAttempts: 3,
      baseDelay: 1000,
      retryCondition: (error: Error) => {
        const enhanced = enhanceError(error);
        // Don't retry client errors (4xx) except for 408, 429
        if ((error as any).status >= 400 && (error as any).status < 500) {
          return (error as any).status === 408 || (error as any).status === 429;
        }
        return enhanced.isRetryable ?? true;
      },
      ...retryOptions
    }
  );
}

/**
 * Validate file with enhanced error reporting
 */
export function validateFileEnhanced(file: File): { valid: boolean; error?: EnhancedError } {
  const context: ErrorContext = {
    operation: 'file_validation',
    fileName: file.name,
    fileSize: file.size
  };

  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: enhanceError(
        new Error(`File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds limit of 50MB`),
        context
      )
    };
  }

  const supportedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'application/rtf',
    'image/jpeg',
    'image/png',
    'image/tiff'
  ];

  if (!supportedTypes.includes(file.type)) {
    return {
      valid: false,
      error: enhanceError(
        new Error(`File type ${file.type} is not supported`),
        context
      )
    };
  }

  // Check for empty files
  if (file.size === 0) {
    return {
      valid: false,
      error: enhanceError(
        new Error('File appears to be empty'),
        context
      )
    };
  }

  return { valid: true };
}

/**
 * Format error for display to users
 */
export function formatErrorForUser(error: Error | EnhancedError): {
  title: string;
  message: string;
  suggestion?: string;
  isRetryable: boolean;
} {
  const enhanced = 'category' in error ? error : enhanceError(error);

  return {
    title: enhanced.userMessage || 'Error occurred',
    message: enhanced.message,
    suggestion: enhanced.suggestion,
    isRetryable: enhanced.isRetryable ?? false
  };
}