import { z } from 'zod';

// Configuration schema for chatbot settings
const chatbotConfigurationSchema = z.object({
  model: z.string()
    .min(1, 'Model is required')
    .default('anthropic.claude-3-sonnet-20240229-v1:0'),
  temperature: z.number()
    .min(0, 'Temperature must be between 0 and 2')
    .max(2, 'Temperature must be between 0 and 2')
    .default(0.7),
  maxTokens: z.number()
    .min(1, 'Max tokens must be at least 1')
    .max(8000, 'Max tokens cannot exceed 8000')
    .default(1000),
  language: z.string()
    .min(2, 'Language code must be at least 2 characters')
    .max(5, 'Language code cannot exceed 5 characters')
    .default('en'),
  responseTimeout: z.number()
    .min(5, 'Response timeout must be at least 5 seconds')
    .max(300, 'Response timeout cannot exceed 300 seconds')
    .default(30)
}).strict();

// Knowledge source filters schema
const knowledgeSourceFiltersSchema = z.object({
  categories: z.array(z.string()).optional(),
  suppliers: z.array(z.string()).optional(),
  documentTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional()
}).strict();

// Create chatbot request schema
export const createChatbotSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name cannot exceed 255 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .trim()
    .optional(),
  configuration: chatbotConfigurationSchema.optional(),
  knowledgeSourceFilters: knowledgeSourceFiltersSchema.optional(),
  currentSystemPrompt: z.string()
    .max(10000, 'System prompt cannot exceed 10000 characters')
    .trim()
    .optional(),
  welcomeMessage: z.string()
    .max(500, 'Welcome message cannot exceed 500 characters')
    .trim()
    .optional()
}).strict();

// Update chatbot request schema
export const updateChatbotSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name cannot exceed 255 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .trim()
    .optional(),
  status: z.enum(['active', 'inactive', 'testing'])
    .optional(),
  configuration: chatbotConfigurationSchema.partial().optional(),
  knowledgeSourceFilters: knowledgeSourceFiltersSchema.optional(),
  currentSystemPrompt: z.string()
    .max(10000, 'System prompt cannot exceed 10000 characters')
    .trim()
    .optional(),
  welcomeMessage: z.string()
    .max(500, 'Welcome message cannot exceed 500 characters')
    .trim()
    .optional()
}).strict();

// List chatbots query schema
export const listChatbotsQuerySchema = z.object({
  page: z.string()
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, 'Page must be a positive number')
    .default('1'),
  limit: z.string()
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .default('20'),
  status: z.enum(['active', 'inactive', 'testing']).optional(),
  search: z.string()
    .min(1, 'Search term must be at least 1 character')
    .max(100, 'Search term cannot exceed 100 characters')
    .trim()
    .optional()
}).partial();

// Chatbot ID parameter schema
export const chatbotIdSchema = z.object({
  id: z.string()
    .uuid('Invalid chatbot ID format')
}).strict();

// API response schemas
export const chatbotResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['active', 'inactive', 'testing']),
  apiKeyHint: z.string(),
  configuration: chatbotConfigurationSchema,
  knowledgeSourceFilters: knowledgeSourceFiltersSchema,
  currentSystemPrompt: z.string().nullable(),
  welcomeMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Stats fields
  conversationCount: z.number(),
  userCount: z.number(),
  lastActivity: z.date().nullable()
});

export const chatbotListResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    chatbots: z.array(chatbotResponseSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number()
    })
  })
});

export const chatbotCreateResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    chatbot: chatbotResponseSchema,
    apiKey: z.string()
  })
});

export const apiKeyRegenerateResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    apiKey: z.string(),
    hint: z.string()
  })
});

export const chatbotHealthResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    status: z.enum(['healthy', 'warning', 'error']),
    metrics: z.object({
      uptime: z.number(),
      responseTime: z.number(),
      errorRate: z.number(),
      totalRequests: z.number(),
      lastRequest: z.date().nullable()
    })
  })
});

// Error response schema
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string(),
  details: z.any().optional()
});

// Type exports
export type CreateChatbotRequest = z.infer<typeof createChatbotSchema>;
export type UpdateChatbotRequest = z.infer<typeof updateChatbotSchema>;
export type ListChatbotsQuery = z.infer<typeof listChatbotsQuerySchema>;
export type ChatbotIdParams = z.infer<typeof chatbotIdSchema>;
export type ChatbotResponse = z.infer<typeof chatbotResponseSchema>;
export type ChatbotListResponse = z.infer<typeof chatbotListResponseSchema>;
export type ChatbotCreateResponse = z.infer<typeof chatbotCreateResponseSchema>;
export type ApiKeyRegenerateResponse = z.infer<typeof apiKeyRegenerateResponseSchema>;
export type ChatbotHealthResponse = z.infer<typeof chatbotHealthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Validation helper functions
export function validateCreateChatbot(data: unknown): CreateChatbotRequest {
  return createChatbotSchema.parse(data);
}

export function validateUpdateChatbot(data: unknown): UpdateChatbotRequest {
  return updateChatbotSchema.parse(data);
}

export function validateListChatbotsQuery(data: unknown): ListChatbotsQuery {
  return listChatbotsQuerySchema.parse(data);
}

export function validateChatbotId(data: unknown): ChatbotIdParams {
  return chatbotIdSchema.parse(data);
}

// Error formatting helper
export function formatValidationError(error: z.ZodError): ErrorResponse {
  const details = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));

  return {
    success: false,
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details
  };
}

// Standard API response helpers
export function createSuccessResponse<T>(data: T): { success: true; data: T } {
  return {
    success: true,
    data
  };
}

export function createErrorResponse(
  error: string,
  code: string,
  details?: any
): ErrorResponse {
  return {
    success: false,
    error,
    code,
    details
  };
}