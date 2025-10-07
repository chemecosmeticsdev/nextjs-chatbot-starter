import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid
} from 'drizzle-orm/pg-core';

// Schema matching the existing database for Phase 2 testing
export const chatbotInstances = pgTable('chatbot_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  description: text('description'),
  createdBy: uuid('created_by').notNull(),
  status: varchar('status'),
  apiKeyHash: varchar('api_key_hash', { length: 64 }).notNull(),
  apiKeyHint: varchar('api_key_hint', { length: 20 }).notNull(),
  configuration: jsonb('configuration'),
  knowledgeSourceFilters: jsonb('knowledge_source_filters'),
  currentSystemPrompt: text('current_system_prompt'),
  welcomeMessage: text('welcome_message'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const chatbotPromptHistory = pgTable('chatbot_prompt_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatbotId: uuid('chatbot_id').notNull(),
  version: integer('version').notNull(),
  systemPrompt: text('system_prompt'),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  changeReason: text('change_reason'),
});

// TypeScript types
export type ChatbotInstance = typeof chatbotInstances.$inferSelect;
export type NewChatbotInstance = typeof chatbotInstances.$inferInsert;
export type ChatbotPromptHistory = typeof chatbotPromptHistory.$inferSelect;
export type NewChatbotPromptHistory = typeof chatbotPromptHistory.$inferInsert;