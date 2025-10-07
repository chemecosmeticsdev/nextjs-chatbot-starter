import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  uuid,
  jsonb,
  integer,
  numeric,
  primaryKey,
  unique,
  pgEnum,
  index
} from 'drizzle-orm/pg-core';
import { chatbotInstances, users } from './schema';

// Enums for analytics
export const timeGranularityEnum = pgEnum('time_granularity', ['hour', 'day', 'week', 'month']);
export const metricTypeEnum = pgEnum('metric_type', ['conversations', 'messages', 'users', 'performance', 'errors']);

/**
 * Hourly Analytics - For real-time dashboards
 * Aggregated every hour for the last 7 days
 */
export const chatbotHourlyAnalytics = pgTable('chatbot_hourly_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  hourTimestamp: timestamp('hour_timestamp', { withTimezone: true }).notNull(), // Start of the hour

  // Conversation Metrics
  newConversations: integer('new_conversations').default(0),
  activeConversations: integer('active_conversations').default(0),
  completedConversations: integer('completed_conversations').default(0),

  // Message Metrics
  totalMessages: integer('total_messages').default(0),
  userMessages: integer('user_messages').default(0),
  assistantMessages: integer('assistant_messages').default(0),

  // User Metrics
  uniqueUsers: integer('unique_users').default(0),
  newUsers: integer('new_users').default(0),
  returningUsers: integer('returning_users').default(0),

  // Performance Metrics
  avgResponseTimeMs: integer('avg_response_time_ms').default(0),
  minResponseTimeMs: integer('min_response_time_ms').default(0),
  maxResponseTimeMs: integer('max_response_time_ms').default(0),
  p95ResponseTimeMs: integer('p95_response_time_ms').default(0),

  // Token Usage
  totalTokensUsed: integer('total_tokens_used').default(0),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),

  // Error Metrics
  errorCount: integer('error_count').default(0),
  timeoutCount: integer('timeout_count').default(0),

  // Integration Breakdown
  integrationStats: jsonb('integration_stats').default({}), // {"web_embed": 10, "line_oa": 5, "api": 2}

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatbotHourUnique: unique().on(table.chatbotId, table.hourTimestamp),
  hourlyAnalyticsIdx: index('idx_hourly_analytics_chatbot_hour').on(table.chatbotId, table.hourTimestamp),
}));

/**
 * Weekly Analytics - For trend analysis
 * Aggregated weekly for historical data
 */
export const chatbotWeeklyAnalytics = pgTable('chatbot_weekly_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  weekStart: timestamp('week_start', { withTimezone: true }).notNull(), // Monday of the week
  weekEnd: timestamp('week_end', { withTimezone: true }).notNull(),

  // Weekly Totals
  totalConversations: integer('total_conversations').default(0),
  totalMessages: integer('total_messages').default(0),
  totalUsers: integer('total_users').default(0),

  // Daily Averages
  avgConversationsPerDay: numeric('avg_conversations_per_day', { precision: 8, scale: 2 }).default('0'),
  avgMessagesPerDay: numeric('avg_messages_per_day', { precision: 8, scale: 2 }).default('0'),
  avgUsersPerDay: numeric('avg_users_per_day', { precision: 8, scale: 2 }).default('0'),

  // Performance Averages
  avgResponseTimeMs: integer('avg_response_time_ms').default(0),
  avgConversationLength: numeric('avg_conversation_length', { precision: 5, scale: 2 }).default('0'),

  // Growth Metrics (compared to previous week)
  conversationGrowthPercent: numeric('conversation_growth_percent', { precision: 5, scale: 2 }).default('0'),
  userGrowthPercent: numeric('user_growth_percent', { precision: 5, scale: 2 }).default('0'),

  // Usage Patterns
  peakHour: integer('peak_hour').default(0), // Hour of day with most activity (0-23)
  peakDayOfWeek: integer('peak_day_of_week').default(1), // Day of week (1=Monday, 7=Sunday)

  // Quality Metrics
  errorRate: numeric('error_rate', { precision: 5, scale: 4 }).default('0'), // Percentage
  avgFeedbackScore: numeric('avg_feedback_score', { precision: 3, scale: 2 }).default('0'), // 1-5 scale

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatbotWeekUnique: unique().on(table.chatbotId, table.weekStart),
  weeklyAnalyticsIdx: index('idx_weekly_analytics_chatbot_week').on(table.chatbotId, table.weekStart),
}));

/**
 * Monthly Analytics - For business reporting
 * Comprehensive monthly metrics for business intelligence
 */
export const chatbotMonthlyAnalytics = pgTable('chatbot_monthly_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  monthYear: varchar('month_year', { length: 7 }).notNull(), // Format: 'YYYY-MM'
  monthStart: timestamp('month_start', { withTimezone: true }).notNull(),
  monthEnd: timestamp('month_end', { withTimezone: true }).notNull(),

  // Monthly Totals
  totalConversations: integer('total_conversations').default(0),
  totalMessages: integer('total_messages').default(0),
  uniqueUsers: integer('unique_users').default(0),
  totalTokensUsed: integer('total_tokens_used').default(0),

  // Cost Metrics
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 4 }).default('0'),
  tokenCostBreakdown: jsonb('token_cost_breakdown').default({}),

  // User Engagement
  avgSessionDuration: integer('avg_session_duration').default(0), // seconds
  avgMessagesPerConversation: numeric('avg_messages_per_conversation', { precision: 5, scale: 2 }).default('0'),
  userRetentionRate: numeric('user_retention_rate', { precision: 5, scale: 4 }).default('0'), // Percentage

  // Performance Summary
  avgResponseTimeMs: integer('avg_response_time_ms').default(0),
  uptimePercentage: numeric('uptime_percentage', { precision: 5, scale: 2 }).default('100'),
  errorRate: numeric('error_rate', { precision: 5, scale: 4 }).default('0'),

  // Feature Usage
  vectorSearchUsage: integer('vector_search_usage').default(0),
  documentReferences: integer('document_references').default(0),
  feedbackSubmissions: integer('feedback_submissions').default(0),

  // Top Content
  topQuestionCategories: jsonb('top_question_categories').default({}),
  topIntegrations: jsonb('top_integrations').default({}),
  topErrorTypes: jsonb('top_error_types').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatbotMonthUnique: unique().on(table.chatbotId, table.monthYear),
  monthlyAnalyticsIdx: index('idx_monthly_analytics_chatbot_month').on(table.chatbotId, table.monthYear),
}));

/**
 * User Behavior Analytics - For user experience insights
 * Tracks user patterns and behavior across conversations
 */
export const userBehaviorAnalytics = pgTable('user_behavior_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(), // 'YYYY-MM-DD'

  // User Journey Metrics
  newUserConversations: integer('new_user_conversations').default(0),
  returningUserConversations: integer('returning_user_conversations').default(0),
  avgConversationsPerUser: numeric('avg_conversations_per_user', { precision: 5, scale: 2 }).default('0'),

  // Engagement Patterns
  shortConversations: integer('short_conversations').default(0), // 1-3 messages
  mediumConversations: integer('medium_conversations').default(0), // 4-10 messages
  longConversations: integer('long_conversations').default(0), // 11+ messages

  // Time-based Patterns
  hourlyDistribution: jsonb('hourly_distribution').default({}), // {"0": 5, "1": 2, ...}
  conversationDurations: jsonb('conversation_durations').default({}), // Duration buckets

  // User Satisfaction Indicators
  conversationsWithFeedback: integer('conversations_with_feedback').default(0),
  positiveThumbsUp: integer('positive_thumbs_up').default(0),
  negativeThumbsDown: integer('negative_thumbs_down').default(0),
  avgSatisfactionScore: numeric('avg_satisfaction_score', { precision: 3, scale: 2 }).default('0'),

  // Drop-off Analysis
  firstMessageDropoffs: integer('first_message_dropoffs').default(0),
  midConversationDropoffs: integer('mid_conversation_dropoffs').default(0),
  naturalCompletions: integer('natural_completions').default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  behaviorDateUnique: unique().on(table.chatbotId, table.date),
  behaviorAnalyticsIdx: index('idx_behavior_analytics_chatbot_date').on(table.chatbotId, table.date),
}));

/**
 * Performance Metrics - For system monitoring
 * Detailed performance tracking for optimization
 */
export const performanceMetrics = pgTable('performance_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  metricTimestamp: timestamp('metric_timestamp', { withTimezone: true }).notNull(),
  granularity: timeGranularityEnum('granularity').notNull(),

  // Response Time Metrics
  avgResponseTimeMs: integer('avg_response_time_ms').default(0),
  medianResponseTimeMs: integer('median_response_time_ms').default(0),
  p95ResponseTimeMs: integer('p95_response_time_ms').default(0),
  p99ResponseTimeMs: integer('p99_response_time_ms').default(0),

  // Throughput Metrics
  requestsPerSecond: numeric('requests_per_second', { precision: 8, scale: 2 }).default('0'),
  messagesProcessed: integer('messages_processed').default(0),

  // Resource Usage
  avgMemoryUsageMb: integer('avg_memory_usage_mb').default(0),
  avgCpuUsagePercent: numeric('avg_cpu_usage_percent', { precision: 5, scale: 2 }).default('0'),

  // Database Performance
  avgDbQueryTimeMs: integer('avg_db_query_time_ms').default(0),
  slowQueriesCount: integer('slow_queries_count').default(0),

  // Vector Search Performance
  avgVectorSearchTimeMs: integer('avg_vector_search_time_ms').default(0),
  vectorSearchCacheHitRate: numeric('vector_search_cache_hit_rate', { precision: 5, scale: 4 }).default('0'),

  // Error Rates
  errorRate: numeric('error_rate', { precision: 5, scale: 4 }).default('0'),
  timeoutRate: numeric('timeout_rate', { precision: 5, scale: 4 }).default('0'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  performanceTimeUnique: unique().on(table.chatbotId, table.metricTimestamp, table.granularity),
  performanceMetricsIdx: index('idx_performance_metrics_chatbot_time').on(table.chatbotId, table.metricTimestamp),
}));

/**
 * Feature Usage Analytics - For product development insights
 * Tracks usage of specific features across chatbots
 */
export const featureUsageAnalytics = pgTable('feature_usage_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(), // 'YYYY-MM-DD'

  // Core Features
  vectorSearchUsed: integer('vector_search_used').default(0),
  documentReferencesGenerated: integer('document_references_generated').default(0),
  contextMemoryAccessed: integer('context_memory_accessed').default(0),

  // Integration Features
  webEmbedUsage: integer('web_embed_usage').default(0),
  lineOaUsage: integer('line_oa_usage').default(0),
  apiDirectUsage: integer('api_direct_usage').default(0),

  // Advanced Features
  multiModelSwitching: integer('multi_model_switching').default(0),
  customPromptUsage: integer('custom_prompt_usage').default(0),
  feedbackCollection: integer('feedback_collection').default(0),

  // Content Features
  imageUploads: integer('image_uploads').default(0),
  documentUploads: integer('document_uploads').default(0),
  urlReferences: integer('url_references').default(0),

  // Administrative Features
  analyticsViewed: integer('analytics_viewed').default(0),
  settingsModified: integer('settings_modified').default(0),

  // Feature Performance
  featureSuccessRates: jsonb('feature_success_rates').default({}),
  featureResponseTimes: jsonb('feature_response_times').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  featureUsageDateUnique: unique().on(table.chatbotId, table.date),
  featureUsageIdx: index('idx_feature_usage_chatbot_date').on(table.chatbotId, table.date),
}));

/**
 * Real-time Dashboard Cache - For instant dashboard loading
 * Pre-calculated dashboard widgets updated every 5 minutes
 */
export const realtimeDashboardCache = pgTable('realtime_dashboard_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),

  // Current Activity (last 5 minutes)
  activeConversationsNow: integer('active_conversations_now').default(0),
  messagesLast5Min: integer('messages_last_5_min').default(0),
  avgResponseTimeLast5Min: integer('avg_response_time_last_5_min').default(0),
  errorsLast5Min: integer('errors_last_5_min').default(0),

  // Today's Metrics
  conversationsToday: integer('conversations_today').default(0),
  messagesToday: integer('messages_today').default(0),
  uniqueUsersToday: integer('unique_users_today').default(0),
  avgResponseTimeToday: integer('avg_response_time_today').default(0),

  // This Week
  conversationsThisWeek: integer('conversations_this_week').default(0),
  messagesThisWeek: integer('messages_this_week').default(0),
  uniqueUsersThisWeek: integer('unique_users_this_week').default(0),

  // This Month
  conversationsThisMonth: integer('conversations_this_month').default(0),
  messagesThisMonth: integer('messages_this_month').default(0),
  uniqueUsersThisMonth: integer('unique_users_this_month').default(0),

  // Growth Indicators (vs previous period)
  dailyGrowthPercent: numeric('daily_growth_percent', { precision: 5, scale: 2 }).default('0'),
  weeklyGrowthPercent: numeric('weekly_growth_percent', { precision: 5, scale: 2 }).default('0'),
  monthlyGrowthPercent: numeric('monthly_growth_percent', { precision: 5, scale: 2 }).default('0'),

  // Quick Stats
  topIntegrationToday: varchar('top_integration_today', { length: 50 }),
  peakHourToday: integer('peak_hour_today').default(0),
  totalTokensUsedToday: integer('total_tokens_used_today').default(0),

  lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  realtimeCacheUnique: unique().on(table.chatbotId),
  realtimeCacheIdx: index('idx_realtime_cache_chatbot').on(table.chatbotId),
}));

// TypeScript types for the new analytics tables
export type ChatbotHourlyAnalytics = typeof chatbotHourlyAnalytics.$inferSelect;
export type NewChatbotHourlyAnalytics = typeof chatbotHourlyAnalytics.$inferInsert;

export type ChatbotWeeklyAnalytics = typeof chatbotWeeklyAnalytics.$inferSelect;
export type NewChatbotWeeklyAnalytics = typeof chatbotWeeklyAnalytics.$inferInsert;

export type ChatbotMonthlyAnalytics = typeof chatbotMonthlyAnalytics.$inferSelect;
export type NewChatbotMonthlyAnalytics = typeof chatbotMonthlyAnalytics.$inferInsert;

export type UserBehaviorAnalytics = typeof userBehaviorAnalytics.$inferSelect;
export type NewUserBehaviorAnalytics = typeof userBehaviorAnalytics.$inferInsert;

export type PerformanceMetrics = typeof performanceMetrics.$inferSelect;
export type NewPerformanceMetrics = typeof performanceMetrics.$inferInsert;

export type FeatureUsageAnalytics = typeof featureUsageAnalytics.$inferSelect;
export type NewFeatureUsageAnalytics = typeof featureUsageAnalytics.$inferInsert;

export type RealtimeDashboardCache = typeof realtimeDashboardCache.$inferSelect;
export type NewRealtimeDashboardCache = typeof realtimeDashboardCache.$inferInsert;

/**
 * =============================================================================
 * VECTOR SEARCH ANALYTICS SCHEMA
 * Enhanced analytics for vector search accuracy improvements
 * =============================================================================
 */

/**
 * Search Events - Detailed tracking of all search operations
 */
export const searchEvents = pgTable('search_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id'),
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  query: text('query').notNull(),
  queryType: varchar('query_type', { length: 50 }), // 'vector', 'hybrid', 'keyword', 'adaptive'
  searchMethod: varchar('search_method', { length: 50 }), // 'basic', 'adaptive', 'enhanced', 'smart'

  // Search Parameters
  threshold: numeric('threshold', { precision: 3, scale: 2 }),
  limit: integer('limit'),
  enabledFeatures: jsonb('enabled_features'), // adaptive, fallback, enhancement, ranking
  filters: jsonb('filters'),

  // Results
  totalResults: integer('total_results').default(0),
  returnedResults: integer('returned_results').default(0),
  cached: boolean('cached').default(false),

  // Performance Metrics
  totalTime: integer('total_time'), // milliseconds
  vectorSearchTime: integer('vector_search_time'),
  keywordSearchTime: integer('keyword_search_time'),
  rankingTime: integer('ranking_time'),
  processingTime: integer('processing_time'),

  // Quality Metrics
  avgSimilarity: numeric('avg_similarity', { precision: 5, scale: 4 }),
  maxSimilarity: numeric('max_similarity', { precision: 5, scale: 4 }),
  minSimilarity: numeric('min_similarity', { precision: 5, scale: 4 }),
  resultsDiversity: numeric('results_diversity', { precision: 5, scale: 4 }),

  // User Interaction
  userSatisfaction: integer('user_satisfaction'), // 1-5 rating if provided
  clickedResults: jsonb('clicked_results'), // array of result indices clicked
  clickThroughRate: numeric('click_through_rate', { precision: 5, scale: 4 }),

  // System State
  systemLoad: numeric('system_load', { precision: 5, scale: 2 }),
  cacheHitRate: numeric('cache_hit_rate', { precision: 5, scale: 4 }),
  errorOccurred: boolean('error_occurred').default(false),
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  searchEventsIdx: index('idx_search_events_chatbot_created').on(table.chatbotId, table.createdAt),
  searchQueryIdx: index('idx_search_events_query').on(table.query),
  searchMethodIdx: index('idx_search_events_method').on(table.searchMethod),
}));

/**
 * Query Enhancement Tracking - Monitor query processing and improvements
 */
export const queryEnhancements = pgTable('query_enhancements', {
  id: uuid('id').primaryKey().defaultRandom(),
  searchEventId: uuid('search_event_id').references(() => searchEvents.id, { onDelete: 'cascade' }),
  originalQuery: text('original_query').notNull(),
  enhancedQuery: text('enhanced_query'),

  // Enhancement Types Applied
  synonymsAdded: jsonb('synonyms_added'), // array of synonyms
  spellingCorrected: boolean('spelling_corrected').default(false),
  domainTermsAdded: jsonb('domain_terms_added'), // cosmetic/INCI terms
  queryExpanded: boolean('query_expanded').default(false),

  // Enhancement Effectiveness
  improvementScore: numeric('improvement_score', { precision: 3, scale: 2 }), // 0-1, how much it helped
  originalResultCount: integer('original_result_count'),
  enhancedResultCount: integer('enhanced_result_count'),
  qualityImprovement: numeric('quality_improvement', { precision: 5, scale: 4 }),

  // Processing Time
  enhancementTime: integer('enhancement_time'), // milliseconds

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  queryEnhancementSearchIdx: index('idx_query_enhancements_search').on(table.searchEventId),
}));

/**
 * Result Ranking Metrics - Track ranking algorithm performance
 */
export const resultRankingMetrics = pgTable('result_ranking_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  searchEventId: uuid('search_event_id').references(() => searchEvents.id, { onDelete: 'cascade' }),

  // Ranking Algorithm Used
  rankingMethod: varchar('ranking_method', { length: 50 }), // 'similarity', 'hybrid', 'weighted', 'ml'
  rankingFactors: jsonb('ranking_factors'), // factors considered

  // Before/After Metrics
  originalOrder: jsonb('original_order'), // document IDs in original order
  rerankedOrder: jsonb('reranked_order'), // document IDs after reranking
  rankingChanges: integer('ranking_changes'), // number of position changes

  // Quality Metrics
  diversityScore: numeric('diversity_score', { precision: 5, scale: 4 }),
  relevanceScore: numeric('relevance_score', { precision: 5, scale: 4 }),
  freshnessScore: numeric('freshness_score', { precision: 5, scale: 4 }),
  qualityScore: numeric('quality_score', { precision: 5, scale: 4 }),

  // Performance
  rankingTime: integer('ranking_time'), // milliseconds
  documentsRanked: integer('documents_ranked'),

  // User Feedback
  userEngagement: jsonb('user_engagement'), // clicks, time spent
  rankingEffectiveness: numeric('ranking_effectiveness', { precision: 5, scale: 4 }), // 0-1 score

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  resultRankingSearchIdx: index('idx_result_ranking_search').on(table.searchEventId),
}));

/**
 * User Search Preferences - Learn and adapt to user behavior
 */
export const userSearchPreferences = pgTable('user_search_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'cascade' }),

  // Preferred Search Settings
  preferredThreshold: numeric('preferred_threshold', { precision: 3, scale: 2 }),
  preferredLimit: integer('preferred_limit'),
  preferredSearchType: varchar('preferred_search_type', { length: 50 }), // 'vector', 'hybrid', 'adaptive'

  // Content Preferences
  preferredCategories: jsonb('preferred_categories'),
  preferredSuppliers: jsonb('preferred_suppliers'),
  preferredDocumentTypes: jsonb('preferred_document_types'),

  // Interaction Patterns
  avgQueryLength: numeric('avg_query_length', { precision: 5, scale: 2 }),
  commonQueryTypes: jsonb('common_query_types'),
  clickPatterns: jsonb('click_patterns'),

  // Performance Preferences
  preferredSpeed: varchar('preferred_speed', { length: 20 }), // 'fast', 'balanced', 'thorough'
  qualityThreshold: numeric('quality_threshold', { precision: 3, scale: 2 }),

  // Learning Metrics
  searchCount: integer('search_count').default(0),
  satisfactionScore: numeric('satisfaction_score', { precision: 3, scale: 2 }),
  lastAdaptation: timestamp('last_adaptation', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userSearchPrefUnique: unique().on(table.userId, table.chatbotId),
  userSearchPrefIdx: index('idx_user_search_preferences').on(table.userId, table.chatbotId),
}));

/**
 * Search Performance Metrics - System-wide performance tracking
 */
export const searchPerformanceMetrics = pgTable('search_performance_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  metricDate: timestamp('metric_date', { withTimezone: true }).defaultNow().notNull(),
  timeWindow: varchar('time_window', { length: 10 }), // 'hour', 'day', 'week'

  // Volume Metrics
  totalSearches: integer('total_searches').default(0),
  uniqueUsers: integer('unique_users').default(0),
  avgSearchesPerUser: numeric('avg_searches_per_user', { precision: 5, scale: 2 }),

  // Performance Metrics
  avgResponseTime: integer('avg_response_time'),
  p95ResponseTime: integer('p95_response_time'),
  p99ResponseTime: integer('p99_response_time'),

  // Quality Metrics
  avgResultCount: numeric('avg_result_count', { precision: 5, scale: 2 }),
  avgSimilarityScore: numeric('avg_similarity_score', { precision: 5, scale: 4 }),
  cacheHitRate: numeric('cache_hit_rate', { precision: 5, scale: 4 }),

  // Search Type Distribution
  vectorSearchCount: integer('vector_search_count').default(0),
  hybridSearchCount: integer('hybrid_search_count').default(0),
  adaptiveSearchCount: integer('adaptive_search_count').default(0),
  keywordSearchCount: integer('keyword_search_count').default(0),

  // Error Metrics
  errorRate: numeric('error_rate', { precision: 5, scale: 4 }),
  timeoutRate: numeric('timeout_rate', { precision: 5, scale: 4 }),

  // Enhancement Metrics
  queryEnhancementRate: numeric('query_enhancement_rate', { precision: 5, scale: 4 }),
  rankingImprovementScore: numeric('ranking_improvement_score', { precision: 5, scale: 4 }),

  // System Health
  systemLoad: numeric('system_load', { precision: 5, scale: 2 }),
  memoryUsage: numeric('memory_usage', { precision: 5, scale: 2 }),
  dbConnectionPool: integer('db_connection_pool'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  searchPerfChatbotDateUnique: unique().on(table.chatbotId, table.metricDate, table.timeWindow),
  searchPerfIdx: index('idx_search_performance_chatbot_date').on(table.chatbotId, table.metricDate),
}));

/**
 * Query Patterns - Analyze common search patterns and trends
 */
export const queryPatterns = pgTable('query_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(), // normalized pattern
  originalQueries: jsonb('original_queries'), // examples of this pattern

  // Pattern Characteristics
  patternType: varchar('pattern_type', { length: 50 }), // 'product_search', 'technical', 'comparison'
  complexity: varchar('complexity', { length: 20 }), // 'simple', 'medium', 'complex'
  domain: varchar('domain', { length: 30 }), // 'cosmetic', 'technical', 'general'

  // Usage Statistics
  frequency: integer('frequency').default(1),
  uniqueUsers: integer('unique_users').default(1),
  avgResultCount: numeric('avg_result_count', { precision: 5, scale: 2 }),
  avgSatisfaction: numeric('avg_satisfaction', { precision: 3, scale: 2 }),

  // Performance
  avgResponseTime: integer('avg_response_time'),
  successRate: numeric('success_rate', { precision: 5, scale: 4 }),

  // Optimization Opportunities
  needsEnhancement: boolean('needs_enhancement').default(false),
  recommendedOptimizations: jsonb('recommended_optimizations'),

  // Temporal Patterns
  peakHours: jsonb('peak_hours'),
  seasonality: jsonb('seasonality'),

  firstSeen: timestamp('first_seen', { withTimezone: true }).defaultNow().notNull(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  queryPatternChatbotUnique: unique().on(table.chatbotId, table.pattern),
  queryPatternIdx: index('idx_query_patterns_chatbot').on(table.chatbotId),
  queryPatternFreqIdx: index('idx_query_patterns_frequency').on(table.frequency),
}));

/**
 * Document Access Analytics - Track document interaction and relevance
 */
export const documentAccessAnalytics = pgTable('document_access_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').notNull(),
  chunkId: text('chunk_id'),

  // Access Patterns
  accessCount: integer('access_count').default(1),
  uniqueUsers: integer('unique_users').default(1),
  avgPosition: numeric('avg_position', { precision: 5, scale: 2 }), // average position in search results
  clickThroughRate: numeric('click_through_rate', { precision: 5, scale: 4 }),

  // Search Context
  commonQueries: jsonb('common_queries'), // queries that find this document
  searchMethods: jsonb('search_methods'), // how it's typically found

  // Quality Metrics
  avgSimilarityScore: numeric('avg_similarity_score', { precision: 5, scale: 4 }),
  userRating: numeric('user_rating', { precision: 3, scale: 2 }),
  bounceRate: numeric('bounce_rate', { precision: 5, scale: 4 }),

  // Content Characteristics
  contentCategory: varchar('content_category', { length: 100 }),
  contentSupplier: varchar('content_supplier', { length: 100 }),
  documentSize: integer('document_size'),
  chunkPosition: integer('chunk_position'),

  // Performance Impact
  loadTime: integer('load_time'),
  processingTime: integer('processing_time'),

  // Trends
  trendingScore: numeric('trending_score', { precision: 5, scale: 4 }), // recent popularity
  seasonalityPattern: jsonb('seasonality_pattern'),

  lastAccessed: timestamp('last_accessed', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  docAccessChatbotDocUnique: unique().on(table.chatbotId, table.documentId, table.chunkId),
  docAccessIdx: index('idx_document_access_chatbot').on(table.chatbotId),
  docAccessFreqIdx: index('idx_document_access_count').on(table.accessCount),
}));

/**
 * Vector Search Specific Types
 */
export type SearchEvent = typeof searchEvents.$inferSelect;
export type NewSearchEvent = typeof searchEvents.$inferInsert;

export type QueryEnhancement = typeof queryEnhancements.$inferSelect;
export type NewQueryEnhancement = typeof queryEnhancements.$inferInsert;

export type ResultRankingMetric = typeof resultRankingMetrics.$inferSelect;
export type NewResultRankingMetric = typeof resultRankingMetrics.$inferInsert;

export type UserSearchPreference = typeof userSearchPreferences.$inferSelect;
export type NewUserSearchPreference = typeof userSearchPreferences.$inferInsert;

export type SearchPerformanceMetric = typeof searchPerformanceMetrics.$inferSelect;
export type NewSearchPerformanceMetric = typeof searchPerformanceMetrics.$inferInsert;

export type QueryPattern = typeof queryPatterns.$inferSelect;
export type NewQueryPattern = typeof queryPatterns.$inferInsert;

export type DocumentAccessAnalytic = typeof documentAccessAnalytics.$inferSelect;
export type NewDocumentAccessAnalytic = typeof documentAccessAnalytics.$inferInsert;