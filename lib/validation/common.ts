/**
 * Common validation utilities and schemas
 */

import { z } from 'zod';

/**
 * Common validation schemas
 */
export const UuidSchema = z.string().uuid();

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const SearchSchema = z.object({
  search: z.string().optional(),
  ...PaginationSchema.shape,
});

/**
 * Common validation functions
 */
export function validateId(id: string): boolean {
  return UuidSchema.safeParse(id).success;
}

export function validatePagination(data: any) {
  return PaginationSchema.parse(data);
}

export function validateSearch(data: any) {
  return SearchSchema.parse(data);
}

/**
 * Error formatting utilities
 */
export function formatValidationErrors(error: z.ZodError) {
  return {
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    },
  };
}

export function formatValidationError(error: z.ZodError) {
  return formatValidationErrors(error);
}