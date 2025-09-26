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
  unique
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