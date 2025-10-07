# Chatbot Management API Schema

## Overview

This document defines the complete API schema for the Chatbot Management System, a comprehensive platform for creating, managing, and deploying AI-powered chatbots for the cosmetics industry.

## Base URL
```
https://api.chatbot-platform.com/api/v1
```

## Authentication

### Bearer Token (Admin/User Access)
```http
Authorization: Bearer <jwt_token>
```

### API Key (External Integration)
```http
X-API-Key: <chatbot_api_key>
```

## Core API Endpoints

### 1. Chatbot Instance Management

#### List Chatbots
```http
GET /api/v1/chatbots?page={page}&limit={limit}&status={status}
```

**Query Parameters:**
- `page` (integer, optional): Page number for pagination (default: 1)
- `limit` (integer, optional): Items per page (default: 20, max: 100)
- `status` (string, optional): Filter by status ('active', 'inactive', 'testing')

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Cosmetics Ingredient Assistant",
      "description": "Help customers understand ingredient information",
      "status": "active",
      "api_key_hint": "...ck_12345",
      "created_by": {
        "id": "uuid",
        "name": "John Admin",
        "email": "admin@company.com"
      },
      "configuration": {
        "model": "gpt-4",
        "temperature": 0.7,
        "maxTokens": 500,
        "language": "en"
      },
      "stats": {
        "total_conversations": 1543,
        "unique_users": 892,
        "last_activity": "2024-01-15T10:30:00Z"
      },
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "total_pages": 3
  }
}
```

#### Create Chatbot
```http
POST /api/v1/chatbots
```

**Request:**
```json
{
  "name": "Cosmetics Ingredient Assistant",
  "description": "Help customers understand ingredient information",
  "configuration": {
    "model": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 500,
    "language": "en",
    "welcomeMessage": "Hello! I can help you with cosmetic ingredient information."
  },
  "knowledgeSourceFilters": {
    "documentTypes": ["inci", "formulation"],
    "categories": ["information", "safety", "regulation"],
    "supplierIds": ["uuid1", "uuid2"]
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Cosmetics Ingredient Assistant",
  "api_key": "ck_live_abc123...", // Only returned once
  "status": "testing",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### Get Chatbot Details
```http
GET /api/v1/chatbots/{id}
```

#### Update Chatbot Configuration
```http
PUT /api/v1/chatbots/{id}
```

#### Delete Chatbot (Soft Delete)
```http
DELETE /api/v1/chatbots/{id}
```

#### Regenerate API Key
```http
POST /api/v1/chatbots/{id}/regenerate-token
```

**Response:**
```json
{
  "api_key": "ck_live_new_key_456...",
  "api_key_hint": "...key_456",
  "regenerated_at": "2024-01-15T10:30:00Z"
}
```

### 2. System Prompt Management

#### Get Current System Prompt
```http
GET /api/v1/chatbots/{id}/prompt
```

#### Update System Prompt
```http
PUT /api/v1/chatbots/{id}/prompt
```

**Request:**
```json
{
  "prompt_text": "You are a helpful cosmetic formulation expert...",
  "generation_method": "manual"
}
```

#### AI-Powered Prompt Generation
```http
POST /api/v1/chatbots/{id}/prompt/generate
Content-Type: multipart/form-data
```

**Form Data:**
- `files[]`: File uploads (PDFs, images, documents)
- `context`: Textual context description
- `tone`: Desired tone ('professional', 'friendly', 'technical')
- `additionalInstructions`: Additional requirements

**Response:**
```json
{
  "job_id": "uuid",
  "status": "processing",
  "estimated_completion": "2024-01-15T10:35:00Z"
}
```

#### Get Prompt Version History
```http
GET /api/v1/chatbots/{id}/prompt/history?page={page}&limit={limit}
```

#### Rollback to Previous Version
```http
POST /api/v1/chatbots/{id}/prompt/rollback/{version}
```

### 3. Conversation & Chat Management

#### Send Message to Chatbot
```http
POST /api/v1/chatbots/{id}/chat
```

**Request:**
```json
{
  "sessionId": "session-123",
  "message": "What are the safety considerations for using salicylic acid?",
  "metadata": {
    "source": "playground",
    "userId": "user-uuid"
  }
}
```

**Response:**
```json
{
  "messageId": "uuid",
  "response": "Salicylic acid, also known as Beta Hydroxy Acid (BHA)...",
  "sources": [
    {
      "documentId": "uuid",
      "chunkId": "uuid",
      "content": "Salicylic acid safety information...",
      "similarity": 0.89,
      "metadata": {
        "documentName": "Salicylic Acid Safety Sheet.pdf",
        "category": "safety",
        "supplier": "Supplier ABC"
      }
    }
  ],
  "usage": {
    "promptTokens": 245,
    "completionTokens": 189,
    "totalTokens": 434,
    "vectorSearchTime": 45,
    "llmResponseTime": 2340
  },
  "conversationId": "uuid",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### List Conversations
```http
GET /api/v1/chatbots/{id}/conversations?page={page}&limit={limit}&since={date}
```

#### Get Conversation Details
```http
GET /api/v1/chatbots/{id}/conversations/{conversationId}
```

### 4. Playground Management

#### Create Playground Session
```http
POST /api/v1/chatbots/{id}/playground/sessions
```

**Request:**
```json
{
  "sessionConfig": {
    "temperature": 0.5,
    "maxTokens": 300,
    "systemPromptOverride": "Custom prompt for testing..."
  }
}
```

#### End Playground Session
```http
DELETE /api/v1/chatbots/{id}/playground/sessions/{sessionId}
```

### 5. Analytics & Monitoring

#### Get Usage Analytics
```http
GET /api/v1/chatbots/{id}/analytics?period={period}&from={date}&to={date}
```

**Query Parameters:**
- `period`: '7d', '30d', '90d', 'custom'
- `from`, `to`: ISO date strings (required if period='custom')

**Response:**
```json
{
  "summary": {
    "totalConversations": 1543,
    "totalMessages": 7832,
    "uniqueUsers": 892,
    "avgMessagesPerConversation": 5.08,
    "avgResponseTime": 1250,
    "satisfactionRate": 0.87
  },
  "trends": {
    "daily": [
      {
        "date": "2024-01-01",
        "conversations": 52,
        "messages": 264,
        "uniqueUsers": 45,
        "avgResponseTime": 1100
      }
    ]
  },
  "topQueries": [
    {
      "query": "vitamin c stability",
      "count": 89,
      "avgSatisfaction": 0.91
    }
  ],
  "integrationBreakdown": {
    "web_embed": 65,
    "line_oa": 30,
    "api": 5
  }
}
```

#### Export Analytics Data
```http
GET /api/v1/chatbots/{id}/analytics/export?format={format}&period={period}
```

#### Get Error Logs
```http
GET /api/v1/chatbots/{id}/errors?severity={level}&page={page}&limit={limit}
```

#### Get Performance Metrics
```http
GET /api/v1/chatbots/{id}/performance
```

### 6. External Integrations

#### Line OA Webhook Handler
```http
POST /api/v1/integrations/line/{id}/webhook
X-Line-Signature: {signature}
```

**Request Body:**
```json
{
  "events": [
    {
      "type": "message",
      "replyToken": "reply-token",
      "source": {
        "userId": "U4af47....",
        "type": "user"
      },
      "message": {
        "type": "text",
        "id": "message-id",
        "text": "Tell me about hyaluronic acid"
      }
    }
  ]
}
```

#### Get Line Integration Status
```http
GET /api/v1/integrations/line/{id}/status
```

#### Update Line Configuration
```http
PUT /api/v1/integrations/line/{id}/config
```

#### Widget JavaScript Loader
```http
GET /api/v1/integrations/widget/{id}/loader.js
```

### 7. Public API (External Integration)

#### Public Chat Endpoint
```http
POST /api/v1/public/chat/{id}/messages
X-API-Key: {chatbot_api_key}
```

**Request:**
```json
{
  "sessionId": "web-session-123",
  "message": "What are the safety considerations for using salicylic acid?",
  "metadata": {
    "source": "website",
    "url": "https://example.com/products",
    "userId": "anonymous-123"
  }
}
```

#### Get Widget Configuration
```http
GET /api/v1/public/chat/{id}/config
X-API-Key: {chatbot_api_key}
```

**Response:**
```json
{
  "chatbotId": "uuid",
  "name": "Cosmetics Assistant",
  "welcomeMessage": "Hello! How can I help you today?",
  "theme": {
    "primaryColor": "#007bff",
    "fontFamily": "Arial, sans-serif",
    "borderRadius": "8px",
    "position": "bottom-right"
  },
  "features": {
    "fileUpload": false,
    "voiceInput": false,
    "suggestedQuestions": [
      "What is the pH range for salicylic acid?",
      "How to formulate a stable vitamin C serum?"
    ]
  }
}
```

#### WebSocket Connection
```
WS /api/v1/public/chat/{id}/ws?apiKey={key}&sessionId={session}
```

## Database Schema

### Enums

```sql
-- Chatbot status enumeration
CREATE TYPE chatbot_status AS ENUM ('active', 'inactive', 'testing');

-- Message role in conversations
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

-- Integration types
CREATE TYPE integration_type AS ENUM ('web_embed', 'line_oa', 'api');

-- Prompt generation job status
CREATE TYPE prompt_generation_status AS ENUM ('pending', 'processing', 'completed', 'failed');
```

### Core Tables

#### Chatbot Instances
```sql
CREATE TABLE chatbot_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  status chatbot_status DEFAULT 'testing',
  api_key_hash VARCHAR(255) UNIQUE NOT NULL,
  api_key_hint VARCHAR(8) NOT NULL,
  configuration JSONB DEFAULT '{
    "model": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 500,
    "language": "en",
    "responseTimeout": 30
  }',
  knowledge_source_filters JSONB DEFAULT '{}',
  current_system_prompt TEXT,
  welcome_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);
```

#### System Prompt History
```sql
CREATE TABLE chatbot_prompt_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  generation_method VARCHAR(50), -- 'manual' or 'ai_generated'
  generation_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, version)
);
```

#### AI Prompt Generation Jobs
```sql
CREATE TABLE prompt_generation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id),
  status prompt_generation_status DEFAULT 'pending',
  input_files JSONB DEFAULT '[]',
  context_description TEXT,
  generation_parameters JSONB DEFAULT '{}',
  generated_prompt TEXT,
  error_message TEXT,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Chatbot Integration Configurations
```sql
CREATE TABLE chatbot_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  integration_type integration_type NOT NULL,
  is_active BOOLEAN DEFAULT true,
  configuration JSONB DEFAULT '{}',
  webhook_secret VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, integration_type)
);
```

### Conversation Management

#### Conversation Sessions
```sql
CREATE TABLE chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL,
  integration_type integration_type NOT NULL,
  user_identifier VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, session_id)
);
```

#### Conversation Messages
```sql
CREATE TABLE chatbot_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  vector_search_results JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Playground Sessions
```sql
CREATE TABLE chatbot_playground_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  session_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE
);
```

### Analytics & Monitoring

#### Analytics Data
```sql
CREATE TABLE chatbot_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  avg_conversation_length FLOAT DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  successful_queries INTEGER DEFAULT 0,
  failed_queries INTEGER DEFAULT 0,
  integration_breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, date)
);
```

#### Error Tracking
```sql
CREATE TABLE chatbot_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT,
  error_details JSONB DEFAULT '{}',
  stack_trace TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Message Feedback
```sql
CREATE TABLE message_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES chatbot_messages(id) ON DELETE CASCADE,
  feedback_type VARCHAR(50) NOT NULL, -- 'helpful', 'not_helpful', 'inappropriate'
  feedback_text TEXT,
  user_identifier VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_identifier)
);
```

### Security & Performance

#### API Rate Limiting
```sql
CREATE TABLE api_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  identifier VARCHAR(255) NOT NULL, -- IP address or user ID
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER DEFAULT 1,
  UNIQUE(chatbot_id, identifier, window_start)
);
```

#### Conversation Context
```sql
CREATE TABLE conversation_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  context_key VARCHAR(255) NOT NULL,
  context_value JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id, context_key)
);
```

### Performance Indexes

```sql
-- Core chatbot indexes
CREATE INDEX idx_chatbot_instances_created_by ON chatbot_instances(created_by);
CREATE INDEX idx_chatbot_instances_status ON chatbot_instances(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_chatbot_instances_api_key_hash ON chatbot_instances(api_key_hash);

-- Conversation indexes
CREATE INDEX idx_chatbot_conversations_chatbot_id ON chatbot_conversations(chatbot_id);
CREATE INDEX idx_chatbot_conversations_session_id ON chatbot_conversations(session_id);
CREATE INDEX idx_chatbot_conversations_last_activity ON chatbot_conversations(last_activity_at DESC);

-- Message indexes
CREATE INDEX idx_chatbot_messages_conversation_id ON chatbot_messages(conversation_id);
CREATE INDEX idx_chatbot_messages_created_at ON chatbot_messages(created_at DESC);
CREATE INDEX idx_chatbot_messages_role ON chatbot_messages(role);

-- Analytics indexes
CREATE INDEX idx_chatbot_analytics_chatbot_date ON chatbot_analytics(chatbot_id, date DESC);
CREATE INDEX idx_chatbot_errors_chatbot_occurred ON chatbot_errors(chatbot_id, occurred_at DESC);

-- Prompt generation indexes
CREATE INDEX idx_prompt_generation_jobs_status ON prompt_generation_jobs(status);
CREATE INDEX idx_prompt_generation_jobs_chatbot ON prompt_generation_jobs(chatbot_id);

-- Integration indexes
CREATE INDEX idx_chatbot_integrations_chatbot_type ON chatbot_integrations(chatbot_id, integration_type);

-- Rate limiting indexes
CREATE INDEX idx_api_rate_limits_window ON api_rate_limits(window_start);
CREATE INDEX idx_api_rate_limits_chatbot_identifier ON api_rate_limits(chatbot_id, identifier);
```

## Security Requirements

### Authentication & Authorization

1. **JWT Bearer Tokens** - Required for admin/user dashboard access
2. **API Keys** - Required for external chatbot integrations
3. **Role-Based Access Control** - Super admin, admin, user roles
4. **Rate Limiting** - IP-based and user-based request limiting

### Data Protection

1. **Input Sanitization** - All user inputs sanitized to prevent XSS/injection
2. **API Key Security** - Keys are hashed before storage, only hints displayed
3. **Content Moderation** - Automated filtering with manual review capabilities
4. **Audit Logging** - Complete activity tracking for sensitive operations

### CORS Configuration

```javascript
// Allow specific domains for widget embedding
{
  "origin": ["https://example.com", "https://app.example.com"],
  "methods": ["GET", "POST"],
  "allowedHeaders": ["Content-Type", "X-API-Key"],
  "credentials": true
}
```

## Performance Considerations

### Caching Strategy

1. **Redis Cache** - Frequently accessed chatbot configurations (TTL: 1 hour)
2. **Query Result Cache** - Vector search results (TTL: 5 minutes)
3. **Session Cache** - Active conversation contexts (TTL: 24 hours)
4. **Analytics Cache** - Daily/hourly aggregated metrics (TTL: 1 hour)

### Database Optimization

1. **Connection Pooling** - PostgreSQL connection pool for high concurrency
2. **Query Optimization** - Proper indexing for frequent queries
3. **Materialized Views** - Pre-computed analytics for dashboard performance
4. **Vector Search** - Optimized pgvector indexes for similarity search

### Response Time Targets

- **API Responses** - < 100ms for cached queries
- **Vector Search** - < 200ms for similarity queries
- **WebSocket Latency** - < 50ms for real-time updates
- **LLM Response** - < 3000ms for chatbot responses

## Error Handling

### Standard Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "temperature",
      "reason": "Must be between 0 and 1"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Integration Examples

### JavaScript Widget Integration

```html
<!-- Basic widget embedding -->
<script>
  (function() {
    const script = document.createElement('script');
    script.src = 'https://api.chatbot-platform.com/api/v1/integrations/widget/{chatbot-id}/loader.js';
    script.async = true;
    document.head.appendChild(script);
  })();
</script>
```

### Line OA Integration

```javascript
// Webhook verification and message processing
const crypto = require('crypto');

function verifyLineSignature(body, signature, secret) {
  const hash = crypto
    .createHmac('SHA256', secret)
    .update(body, 'utf8')
    .digest('base64');

  return hash === signature;
}
```

## Monitoring & Health Checks

### Health Check Endpoint

```http
GET /api/v1/chatbots/{id}/health
```

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "responseTime": 12 },
    "vectorSearch": { "status": "ok", "avgSearchTime": 45 },
    "llmService": { "status": "ok", "avgResponseTime": 1100 },
    "errorRate": { "status": "ok", "errorsLastHour": 2 }
  },
  "uptime": 2592000,
  "lastError": {
    "type": "rate_limit_exceeded",
    "occurredAt": "2024-01-15T10:30:00Z"
  }
}
```

This API schema provides a comprehensive foundation for building and managing AI-powered chatbots in the cosmetics industry, with robust security, performance optimization, and multi-channel integration capabilities.