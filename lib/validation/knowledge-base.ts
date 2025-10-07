import { z } from 'zod';

/**
 * Knowledge Base Search Request Schema
 */
export const knowledgeBaseSearchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000, 'Query must be 1000 characters or less').trim(),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').optional().default(10),
  threshold: z.number().min(0, 'Threshold must be at least 0').max(1, 'Threshold cannot exceed 1').optional().default(0.7),
  filters: z.object({
    documentTypes: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    supplierIds: z.array(z.string().uuid('Invalid supplier ID format')).optional(),
    documentIds: z.array(z.string().uuid('Invalid document ID format')).optional(),
    dateRange: z.object({
      from: z.string().datetime('Invalid date format').optional(),
      to: z.string().datetime('Invalid date format').optional()
    }).optional()
  }).optional().default({}),
  includeContent: z.boolean().optional().default(true),
  cacheResults: z.boolean().optional().default(true)
}).strict();

/**
 * Enhanced Knowledge Base Search Request Schema with Adaptive Features
 */
export const adaptiveKnowledgeBaseSearchSchema = knowledgeBaseSearchSchema.extend({
  enableAdaptiveThreshold: z.boolean().optional().default(true),
  enableFallback: z.boolean().optional().default(true),
  maxFallbackAttempts: z.number().int().min(1, 'Must allow at least 1 attempt').max(5, 'Cannot exceed 5 attempts').optional().default(3),
  minimumResults: z.number().int().min(1, 'Must require at least 1 result').max(20, 'Cannot require more than 20 results').optional().default(5)
}).strict();

export type KnowledgeBaseSearchRequest = z.infer<typeof knowledgeBaseSearchSchema>;
export type AdaptiveKnowledgeBaseSearchRequest = z.infer<typeof adaptiveKnowledgeBaseSearchSchema>;

/**
 * Knowledge Base Update Request Schema
 */
export const knowledgeBaseUpdateSchema = z.object({
  documentId: z.string().uuid('Invalid document ID format'),
  action: z.enum(['reprocess', 'delete', 'update_metadata'], {
    required_error: 'Action is required',
    invalid_type_error: 'Invalid action type'
  }),
  metadata: z.object({
    category: z.string().optional(),
    supplier: z.string().optional(),
    tags: z.array(z.string()).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional()
  }).optional(),
  // Structured metadata fields
  supplierName: z.string().max(255).nullish(),
  supplierNormalized: z.string().max(255).nullish(),
  supplierCountry: z.string().max(100).nullish(),
  ingredientName: z.string().max(255).nullish(),
  ingredientNormalized: z.string().max(255).nullish(),
  ingredientInciName: z.string().max(255).nullish(),
  ingredientCasNumber: z.string().max(50).nullish(),
  ragDocumentType: z.string().nullish(),
  documentSubtype: z.string().max(100).nullish(),
  complianceTypes: z.array(z.string()).nullish(),
  certificationBodies: z.array(z.string()).nullish(),
  regulatoryRegions: z.array(z.string()).nullish(),
  keywords: z.array(z.string()).nullish(),
  casNumbers: z.array(z.string()).nullish(),
  inciNames: z.array(z.string()).nullish(),
  allergens: z.array(z.string()).nullish(),
  qualityScore: z.number().int().min(0).max(100).nullish(),
  validationStatus: z.string().nullish(),
  language: z.string().max(10).nullish()
}).strict();

export type KnowledgeBaseUpdateRequest = z.infer<typeof knowledgeBaseUpdateSchema>;

/**
 * Document Upload for Knowledge Base Schema
 */
export const documentUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  content: z.string().min(1, 'Content is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  metadata: z.object({
    category: z.string().optional(),
    supplier: z.string().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().max(1000).optional()
  }).optional().default({}),
  processingOptions: z.object({
    chunkSize: z.number().int().min(100).max(2000).optional().default(500),
    chunkOverlap: z.number().int().min(0).max(500).optional().default(50),
    embeddingModel: z.enum(['amazon.titan-embed-text-v1', 'amazon.titan-embed-text-v2']).optional().default('amazon.titan-embed-text-v2')
  }).optional().default({})
}).strict();

export type DocumentUploadRequest = z.infer<typeof documentUploadSchema>;

/**
 * Knowledge Base Statistics Request Schema
 */
export const knowledgeBaseStatsSchema = z.object({
  dateRange: z.object({
    from: z.string().datetime('Invalid date format').optional(),
    to: z.string().datetime('Invalid date format').optional()
  }).optional(),
  groupBy: z.enum(['category', 'supplier', 'document_type', 'date']).optional().default('category')
}).strict();

export type KnowledgeBaseStatsRequest = z.infer<typeof knowledgeBaseStatsSchema>;

/**
 * Bulk Document Processing Schema
 */
export const bulkProcessingSchema = z.object({
  documentIds: z.array(z.string().uuid('Invalid document ID format')).min(1, 'At least one document ID is required').max(100, 'Cannot process more than 100 documents at once'),
  action: z.enum(['reprocess', 'delete', 'update_embeddings'], {
    required_error: 'Action is required',
    invalid_type_error: 'Invalid action type'
  }),
  processingOptions: z.object({
    chunkSize: z.number().int().min(100).max(2000).optional(),
    chunkOverlap: z.number().int().min(0).max(500).optional(),
    embeddingModel: z.enum(['amazon.titan-embed-text-v1', 'amazon.titan-embed-text-v2']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium')
  }).optional().default({})
}).strict();

export type BulkProcessingRequest = z.infer<typeof bulkProcessingSchema>;

/**
 * Search Analytics Schema
 */
export const searchAnalyticsSchema = z.object({
  timeframe: z.enum(['1h', '24h', '7d', '30d', '90d']).optional().default('24h'),
  chatbotId: z.string().uuid('Invalid chatbot ID format').optional().nullish(),
  includeFailedQueries: z.boolean().optional().default(false),
  groupBy: z.enum(['hour', 'day', 'query_type']).optional().default('day')
}).strict();

export type SearchAnalyticsRequest = z.infer<typeof searchAnalyticsSchema>;

// Common response interfaces
export interface VectorSearchResult {
  documentId: string;
  chunkId: string;
  content: string;
  similarity: number;
  metadata: {
    documentName?: string;
    category?: string;
    supplier?: string;
    tags?: string[];
    chunkIndex?: number;
    [key: string]: any;
  };
}

export interface KnowledgeBaseSearchResponse {
  success: boolean;
  data: {
    query: string;
    results: VectorSearchResult[];
    totalResults: number;
    searchTime: number;
    cached: boolean;
    filters?: Record<string, any>;
    searchMethod?: string;
    thresholdUsed?: number;
  };
}

export interface DocumentProcessingStatus {
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  chunksCreated?: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface KnowledgeBaseStats {
  totalDocuments: number;
  totalChunks: number;
  avgChunksPerDocument: number;
  documentsByCategory: Record<string, number>;
  documentsBySupplier: Record<string, number>;
  processingStats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  storageStats: {
    totalSizeBytes: number;
    avgDocumentSize: number;
  };
}

export interface SearchPerformanceMetrics {
  totalQueries: number;
  avgResponseTime: number;
  cacheHitRate: number;
  topQueries: Array<{
    query: string;
    count: number;
    avgResponseTime: number;
  }>;
  queryDistribution: Record<string, number>;
  errorRate: number;
}

/**
 * Validation helper functions
 */
export function validateKnowledgeBaseSearch(data: unknown): KnowledgeBaseSearchRequest {
  return knowledgeBaseSearchSchema.parse(data);
}

export function validateKnowledgeBaseUpdate(data: unknown): KnowledgeBaseUpdateRequest {
  return knowledgeBaseUpdateSchema.parse(data);
}

export function validateDocumentUpload(data: unknown): DocumentUploadRequest {
  return documentUploadSchema.parse(data);
}

export function validateBulkProcessing(data: unknown): BulkProcessingRequest {
  return bulkProcessingSchema.parse(data);
}

export function validateSearchAnalytics(data: unknown): SearchAnalyticsRequest {
  return searchAnalyticsSchema.parse(data);
}