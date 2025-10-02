import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  uuid,
  jsonb,
  integer,
  vector,
  primaryKey,
  unique,
  pgEnum,
  index
} from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  cognitoUserId: varchar('cognito_user_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// System Settings table
export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  isPublic: boolean('is_public').default(false),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Activity Logs table
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  activityType: varchar('activity_type', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }),
  entityId: varchar('entity_id', { length: 255 }),
  description: text('description'),
  metadata: jsonb('metadata'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Documents table
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  filename: varchar('filename', { length: 255 }),
  mimeType: varchar('mime_type', { length: 100 }),
  fileSize: integer('file_size'),
  s3Key: varchar('s3_key', { length: 500 }),
  s3Bucket: varchar('s3_bucket', { length: 100 }),
  content: text('content'),
  extractedText: text('extracted_text'),
  metadata: jsonb('metadata'),
  processingStatus: varchar('processing_status', { length: 50 }).default('pending'),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Document Chunks table (for vector embeddings)
export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }), // OpenAI/Titan embedding dimension
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  documentChunkIndex: unique().on(table.documentId, table.chunkIndex),
}));

// Suppliers table
export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  contactInfo: jsonb('contact_info'),
  address: text('address'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Products table
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sku: varchar('sku', { length: 100 }).unique(),
  category: varchar('category', { length: 100 }),
  supplierId: uuid('supplier_id').references(() => suppliers.id),
  specifications: jsonb('specifications'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Search Queries table
export const searchQueries = pgTable('search_queries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  query: text('query').notNull(),
  filters: jsonb('filters'),
  resultsCount: integer('results_count'),
  responseTime: integer('response_time'), // in milliseconds
  sessionId: varchar('session_id', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Search Results Cache table
export const searchResultsCache = pgTable('search_results_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  queryHash: varchar('query_hash', { length: 64 }).unique().notNull(),
  query: text('query').notNull(),
  filters: jsonb('filters'),
  results: jsonb('results').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Chatbot Management Enums
export const chatbotStatusEnum = pgEnum('chatbot_status', ['active', 'inactive', 'testing']);
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);
export const integrationTypeEnum = pgEnum('integration_type', ['web_embed', 'line_oa', 'api']);
export const promptGenerationStatusEnum = pgEnum('prompt_generation_status', ['pending', 'processing', 'completed', 'failed']);

// Core Chatbot Management Tables

// Chatbot Instances table
export const chatbotInstances = pgTable('chatbot_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  status: chatbotStatusEnum('status').default('testing'),
  apiKeyHash: varchar('api_key_hash', { length: 255 }).unique().notNull(),
  apiKeyHint: varchar('api_key_hint', { length: 8 }).notNull(),
  configuration: jsonb('configuration').default({
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 500,
    language: 'en',
    responseTimeout: 30
  }),
  knowledgeSourceFilters: jsonb('knowledge_source_filters').default({}),
  currentSystemPrompt: text('current_system_prompt'),
  welcomeMessage: text('welcome_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// System Prompt History table
export const chatbotPromptHistory = pgTable('chatbot_prompt_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  promptText: text('prompt_text').notNull(),
  version: integer('version').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  generationMethod: varchar('generation_method', { length: 50 }), // 'manual' or 'ai_generated'
  generationMetadata: jsonb('generation_metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatbotVersionUnique: unique().on(table.chatbotId, table.version),
}));

// AI Prompt Generation Jobs table
export const promptGenerationJobs = pgTable('prompt_generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').references(() => users.id),
  status: promptGenerationStatusEnum('status').default('pending'),
  inputFiles: jsonb('input_files').default([]), // Array of file paths
  contextDescription: text('context_description'),
  generationParameters: jsonb('generation_parameters').default({}),
  generatedPrompt: text('generated_prompt'),
  errorMessage: text('error_message'),
  processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Chatbot Integration Configurations table
export const chatbotIntegrations = pgTable('chatbot_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  integrationType: integrationTypeEnum('integration_type').notNull(),
  isActive: boolean('is_active').default(true),
  configuration: jsonb('configuration').default({}), // Store platform-specific config
  webhookSecret: varchar('webhook_secret', { length: 255 }), // For webhook validation
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatbotIntegrationUnique: unique().on(table.chatbotId, table.integrationType),
}));

// Conversation Management Tables

// Conversation Sessions table
export const chatbotConversations = pgTable('chatbot_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  integrationType: integrationTypeEnum('integration_type').notNull(),
  userIdentifier: varchar('user_identifier', { length: 255 }), // Could be Line user ID, web session, etc.
  metadata: jsonb('metadata').default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatbotSessionUnique: unique().on(table.chatbotId, table.sessionId),
}));

// Conversation Messages table
export const chatbotMessages = pgTable('chatbot_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => chatbotConversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}), // Store tokens used, processing time, etc.
  vectorSearchResults: jsonb('vector_search_results').default([]), // Store related document chunks
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Conversation Context table (for memory and context management)
export const conversationContext = pgTable('conversation_context', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => chatbotConversations.id, { onDelete: 'cascade' }),
  contextKey: varchar('context_key', { length: 255 }).notNull(),
  contextValue: jsonb('context_value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  conversationContextUnique: unique().on(table.conversationId, table.contextKey),
}));

// Chatbot Playground Sessions table (for testing environment)
export const chatbotPlaygroundSessions = pgTable('chatbot_playground_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  sessionConfig: jsonb('session_config').default({}), // Override chatbot config for testing
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

// Analytics & Monitoring Tables

// Chatbot Analytics table (for daily usage metrics)
export const chatbotAnalytics = pgTable('chatbot_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(), // Store as 'YYYY-MM-DD' format
  totalConversations: integer('total_conversations').default(0),
  totalMessages: integer('total_messages').default(0),
  uniqueUsers: integer('unique_users').default(0),
  avgConversationLength: integer('avg_conversation_length').default(0), // Average messages per conversation
  avgResponseTimeMs: integer('avg_response_time_ms').default(0),
  successfulQueries: integer('successful_queries').default(0),
  failedQueries: integer('failed_queries').default(0),
  integrationBreakdown: jsonb('integration_breakdown').default({}), // {"web_embed": 10, "line_oa": 5}
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatbotDateUnique: unique().on(table.chatbotId, table.date),
}));

// Chatbot Errors table (for error tracking and debugging)
export const chatbotErrors = pgTable('chatbot_errors', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => chatbotConversations.id, { onDelete: 'cascade' }),
  errorType: varchar('error_type', { length: 100 }).notNull(),
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details').default({}),
  stackTrace: text('stack_trace'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
});

// Message Feedback table (for user satisfaction collection)
export const messageFeedback = pgTable('message_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => chatbotMessages.id, { onDelete: 'cascade' }),
  feedbackType: varchar('feedback_type', { length: 50 }).notNull(), // 'helpful', 'not_helpful', 'inappropriate'
  feedbackText: text('feedback_text'),
  userIdentifier: varchar('user_identifier', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  messageFeedbackUnique: unique().on(table.messageId, table.userIdentifier),
}));

// API Rate Limits table (for rate limiting and abuse prevention)
export const apiRateLimits = pgTable('api_rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  identifier: varchar('identifier', { length: 255 }).notNull(), // IP address or user ID
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  requestCount: integer('request_count').default(1),
}, (table) => ({
  rateLimitUnique: unique().on(table.chatbotId, table.identifier, table.windowStart),
}));

// TypeScript types for the schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;

export type SearchResultsCache = typeof searchResultsCache.$inferSelect;
export type NewSearchResultsCache = typeof searchResultsCache.$inferInsert;

// Chatbot Management types
export type ChatbotInstance = typeof chatbotInstances.$inferSelect;
export type NewChatbotInstance = typeof chatbotInstances.$inferInsert;

export type ChatbotPromptHistory = typeof chatbotPromptHistory.$inferSelect;
export type NewChatbotPromptHistory = typeof chatbotPromptHistory.$inferInsert;

export type PromptGenerationJob = typeof promptGenerationJobs.$inferSelect;
export type NewPromptGenerationJob = typeof promptGenerationJobs.$inferInsert;

export type ChatbotIntegration = typeof chatbotIntegrations.$inferSelect;
export type NewChatbotIntegration = typeof chatbotIntegrations.$inferInsert;

// Conversation Management types
export type ChatbotConversation = typeof chatbotConversations.$inferSelect;
export type NewChatbotConversation = typeof chatbotConversations.$inferInsert;

export type ChatbotMessage = typeof chatbotMessages.$inferSelect;
export type NewChatbotMessage = typeof chatbotMessages.$inferInsert;

export type ConversationContext = typeof conversationContext.$inferSelect;
export type NewConversationContext = typeof conversationContext.$inferInsert;

export type ChatbotPlaygroundSession = typeof chatbotPlaygroundSessions.$inferSelect;
export type NewChatbotPlaygroundSession = typeof chatbotPlaygroundSessions.$inferInsert;

// Analytics & Monitoring types
export type ChatbotAnalytics = typeof chatbotAnalytics.$inferSelect;
export type NewChatbotAnalytics = typeof chatbotAnalytics.$inferInsert;

export type ChatbotError = typeof chatbotErrors.$inferSelect;
export type NewChatbotError = typeof chatbotErrors.$inferInsert;

export type MessageFeedback = typeof messageFeedback.$inferSelect;
export type NewMessageFeedback = typeof messageFeedback.$inferInsert;

export type ApiRateLimit = typeof apiRateLimits.$inferSelect;
export type NewApiRateLimit = typeof apiRateLimits.$inferInsert;

// Chatbot-specific types
export type ChatbotStatus = 'active' | 'inactive' | 'testing';
export type MessageRole = 'user' | 'assistant' | 'system';
export type IntegrationType = 'web_embed' | 'line_oa' | 'api';
export type PromptGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ChatbotConfiguration {
  model: string;
  temperature: number;
  maxTokens: number;
  language: string;
  responseTimeout: number;
  [key: string]: any;
}

export interface KnowledgeSourceFilters {
  documentTypes?: string[];
  categories?: string[];
  supplierIds?: string[];
  [key: string]: any;
}

export interface PromptGenerationParameters {
  tone?: string;
  style?: string;
  context?: string;
  additionalInstructions?: string;
  [key: string]: any;
}

// Conversation-specific interfaces
export interface ConversationMetadata {
  source?: 'playground' | 'website' | 'line_oa' | 'api';
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  [key: string]: any;
}

export interface MessageMetadata {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  vectorSearchTime?: number;
  llmResponseTime?: number;
  [key: string]: any;
}

export interface VectorSearchResult {
  documentId: string;
  chunkId: string;
  content: string;
  similarity: number;
  metadata: {
    documentName?: string;
    category?: string;
    supplier?: string;
    [key: string]: any;
  };
}

export interface PlaygroundSessionConfig {
  temperature?: number;
  maxTokens?: number;
  systemPromptOverride?: string;
  [key: string]: any;
}

// Admin Settings specific types
export type AdminSettingsKey =
  | 'mistral_ocr_api_key'
  | 'aws_bedrock_credentials'
  | 'default_llm_model'
  | 's3_document_bucket'
  | 'embedding_model';

export interface AdminSetting {
  key: AdminSettingsKey;
  value: any;
  description?: string;
  is_sensitive: boolean;
  masked_value?: string | any;
  updated_at: Date;
  updated_by_name?: string;
}

export interface AwsBedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

// =============================================================================
// PHASE 1.4: INTEGRATION SUPPORT TABLES
// =============================================================================

// Line OA Integration Configuration
export const lineOaConfigs = pgTable('line_oa_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  channelId: varchar('channel_id', { length: 255 }).notNull().unique(),
  channelSecret: varchar('channel_secret', { length: 255 }).notNull(),
  channelAccessToken: text('channel_access_token').notNull(),
  webhookUrl: varchar('webhook_url', { length: 500 }),
  verificationToken: varchar('verification_token', { length: 255 }),
  richMenuId: varchar('rich_menu_id', { length: 255 }),
  greetingMessage: text('greeting_message'),
  settings: jsonb('settings').default({}),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// JavaScript Widget Configuration
export const chatbotWidgetConfigs = pgTable('chatbot_widget_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  version: varchar('version', { length: 50 }).default('1.0.0'),
  theme: jsonb('theme').default({}),
  position: varchar('position', { length: 50 }).default('bottom-right'),
  triggerDelay: integer('trigger_delay_ms').default(3000),
  allowedDomains: jsonb('allowed_domains').default([]),
  customCss: text('custom_css'),
  welcomeMessage: text('welcome_message'),
  placeholderText: varchar('placeholder_text', { length: 255 }).default('Type your message...'),
  headerTitle: varchar('header_title', { length: 255 }),
  headerSubtitle: varchar('header_subtitle', { length: 255 }),
  showBranding: boolean('show_branding').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Multi-language Support
export const chatbotTranslations = pgTable('chatbot_translations', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  languageCode: varchar('language_code', { length: 10 }).notNull(), // e.g., 'en', 'th', 'zh-CN'
  translationKey: varchar('translation_key', { length: 255 }).notNull(),
  translationValue: text('translation_value').notNull(),
  context: varchar('context', { length: 100 }), // e.g., 'greeting', 'error', 'button'
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Security Audit Log
export const securityAuditLog = pgTable('security_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(), // e.g., 'login', 'config_change', 'api_access'
  resourceType: varchar('resource_type', { length: 50 }), // e.g., 'chatbot', 'user', 'settings'
  resourceId: varchar('resource_id', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  details: jsonb('details').default({}),
  severity: varchar('severity', { length: 20 }).default('info'), // info, warning, critical
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// System Configuration
export const systemConfigs = pgTable('system_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  configKey: varchar('config_key', { length: 255 }).notNull().unique(),
  configValue: jsonb('config_value').notNull(),
  description: text('description'),
  isPublic: boolean('is_public').default(false), // Can be accessed by non-admin users
  category: varchar('category', { length: 100 }).default('general'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
});

// Composite indexes for performance
// Temporarily commented out to debug JSON parsing issue
// export const lineOaConfigsIndex = index('idx_line_oa_configs_chatbot').on(lineOaConfigs.chatbotId);
// export const widgetConfigsIndex = index('idx_widget_configs_chatbot').on(chatbotWidgetConfigs.chatbotId);
// export const translationsIndex = index('idx_translations_chatbot_lang').on(chatbotTranslations.chatbotId, chatbotTranslations.languageCode);
// export const translationsKeyIndex = index('idx_translations_key_lang').on(chatbotTranslations.translationKey, chatbotTranslations.languageCode);
// export const auditLogUserIndex = index('idx_audit_log_user_created').on(securityAuditLog.userId, securityAuditLog.createdAt);
// export const auditLogChatbotIndex = index('idx_audit_log_chatbot_created').on(securityAuditLog.chatbotId, securityAuditLog.createdAt);
// export const systemConfigsCategoryIndex = index('idx_system_configs_category').on(systemConfigs.category);

// TypeScript types for integration support
export type LineOaConfig = typeof lineOaConfigs.$inferSelect;
export type NewLineOaConfig = typeof lineOaConfigs.$inferInsert;

export type ChatbotWidgetConfig = typeof chatbotWidgetConfigs.$inferSelect;
export type NewChatbotWidgetConfig = typeof chatbotWidgetConfigs.$inferInsert;

export type ChatbotTranslation = typeof chatbotTranslations.$inferSelect;
export type NewChatbotTranslation = typeof chatbotTranslations.$inferInsert;

export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type NewSecurityAuditLog = typeof securityAuditLog.$inferInsert;

export type SystemConfig = typeof systemConfigs.$inferSelect;
export type NewSystemConfig = typeof systemConfigs.$inferInsert;

// Widget theme interface
export interface WidgetTheme {
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  borderRadius?: string;
  fontFamily?: string;
  fontSize?: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  bubbleBackgroundColor?: string;
  bubbleTextColor?: string;
  userBubbleBackgroundColor?: string;
  userBubbleTextColor?: string;
  [key: string]: any;
}

// Line OA settings interface
export interface LineOaSettings {
  autoReply?: boolean;
  greetingEnabled?: boolean;
  richMenuEnabled?: boolean;
  trackingEnabled?: boolean;
  allowGroupChat?: boolean;
  maxResponseLength?: number;
  [key: string]: any;
}