import { z } from 'zod';

/**
 * Conversation Creation Schema
 */
export const conversationCreateSchema = z.object({
  chatbotId: z.string().uuid('Invalid chatbot ID format'),
  sessionId: z.string().min(1, 'Session ID is required').max(255, 'Session ID too long'),
  integrationType: z.enum(['web_embed', 'line_oa', 'api', 'playground'], {
    required_error: 'Integration type is required',
    invalid_type_error: 'Invalid integration type'
  }),
  userIdentifier: z.string().max(255, 'User identifier too long').optional(),
  metadata: z.record(z.any()).optional().default({})
}).strict();

export type ConversationCreateRequest = z.infer<typeof conversationCreateSchema>;

/**
 * Message Send Schema
 */
export const messageSendSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(5000, 'Message content too long'),
  metadata: z.record(z.any()).optional().default({}),
  useKnowledgeBase: z.boolean().optional().default(true),
  knowledgeFilters: z.object({
    documentTypes: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    supplierIds: z.array(z.string().uuid('Invalid supplier ID format')).optional()
  }).optional()
}).strict();

export type MessageSendRequest = z.infer<typeof messageSendSchema>;

/**
 * Conversation Update Schema
 */
export const conversationUpdateSchema = z.object({
  metadata: z.record(z.any()).optional(),
  endedAt: z.string().datetime('Invalid date format').optional()
}).strict();

export type ConversationUpdateRequest = z.infer<typeof conversationUpdateSchema>;

/**
 * Conversation Query Schema
 */
export const conversationQuerySchema = z.object({
  limit: z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional().default(20),
  offset: z.number().int().min(0, 'Offset must be at least 0').optional().default(0),
  includeMessages: z.boolean().optional().default(false),
  dateRange: z.object({
    from: z.string().datetime('Invalid date format').optional(),
    to: z.string().datetime('Invalid date format').optional()
  }).optional(),
  integrationType: z.enum(['web_embed', 'line_oa', 'api', 'playground']).optional(),
  isActive: z.boolean().optional()
}).strict();

export type ConversationQueryRequest = z.infer<typeof conversationQuerySchema>;

/**
 * Context Update Schema
 */
export const contextUpdateSchema = z.object({
  contextKey: z.string().min(1, 'Context key is required').max(255, 'Context key too long'),
  contextValue: z.any(),
  expiresAt: z.string().datetime('Invalid date format').optional()
}).strict();

export type ContextUpdateRequest = z.infer<typeof contextUpdateSchema>;

/**
 * Conversation Export Schema
 */
export const conversationExportSchema = z.object({
  format: z.enum(['json', 'csv', 'txt'], {
    required_error: 'Export format is required',
    invalid_type_error: 'Invalid export format'
  }),
  includeMetadata: z.boolean().optional().default(true),
  includeContext: z.boolean().optional().default(false),
  dateRange: z.object({
    from: z.string().datetime('Invalid date format').optional(),
    to: z.string().datetime('Invalid date format').optional()
  }).optional()
}).strict();

export type ConversationExportRequest = z.infer<typeof conversationExportSchema>;

/**
 * Message Response Schema (for API responses)
 */
export const messageResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  metadata: z.record(z.any()),
  vectorSearchResults: z.array(z.any()),
  createdAt: z.string().datetime(),
  // Enhanced response data
  knowledgeUsed: z.boolean().optional(),
  sourceDocuments: z.array(z.object({
    documentId: z.string(),
    documentName: z.string(),
    similarity: z.number(),
    category: z.string().optional(),
    supplier: z.string().optional()
  })).optional(),
  responseTime: z.number().optional()
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Conversation Response Schema
 */
export const conversationResponseSchema = z.object({
  id: z.string().uuid(),
  chatbotId: z.string().uuid(),
  sessionId: z.string(),
  integrationType: z.enum(['web_embed', 'line_oa', 'api', 'playground']),
  userIdentifier: z.string().nullable(),
  metadata: z.record(z.any()),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  lastActivityAt: z.string().datetime(),
  messageCount: z.number().optional(),
  messages: z.array(messageResponseSchema).optional()
});

export type ConversationResponse = z.infer<typeof conversationResponseSchema>;

/**
 * Validation helper functions
 */
export function validateConversationCreate(data: unknown): ConversationCreateRequest {
  return conversationCreateSchema.parse(data);
}

export function validateMessageSend(data: unknown): MessageSendRequest {
  return messageSendSchema.parse(data);
}

export function validateConversationUpdate(data: unknown): ConversationUpdateRequest {
  return conversationUpdateSchema.parse(data);
}

export function validateConversationQuery(data: unknown): ConversationQueryRequest {
  return conversationQuerySchema.parse(data);
}

export function validateContextUpdate(data: unknown): ContextUpdateRequest {
  return contextUpdateSchema.parse(data);
}

export function validateConversationExport(data: unknown): ConversationExportRequest {
  return conversationExportSchema.parse(data);
}