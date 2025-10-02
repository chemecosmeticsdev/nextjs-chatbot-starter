import { z } from 'zod';

// Base schemas for analytics data
export const timeRangeSchema = z.object({
  startDate: z.string().datetime('Invalid start date format'),
  endDate: z.string().datetime('Invalid end date format'),
  timezone: z.string().optional().default('UTC')
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  { message: 'Start date must be before or equal to end date', path: ['startDate'] }
);

export const paginationSchema = z.object({
  page: z.number().int().min(1, 'Page must be at least 1').optional().default(1),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional().default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

// Analytics query schemas
export const analyticsQuerySchema = z.object({
  timeRange: timeRangeSchema,
  filters: z.object({
    chatbotIds: z.array(z.string().uuid('Invalid chatbot ID format')).optional(),
    userIds: z.array(z.string().uuid('Invalid user ID format')).optional(),
    sessionIds: z.array(z.string().uuid('Invalid session ID format')).optional(),
    messageTypes: z.array(z.enum(['user', 'assistant'])).optional(),
    responseCategories: z.array(z.string()).optional(),
    knowledgeBaseUsed: z.boolean().optional(),
    errorOccurred: z.boolean().optional()
  }).optional().default({}),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  includeBreakdown: z.boolean().optional().default(false)
}).strict();

// Performance metrics schemas
export const performanceMetricsQuerySchema = z.object({
  timeRange: timeRangeSchema,
  metricTypes: z.array(z.enum([
    'response_time',
    'knowledge_search_time',
    'embedding_generation_time',
    'llm_response_time',
    'total_request_time',
    'error_rate',
    'cache_hit_rate',
    'concurrent_sessions'
  ])).optional(),
  aggregation: z.enum(['avg', 'min', 'max', 'sum', 'count', 'percentile']).optional().default('avg'),
  percentile: z.number().min(1).max(99).optional().default(95),
  granularity: z.enum(['minute', 'hour', 'day']).optional().default('hour')
}).strict();

// User activity tracking schemas
export const userActivityEventSchema = z.object({
  userId: z.string().uuid('Invalid user ID format').optional(),
  sessionId: z.string().uuid('Invalid session ID format'),
  chatbotId: z.string().uuid('Invalid chatbot ID format'),
  eventType: z.enum([
    'session_start',
    'session_end',
    'message_sent',
    'message_received',
    'knowledge_search',
    'document_accessed',
    'error_occurred',
    'feedback_provided'
  ]),
  eventData: z.record(z.any()).optional(),
  timestamp: z.string().datetime('Invalid timestamp format'),
  userAgent: z.string().optional(),
  ipAddress: z.string().ip('Invalid IP address format').optional(),
  responseTime: z.number().min(0, 'Response time must be non-negative').optional()
}).strict();

export const sessionAnalyticsQuerySchema = z.object({
  timeRange: timeRangeSchema,
  pagination: paginationSchema.optional(),
  filters: z.object({
    chatbotIds: z.array(z.string().uuid()).optional(),
    userIds: z.array(z.string().uuid()).optional(),
    minDuration: z.number().min(0, 'Minimum duration must be non-negative').optional(),
    maxDuration: z.number().min(0, 'Maximum duration must be non-negative').optional(),
    messageCountRange: z.object({
      min: z.number().int().min(0),
      max: z.number().int().min(0)
    }).optional(),
    hasErrors: z.boolean().optional(),
    knowledgeBaseUsed: z.boolean().optional()
  }).optional().default({})
}).strict();

// Report generation schemas
export const reportConfigSchema = z.object({
  reportType: z.enum([
    'chatbot_performance',
    'user_engagement',
    'knowledge_base_usage',
    'error_analysis',
    'session_analytics',
    'comparative_analysis'
  ]),
  timeRange: timeRangeSchema,
  filters: z.object({
    chatbotIds: z.array(z.string().uuid()).optional(),
    userIds: z.array(z.string().uuid()).optional(),
    includeDetails: z.boolean().optional().default(false),
    includeCharts: z.boolean().optional().default(true),
    compareWithPrevious: z.boolean().optional().default(false)
  }).optional().default({}),
  format: z.enum(['json', 'csv', 'pdf']).optional().default('json'),
  deliveryMethod: z.enum(['download', 'email', 'webhook']).optional().default('download'),
  scheduledReport: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)')
  }).optional()
}).strict();

// Dashboard data schemas
export const dashboardMetricsQuerySchema = z.object({
  timeRange: timeRangeSchema.optional(),
  realTime: z.boolean().optional().default(false),
  metricsToInclude: z.array(z.enum([
    'total_conversations',
    'active_users',
    'average_response_time',
    'knowledge_base_queries',
    'error_rate',
    'user_satisfaction',
    'popular_topics',
    'peak_usage_times'
  ])).optional(),
  chatbotIds: z.array(z.string().uuid()).optional(),
  refreshInterval: z.number().int().min(5).max(300).optional().default(30) // seconds
}).strict();

// Export functionality schemas
export const exportRequestSchema = z.object({
  dataType: z.enum([
    'conversation_logs',
    'user_analytics',
    'performance_metrics',
    'knowledge_base_queries',
    'error_logs',
    'session_data'
  ]),
  timeRange: timeRangeSchema,
  format: z.enum(['json', 'csv', 'xlsx']),
  filters: z.object({
    chatbotIds: z.array(z.string().uuid()).optional(),
    userIds: z.array(z.string().uuid()).optional(),
    includePersonalData: z.boolean().optional().default(false),
    anonymizeData: z.boolean().optional().default(true)
  }).optional().default({}),
  compression: z.boolean().optional().default(true),
  maxRecords: z.number().int().min(1).max(1000000).optional().default(10000)
}).strict();

// Response type definitions
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type PerformanceMetricsQuery = z.infer<typeof performanceMetricsQuerySchema>;
export type UserActivityEvent = z.infer<typeof userActivityEventSchema>;
export type SessionAnalyticsQuery = z.infer<typeof sessionAnalyticsQuerySchema>;
export type ReportConfig = z.infer<typeof reportConfigSchema>;
export type DashboardMetricsQuery = z.infer<typeof dashboardMetricsQuerySchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type Pagination = z.infer<typeof paginationSchema>;

// Analytics response schemas
export const analyticsMetricSchema = z.object({
  timestamp: z.string().datetime(),
  value: z.number(),
  label: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export const performanceMetricSchema = z.object({
  metricType: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.string().datetime(),
  percentile: z.number().optional(),
  breakdown: z.record(z.number()).optional()
});

export const sessionSummarySchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  chatbotId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  duration: z.number().min(0),
  messageCount: z.number().int().min(0),
  knowledgeSearchCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  averageResponseTime: z.number().min(0),
  userSatisfaction: z.number().min(1).max(5).optional(),
  topTopics: z.array(z.string()).optional()
});

export type AnalyticsMetric = z.infer<typeof analyticsMetricSchema>;
export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

// Validation helper functions
export function validateAnalyticsQuery(data: unknown): AnalyticsQuery {
  return analyticsQuerySchema.parse(data);
}

export function validatePerformanceMetricsQuery(data: unknown): PerformanceMetricsQuery {
  return performanceMetricsQuerySchema.parse(data);
}

export function validateUserActivityEvent(data: unknown): UserActivityEvent {
  return userActivityEventSchema.parse(data);
}

export function validateSessionAnalyticsQuery(data: unknown): SessionAnalyticsQuery {
  return sessionAnalyticsQuerySchema.parse(data);
}

export function validateReportConfig(data: unknown): ReportConfig {
  return reportConfigSchema.parse(data);
}

export function validateDashboardMetricsQuery(data: unknown): DashboardMetricsQuery {
  return dashboardMetricsQuerySchema.parse(data);
}

export function validateExportRequest(data: unknown): ExportRequest {
  return exportRequestSchema.parse(data);
}

// Analytics error types
export class AnalyticsValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'AnalyticsValidationError';
  }
}

export class AnalyticsQueryError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AnalyticsQueryError';
  }
}

export class AnalyticsExportError extends Error {
  constructor(message: string, public exportId?: string) {
    super(message);
    this.name = 'AnalyticsExportError';
  }
}