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

// WebSocket Sessions table (for tracking active WebSocket connections)
export const websocketSessions = pgTable('websocket_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId: varchar('connection_id', { length: 255 }).notNull().unique(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').default({}), // Store additional connection info
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
  lastPingAt: timestamp('last_ping_at', { withTimezone: true }).defaultNow(),
  lastPongAt: timestamp('last_pong_at', { withTimezone: true }).defaultNow(),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
}, (table) => ({
  userConnectionIndex: index('websocket_sessions_user_id_idx').on(table.userId),
  activeConnectionIndex: index('websocket_sessions_active_idx').on(table.isActive),
}));

// Real-time Message Queue table (for offline message delivery)
export const realtimeMessageQueue = pgTable('realtime_message_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageType: varchar('message_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  priority: integer('priority').default(5), // 1-10, higher = more important
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
}, (table) => ({
  userQueueIndex: index('realtime_queue_user_id_idx').on(table.userId),
  scheduleIndex: index('realtime_queue_scheduled_idx').on(table.scheduledFor),
  deliveryIndex: index('realtime_queue_delivery_idx').on(table.deliveredAt),
}));

// WebSocket Room Memberships table (for tracking room participants)
export const websocketRoomMemberships = pgTable('websocket_room_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => websocketSessions.id, { onDelete: 'cascade' }),
  roomId: varchar('room_id', { length: 255 }).notNull(),
  roomType: varchar('room_type', { length: 50 }).notNull(), // 'chatbot', 'admin', 'user', 'analytics'
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  leftAt: timestamp('left_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
}, (table) => ({
  sessionRoomIndex: unique().on(table.sessionId, table.roomId),
  roomActiveIndex: index('websocket_rooms_active_idx').on(table.roomId, table.isActive),
}));

// WebSocket Connection Analytics table (for monitoring connection health)
export const websocketConnectionAnalytics = pgTable('websocket_connection_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => websocketSessions.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'ping', 'pong', 'message_sent', 'message_received', 'error'
  latencyMs: integer('latency_ms'),
  messageSize: integer('message_size'), // For sent/received messages
  errorCode: varchar('error_code', { length: 50 }),
  metadata: jsonb('metadata').default({}),
}, (table) => ({
  sessionAnalyticsIndex: index('websocket_analytics_session_idx').on(table.sessionId, table.timestamp),
  eventTypeIndex: index('websocket_analytics_event_idx').on(table.eventType, table.timestamp),
}));

// WebSocket types
export type WebSocketSession = typeof websocketSessions.$inferSelect;
export type NewWebSocketSession = typeof websocketSessions.$inferInsert;

export type RealtimeMessageQueue = typeof realtimeMessageQueue.$inferSelect;
export type NewRealtimeMessageQueue = typeof realtimeMessageQueue.$inferInsert;

export type WebSocketRoomMembership = typeof websocketRoomMemberships.$inferSelect;
export type NewWebSocketRoomMembership = typeof websocketRoomMemberships.$inferInsert;

export type WebSocketConnectionAnalytics = typeof websocketConnectionAnalytics.$inferSelect;
export type NewWebSocketConnectionAnalytics = typeof websocketConnectionAnalytics.$inferInsert;

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

// =============================================================================
// PHASE 5.1: API SECURITY TABLES
// =============================================================================

// API Keys table (for external API access)
export const apiKeys = pgTable('api_keys', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopes: jsonb('scopes').default([]).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  apiKeyUserIndex: index('idx_api_keys_user').on(table.userId),
  apiKeyHashIndex: index('idx_api_keys_hash').on(table.keyHash),
  apiKeyExpiryIndex: index('idx_api_keys_expiry').on(table.expiresAt),
}));

// Enhanced activity logs for security events
export const securityEvents = pgTable('security_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 100 }).notNull(), // 'auth_failure', 'rate_limit_exceeded', 'api_key_used'
  severity: varchar('severity', { length: 20 }).notNull().default('info'), // 'info', 'warning', 'critical'
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  endpoint: varchar('endpoint', { length: 255 }),
  method: varchar('method', { length: 10 }),
  statusCode: integer('status_code'),
  details: jsonb('details').default({}),
  blocked: boolean('blocked').default(false), // Whether the request was blocked
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  securityEventTypeIndex: index('idx_security_events_type').on(table.eventType, table.createdAt),
  securityEventUserIndex: index('idx_security_events_user').on(table.userId, table.createdAt),
  securityEventIpIndex: index('idx_security_events_ip').on(table.ipAddress, table.createdAt),
  securityEventSeverityIndex: index('idx_security_events_severity').on(table.severity, table.createdAt),
}));

// CORS Domain Whitelist
export const corsWhitelist = pgTable('cors_whitelist', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  addedBy: uuid('added_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// TypeScript types for API security
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;

export type CorsWhitelist = typeof corsWhitelist.$inferSelect;
export type NewCorsWhitelist = typeof corsWhitelist.$inferInsert;

// =============================================================================
// PHASE 5.2: CONTENT MODERATION TABLES
// =============================================================================

// Content Moderation Rules Enum
export const moderationSeverityEnum = pgEnum('moderation_severity', ['low', 'medium', 'high', 'critical']);
export const moderationRuleTypeEnum = pgEnum('moderation_rule_type', ['profanity', 'spam', 'toxicity', 'custom_pattern', 'ai_detection']);
export const violationStatusEnum = pgEnum('violation_status', ['pending', 'approved', 'rejected', 'escalated', 'resolved']);
export const reviewStatusEnum = pgEnum('review_status', ['pending', 'in_review', 'approved', 'rejected', 'escalated']);
export const appealStatusEnum = pgEnum('appeal_status', ['pending', 'approved', 'rejected', 'under_review']);

// Content Moderation Rules table
export const contentModerationRules = pgTable('content_moderation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ruleType: moderationRuleTypeEnum('rule_type').notNull(),
  configuration: jsonb('configuration').notNull(), // Store rule-specific config (keywords, patterns, thresholds)
  severityLevel: moderationSeverityEnum('severity_level').notNull(),
  isActive: boolean('is_active').default(true),
  autoAction: varchar('auto_action', { length: 50 }).default('flag'), // 'block', 'flag', 'escalate'
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  ruleTypeIndex: index('idx_moderation_rules_type').on(table.ruleType),
  severityIndex: index('idx_moderation_rules_severity').on(table.severityLevel),
  activeRulesIndex: index('idx_moderation_rules_active').on(table.isActive),
}));

// Content Moderation Violations table
export const contentModerationViolations = pgTable('content_moderation_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => chatbotMessages.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').notNull().references(() => contentModerationRules.id),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  chatbotId: uuid('chatbot_id').notNull().references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  violationType: moderationRuleTypeEnum('violation_type').notNull(),
  severity: moderationSeverityEnum('severity').notNull(),
  status: violationStatusEnum('status').default('pending'),
  confidenceScore: integer('confidence_score'), // 0-100 confidence level for AI detections
  originalContent: text('original_content').notNull(), // Store original content for review
  flaggedContent: text('flagged_content'), // Specific flagged portion
  userIdentifier: varchar('user_identifier', { length: 255 }), // IP or session ID for anonymous users
  adminNotes: text('admin_notes'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  violationMessageIndex: index('idx_violations_message').on(table.messageId),
  violationUserIndex: index('idx_violations_user').on(table.userId, table.createdAt),
  violationChatbotIndex: index('idx_violations_chatbot').on(table.chatbotId, table.createdAt),
  violationStatusIndex: index('idx_violations_status').on(table.status, table.createdAt),
  violationSeverityIndex: index('idx_violations_severity').on(table.severity, table.createdAt),
}));

// Content Moderation Reviews table (Admin review workflow)
export const contentModerationReviews = pgTable('content_moderation_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  violationId: uuid('violation_id').notNull().references(() => contentModerationViolations.id, { onDelete: 'cascade' }),
  assignedTo: uuid('assigned_to').references(() => users.id),
  reviewStatus: reviewStatusEnum('review_status').default('pending'),
  adminAction: varchar('admin_action', { length: 50 }), // 'approve', 'reject', 'escalate', 'require_appeal'
  adminNotes: text('admin_notes'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  escalationReason: text('escalation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reviewViolationIndex: index('idx_reviews_violation').on(table.violationId),
  reviewAssignedIndex: index('idx_reviews_assigned').on(table.assignedTo, table.reviewStatus),
  reviewStatusIndex: index('idx_reviews_status').on(table.reviewStatus, table.createdAt),
  reviewedByIndex: index('idx_reviews_reviewed_by').on(table.reviewedBy, table.reviewedAt),
}));

// Content Moderation Appeals table (User appeal system)
export const contentModerationAppeals = pgTable('content_moderation_appeals', {
  id: uuid('id').primaryKey().defaultRandom(),
  violationId: uuid('violation_id').notNull().references(() => contentModerationViolations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  userIdentifier: varchar('user_identifier', { length: 255 }), // For anonymous users
  appealReason: text('appeal_reason').notNull(),
  additionalContext: text('additional_context'),
  status: appealStatusEnum('status').default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  adminResponse: text('admin_response'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  appealViolationIndex: index('idx_appeals_violation').on(table.violationId),
  appealUserIndex: index('idx_appeals_user').on(table.userId, table.createdAt),
  appealStatusIndex: index('idx_appeals_status').on(table.status, table.createdAt),
  appealReviewedByIndex: index('idx_appeals_reviewed_by').on(table.reviewedBy, table.reviewedAt),
}));

// Content Moderation Analytics table (For tracking moderation effectiveness)
export const contentModerationAnalytics = pgTable('content_moderation_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: varchar('date', { length: 10 }).notNull(), // Store as 'YYYY-MM-DD' format
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'cascade' }),
  totalMessages: integer('total_messages').default(0),
  flaggedMessages: integer('flagged_messages').default(0),
  blockedMessages: integer('blocked_messages').default(0),
  falsePositives: integer('false_positives').default(0),
  approvedViolations: integer('approved_violations').default(0),
  appealSubmitted: integer('appeals_submitted').default(0),
  appealsApproved: integer('appeals_approved').default(0),
  ruleBreakdown: jsonb('rule_breakdown').default({}), // {"profanity": 5, "spam": 2}
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  analyticsDateIndex: index('idx_moderation_analytics_date').on(table.date),
  analyticsChatbotIndex: index('idx_moderation_analytics_chatbot').on(table.chatbotId, table.date),
}));

// TypeScript types for content moderation
export type ContentModerationRule = typeof contentModerationRules.$inferSelect;
export type NewContentModerationRule = typeof contentModerationRules.$inferInsert;

export type ContentModerationViolation = typeof contentModerationViolations.$inferSelect;
export type NewContentModerationViolation = typeof contentModerationViolations.$inferInsert;

export type ContentModerationReview = typeof contentModerationReviews.$inferSelect;
export type NewContentModerationReview = typeof contentModerationReviews.$inferInsert;

export type ContentModerationAppeal = typeof contentModerationAppeals.$inferSelect;
export type NewContentModerationAppeal = typeof contentModerationAppeals.$inferInsert;

export type ContentModerationAnalytics = typeof contentModerationAnalytics.$inferSelect;
export type NewContentModerationAnalytics = typeof contentModerationAnalytics.$inferInsert;

// Content moderation interfaces
export interface ModerationRuleConfiguration {
  keywords?: string[];
  patterns?: string[];
  thresholds?: {
    toxicity?: number;
    spam?: number;
    sentiment?: number;
  };
  whitelist?: string[];
  customLogic?: string;
  [key: string]: any;
}

export interface ModerationContext {
  messageContent: string;
  userId?: string;
  chatbotId: string;
  conversationId: string;
  userIdentifier: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    [key: string]: any;
  };
}

export interface ModerationResult {
  isViolation: boolean;
  violatedRules: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  action: 'allow' | 'flag' | 'block' | 'escalate';
  flaggedContent?: string;
  reasoning?: string;
}

// Enhanced message feedback types for reporting
export const reportCategoryEnum = pgEnum('report_category', [
  'spam',
  'inappropriate',
  'harassment',
  'misinformation',
  'offensive_language',
  'privacy_violation',
  'copyright',
  'other'
]);

// =============================================================================
// PHASE 6.3: PUBLIC API FRAMEWORK TABLES
// =============================================================================

// API Usage Tracking table (for analytics and billing)
export const apiUsage = pgTable('api_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiKeyId: varchar('api_key_id', { length: 255 }).notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  endpoint: varchar('endpoint', { length: 255 }).notNull(),
  method: varchar('method', { length: 10 }).notNull(),
  chatbotId: uuid('chatbot_id').references(() => chatbotInstances.id, { onDelete: 'set null' }),
  userId: varchar('user_id', { length: 255 }),
  messageLength: integer('message_length'),
  tokensUsed: integer('tokens_used'),
  responseTime: integer('response_time'), // in milliseconds
  statusCode: integer('status_code'),
  metadata: jsonb('metadata').default({}),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  apiUsageKeyIndex: index('idx_api_usage_key').on(table.apiKeyId, table.timestamp),
  apiUsageEndpointIndex: index('idx_api_usage_endpoint').on(table.endpoint, table.timestamp),
  apiUsageChatbotIndex: index('idx_api_usage_chatbot').on(table.chatbotId, table.timestamp),
  apiUsageUserIndex: index('idx_api_usage_user').on(table.userId, table.timestamp),
}));

// API Usage Limits table (for controlling rate limits per API key)
export const apiUsageLimits = pgTable('api_usage_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiKeyId: varchar('api_key_id', { length: 255 }).notNull().unique().references(() => apiKeys.id, { onDelete: 'cascade' }),
  requestsPerHour: integer('requests_per_hour').default(1000),
  requestsPerDay: integer('requests_per_day').default(10000),
  requestsPerMonth: integer('requests_per_month').default(100000),
  tokensPerHour: integer('tokens_per_hour').default(100000),
  tokensPerDay: integer('tokens_per_day').default(1000000),
  tokensPerMonth: integer('tokens_per_month').default(10000000),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// API Usage Quotas table (for billing and plan management)
export const apiUsageQuotas = pgTable('api_usage_quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiKeyId: varchar('api_key_id', { length: 255 }).notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 20 }).notNull(), // 'daily', 'monthly', 'yearly'
  totalRequests: integer('total_requests').default(0),
  totalTokens: integer('total_tokens').default(0),
  totalCost: integer('total_cost').default(0), // in cents
  resetDate: timestamp('reset_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  quotaKeyPeriodIndex: index('idx_quotas_key_period').on(table.apiKeyId, table.period),
  quotaResetIndex: index('idx_quotas_reset').on(table.resetDate),
}));

// API Documentation Versions table (for versioned API docs)
export const apiDocumentationVersions = pgTable('api_documentation_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: varchar('version', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  openApiSpec: jsonb('openapi_spec').notNull(), // Store complete OpenAPI specification
  isActive: boolean('is_active').default(true),
  isDefault: boolean('is_default').default(false),
  releaseNotes: text('release_notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  docVersionIndex: index('idx_docs_version').on(table.version),
  docActiveIndex: index('idx_docs_active').on(table.isActive, table.isDefault),
}));

// Developer Portal Users table (for developer onboarding)
export const developerPortalUsers = pgTable('developer_portal_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  company: varchar('company', { length: 255 }),
  jobTitle: varchar('job_title', { length: 255 }),
  useCase: text('use_case'),
  expectedUsage: varchar('expected_usage', { length: 100 }), // 'low', 'medium', 'high', 'enterprise'
  isApproved: boolean('is_approved').default(false),
  isActive: boolean('is_active').default(true),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  developerEmailIndex: index('idx_developers_email').on(table.email),
  developerApprovalIndex: index('idx_developers_approval').on(table.isApproved, table.isActive),
  developerUsageIndex: index('idx_developers_usage').on(table.expectedUsage),
}));

// TypeScript types for Public API framework
export type ApiUsage = typeof apiUsage.$inferSelect;
export type NewApiUsage = typeof apiUsage.$inferInsert;

export type ApiUsageLimit = typeof apiUsageLimits.$inferSelect;
export type NewApiUsageLimit = typeof apiUsageLimits.$inferInsert;

export type ApiUsageQuota = typeof apiUsageQuotas.$inferSelect;
export type NewApiUsageQuota = typeof apiUsageQuotas.$inferInsert;

export type ApiDocumentationVersion = typeof apiDocumentationVersions.$inferSelect;
export type NewApiDocumentationVersion = typeof apiDocumentationVersions.$inferInsert;

export type DeveloperPortalUser = typeof developerPortalUsers.$inferSelect;
export type NewDeveloperPortalUser = typeof developerPortalUsers.$inferInsert;