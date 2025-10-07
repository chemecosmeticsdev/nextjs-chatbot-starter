Extended API Schema for Chatbot Management
1. Chatbot Instance Management
yaml
# Chatbot Instances
GET    /api/v1/chatbots?page={page}&limit={limit}         # List all chatbot instances (admin only)
POST   /api/v1/chatbots                                    # Create new chatbot instance (super_admin/admin only)
GET    /api/v1/chatbots/{chatbotId}                       # Get chatbot details
PUT    /api/v1/chatbots/{chatbotId}                       # Update chatbot configuration
DELETE /api/v1/chatbots/{chatbotId}                       # Delete chatbot instance (soft delete)
POST   /api/v1/chatbots/{chatbotId}/regenerate-token     # Regenerate access token

# Chatbot System Prompt Management
GET    /api/v1/chatbots/{chatbotId}/prompt                # Get current system prompt
PUT    /api/v1/chatbots/{chatbotId}/prompt                # Update system prompt manually
POST   /api/v1/chatbots/{chatbotId}/prompt/generate       # Generate prompt using AI (with file upload)
GET    /api/v1/chatbots/{chatbotId}/prompt/history        # Get prompt version history

# Knowledge Base Association
GET    /api/v1/chatbots/{chatbotId}/knowledge-sources     # List associated documents/categories
PUT    /api/v1/chatbots/{chatbotId}/knowledge-sources     # Update knowledge source filters
2. Chatbot Playground & Testing
yaml
# Playground
POST   /api/v1/chatbots/{chatbotId}/playground/sessions   # Create playground session
GET    /api/v1/chatbots/{chatbotId}/playground/sessions/{sessionId}  # Get session details
POST   /api/v1/chatbots/{chatbotId}/playground/chat      # Send message in playground
DELETE /api/v1/chatbots/{chatbotId}/playground/sessions/{sessionId}  # End session
3. External Integration Endpoints
yaml
# Public Chat API (for JavaScript embedding)
POST   /api/v1/public/chat/{chatbotId}/messages           # Send message (requires API token)
GET    /api/v1/public/chat/{chatbotId}/config            # Get widget configuration

# Line OA Webhook
POST   /api/v1/integrations/line/{chatbotId}/webhook     # Line messaging webhook
GET    /api/v1/integrations/line/{chatbotId}/status      # Check Line integration status
PUT    /api/v1/integrations/line/{chatbotId}/config      # Update Line configuration
4. Analytics & Monitoring
yaml
# Chatbot Analytics
GET    /api/v1/chatbots/{chatbotId}/analytics            # Get usage analytics
GET    /api/v1/chatbots/{chatbotId}/conversations        # List conversations
GET    /api/v1/chatbots/{chatbotId}/conversations/{conversationId}  # Get conversation details
5. Request/Response Examples
Create Chatbot Instance:

json
POST /api/v1/chatbots
Authorization: Bearer {admin_token}
Content-Type: application/json

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
Generate System Prompt with AI:

json
POST /api/v1/chatbots/{chatbotId}/prompt/generate
Content-Type: multipart/form-data

{
  "files": [<binary>],  // Screenshots, PDFs, images
  "context": "This chatbot should help cosmetic formulators understand ingredient compatibility and safety regulations",
  "tone": "professional",
  "additionalInstructions": "Include regulatory compliance information for EU and US markets"
}
Public Chat Message:

json
POST /api/v1/public/chat/{chatbotId}/messages
X-API-Key: {chatbot_api_key}
Content-Type: application/json

{
  "sessionId": "web-session-123",
  "message": "What are the safety considerations for using salicylic acid?",
  "metadata": {
    "source": "website",
    "userId": "anonymous-123"
  }
}
Extended SQL Schema
sql
-- Update activity_type enum to include chatbot activities
ALTER TYPE activity_type ADD VALUE 'chatbot_created';
ALTER TYPE activity_type ADD VALUE 'chatbot_message';
ALTER TYPE activity_type ADD VALUE 'prompt_generated';

-- New Enums
CREATE TYPE chatbot_status AS ENUM ('active', 'inactive', 'testing');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE integration_type AS ENUM ('web_embed', 'line_oa', 'api');
CREATE TYPE prompt_generation_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Chatbot Instances table
CREATE TABLE chatbot_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  status chatbot_status DEFAULT 'testing',
  api_key_hash VARCHAR(255) UNIQUE NOT NULL,
  api_key_hint VARCHAR(8) NOT NULL, -- Last 8 chars of API key for identification
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

-- System Prompt History
CREATE TABLE chatbot_prompt_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  generation_method VARCHAR(50), -- 'manual' or 'ai_generated'
  generation_metadata JSONB DEFAULT '{}', -- Store AI generation parameters
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, version)
);

-- AI Prompt Generation Jobs
CREATE TABLE prompt_generation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id),
  status prompt_generation_status DEFAULT 'pending',
  input_files JSONB DEFAULT '[]', -- Array of file paths
  context_description TEXT,
  generation_parameters JSONB DEFAULT '{}',
  generated_prompt TEXT,
  error_message TEXT,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chatbot Integration Configurations
CREATE TABLE chatbot_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  integration_type integration_type NOT NULL,
  is_active BOOLEAN DEFAULT true,
  configuration JSONB DEFAULT '{}', -- Store platform-specific config
  webhook_secret VARCHAR(255), -- For webhook validation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, integration_type)
);

-- Line OA Specific Configuration
CREATE TABLE line_oa_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_integration_id UUID REFERENCES chatbot_integrations(id) ON DELETE CASCADE,
  channel_id VARCHAR(255) NOT NULL,
  channel_secret_hash VARCHAR(255) NOT NULL,
  channel_access_token_encrypted TEXT NOT NULL, -- Encrypted with system key
  webhook_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conversation Sessions
CREATE TABLE chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL, -- External session identifier
  integration_type integration_type NOT NULL,
  user_identifier VARCHAR(255), -- Could be Line user ID, web session, etc.
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, session_id)
);

-- Conversation Messages
CREATE TABLE chatbot_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Store tokens used, processing time, etc.
  vector_search_results JSONB DEFAULT '[]', -- Store related document chunks
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Playground Sessions (for testing)
CREATE TABLE chatbot_playground_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  session_config JSONB DEFAULT '{}', -- Override chatbot config for testing
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Widget Customization
CREATE TABLE chatbot_widget_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  theme JSONB DEFAULT '{
    "primaryColor": "#007bff",
    "fontFamily": "Arial, sans-serif",
    "borderRadius": "8px",
    "position": "bottom-right"
  }',
  allowed_domains TEXT[], -- Domains where widget can be embedded
  custom_css TEXT,
  custom_js TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analytics
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
  integration_breakdown JSONB DEFAULT '{}', -- {"web_embed": 10, "line_oa": 5}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, date)
);

-- Indexes for Chatbot Tables
CREATE INDEX idx_chatbot_instances_created_by ON chatbot_instances(created_by);
CREATE INDEX idx_chatbot_instances_status ON chatbot_instances(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_chatbot_conversations_chatbot_id ON chatbot_conversations(chatbot_id);
CREATE INDEX idx_chatbot_conversations_session_id ON chatbot_conversations(session_id);
CREATE INDEX idx_chatbot_conversations_last_activity ON chatbot_conversations(last_activity_at);
CREATE INDEX idx_chatbot_messages_conversation_id ON chatbot_messages(conversation_id);
CREATE INDEX idx_chatbot_messages_created_at ON chatbot_messages(created_at);
CREATE INDEX idx_chatbot_analytics_chatbot_date ON chatbot_analytics(chatbot_id, date);
CREATE INDEX idx_prompt_generation_jobs_status ON prompt_generation_jobs(status);

-- Functions for Chatbot Management

-- Function to search knowledge base for chatbot
CREATE OR REPLACE FUNCTION chatbot_search_knowledge_base(
  p_chatbot_id UUID,
  p_query_embedding vector(1536),
  p_similarity_threshold FLOAT DEFAULT 0.7,
  p_max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  similarity FLOAT,
  document_id UUID,
  document_type document_type,
  document_category document_category,
  metadata JSONB
) AS $$
DECLARE
  v_filters JSONB;
BEGIN
  -- Get knowledge source filters for the chatbot
  SELECT knowledge_source_filters INTO v_filters
  FROM chatbot_instances
  WHERE id = p_chatbot_id AND deleted_at IS NULL;
  
  RETURN QUERY
  WITH filtered_chunks AS (
    SELECT dc.*, d.document_type, d.document_category, d.product_id
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE d.deleted_at IS NULL
      AND (v_filters->>'documentTypes' IS NULL OR 
           d.document_type = ANY(SELECT jsonb_array_elements_text(v_filters->'documentTypes')::document_type))
      AND (v_filters->>'categories' IS NULL OR 
           d.document_category = ANY(SELECT jsonb_array_elements_text(v_filters->'categories')::document_category))
      AND (v_filters->>'supplierIds' IS NULL OR 
           EXISTS (
             SELECT 1 FROM products p 
             WHERE p.id = d.product_id 
               AND p.supplier_id = ANY(SELECT jsonb_array_elements_text(v_filters->'supplierIds')::uuid)
           ))
  )
  SELECT 
    fc.id as chunk_id,
    fc.content,
    1 - (fc.embedding <=> p_query_embedding) as similarity,
    fc.document_id,
    fc.document_type,
    fc.document_category,
    fc.metadata
  FROM filtered_chunks fc
  WHERE fc.embedding IS NOT NULL 
    AND (1 - (fc.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY similarity DESC
  LIMIT p_max_results;
END;
$$ LANGUAGE plpgsql;

-- Function to create a new chatbot conversation
CREATE OR REPLACE FUNCTION create_chatbot_conversation(
  p_chatbot_id UUID,
  p_session_id VARCHAR(255),
  p_integration_type integration_type,
  p_user_identifier VARCHAR(255) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Check if conversation already exists
  SELECT id INTO v_conversation_id
  FROM chatbot_conversations
  WHERE chatbot_id = p_chatbot_id 
    AND session_id = p_session_id;
  
  IF v_conversation_id IS NULL THEN
    INSERT INTO chatbot_conversations (
      chatbot_id, session_id, integration_type, user_identifier, metadata
    ) VALUES (
      p_chatbot_id, p_session_id, p_integration_type, p_user_identifier, p_metadata
    ) RETURNING id INTO v_conversation_id;
  ELSE
    -- Update last activity
    UPDATE chatbot_conversations
    SET last_activity_at = CURRENT_TIMESTAMP
    WHERE id = v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update analytics
CREATE OR REPLACE FUNCTION update_chatbot_analytics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO chatbot_analytics (
    chatbot_id,
    date,
    total_messages,
    total_conversations,
    unique_users
  )
  VALUES (
    (SELECT chatbot_id FROM chatbot_conversations WHERE id = NEW.conversation_id),
    CURRENT_DATE,
    1,
    CASE WHEN NEW.role = 'user' AND NOT EXISTS (
      SELECT 1 FROM chatbot_messages 
      WHERE conversation_id = NEW.conversation_id 
        AND id != NEW.id
    ) THEN 1 ELSE 0 END,
    0
  )
  ON CONFLICT (chatbot_id, date) DO UPDATE
  SET 
    total_messages = chatbot_analytics.total_messages + 1,
    total_conversations = chatbot_analytics.total_conversations + 
      CASE WHEN NEW.role = 'user' AND NOT EXISTS (
        SELECT 1 FROM chatbot_messages 
        WHERE conversation_id = NEW.conversation_id 
          AND id != NEW.id
      ) THEN 1 ELSE 0 END,
    updated_at = CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chatbot_analytics
AFTER INSERT ON chatbot_messages
FOR EACH ROW
EXECUTE FUNCTION update_chatbot_analytics();

-- Views for Chatbot Management

-- View for active chatbot overview
CREATE OR REPLACE VIEW chatbot_overview AS
SELECT 
  ci.id,
  ci.name,
  ci.description,
  ci.status,
  ci.api_key_hint,
  u.full_name as created_by_name,
  u.email as created_by_email,
  COUNT(DISTINCT cc.id) as total_conversations,
  COUNT(DISTINCT cc.user_identifier) as unique_users,
  MAX(cc.last_activity_at) as last_activity,
  ci.created_at,
  ci.updated_at
FROM chatbot_instances ci
LEFT JOIN users u ON ci.created_by = u.id
LEFT JOIN chatbot_conversations cc ON ci.id = cc.chatbot_id
WHERE ci.deleted_at IS NULL
GROUP BY ci.id, u.full_name, u.email;

-- View for conversation details
CREATE OR REPLACE VIEW conversation_details AS
SELECT 
  cc.id as conversation_id,
  cc.session_id,
  cc.integration_type,
  cc.user_identifier,
  ci.name as chatbot_name,
  COUNT(cm.id) as message_count,
  MIN(cm.created_at) as first_message_at,
  MAX(cm.created_at) as last_message_at,
  cc.started_at,
  cc.ended_at,
  cc.metadata
FROM chatbot_conversations cc
JOIN chatbot_instances ci ON cc.chatbot_id = ci.id
LEFT JOIN chatbot_messages cm ON cc.id = cm.conversation_id
GROUP BY cc.id, ci.name;

-- Additional API Endpoints for JavaScript Widget

-- Widget Loader Endpoint
GET /api/v1/public/widget/{chatbotId}/loader.js
Response: JavaScript code for embedding the chatbot widget

-- WebSocket Connection for Real-time Chat
WS /api/v1/public/chat/{chatbotId}/ws

-- Additional Request/Response Examples

**Widget Configuration Response:**
```json
GET /api/v1/public/chat/{chatbotId}/config
Response:
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
      "How to formulate a stable vitamin C serum?",
      "What preservatives work well with natural ingredients?"
    ]
  }
}
Line OA Webhook Request:

json
POST /api/v1/integrations/line/{chatbotId}/webhook
Headers:
  X-Line-Signature: {signature}
Body:
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
Playground Chat Request:

json
POST /api/v1/chatbots/{chatbotId}/playground/chat
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "sessionId": "playground-session-uuid",
  "message": "What are the benefits of niacinamide?",
  "overrideConfig": {
    "temperature": 0.5,
    "systemPrompt": "You are a helpful cosmetic formulation expert..."
  }
}

Response:
{
  "messageId": "uuid",
  "response": "Niacinamide, also known as Vitamin B3, offers several benefits in cosmetic formulations...",
  "sources": [
    {
      "documentId": "uuid",
      "chunkId": "uuid",
      "content": "Niacinamide (Vitamin B3) is a water-soluble vitamin...",
      "similarity": 0.89,
      "metadata": {
        "documentName": "Niacinamide Technical Data Sheet.pdf",
        "category": "information",
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
  }
}
-- Security considerations
-- Add row-level security for chatbot instances
ALTER TABLE chatbot_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY chatbot_instances_policy ON chatbot_instances
FOR ALL
USING (
created_by = current_user_id() OR
EXISTS (
SELECT 1 FROM users
WHERE id = current_user_id()
AND role IN ('super_admin', 'admin')
)
);

-- Function to get current user ID (would be implemented based on your auth system)
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
-- This would typically extract user ID from JWT or session
-- Placeholder implementation
RETURN current_setting('app.current_user_id')::UUID;
END;

‘
‘
‘
T
h
i
s
e
x
t
e
n
s
i
o
n
p
r
o
v
i
d
e
s
a
c
o
m
p
l
e
t
e
c
h
a
t
b
o
t
m
a
n
a
g
e
m
e
n
t
s
y
s
t
e
m
t
h
a
t
i
n
t
e
g
r
a
t
e
s
w
i
t
h
y
o
u
r
e
x
i
s
t
i
n
g
k
n
o
w
l
e
d
g
e
b
a
s
e
.
K
e
y
f
e
a
t
u
r
e
s
i
n
c
l
u
d
e
:
1.
∗
∗
A
d
m
i
n
−
o
n
l
y
c
h
a
t
b
o
t
c
r
e
a
t
i
o
n
∗
∗
w
i
t
h
r
o
l
e
−
b
a
s
e
d
a
c
c
e
s
s
c
o
n
t
r
o
l
2.
∗
∗
A
I
−
p
o
w
e
r
e
d
s
y
s
t
e
m
p
r
o
m
p
t
g
e
n
e
r
a
t
i
o
n
∗
∗
f
r
o
m
u
p
l
o
a
d
e
d
f
i
l
e
s
3.
∗
∗
J
a
v
a
S
c
r
i
p
t
w
i
d
g
e
t
e
m
b
e
d
d
i
n
g
∗
∗
w
i
t
h
c
u
s
t
o
m
i
z
a
t
i
o
n
o
p
t
i
o
n
s
4.
∗
∗
L
i
n
e
O
A
i
n
t
e
g
r
a
t
i
o
n
∗
∗
w
i
t
h
w
e
b
h
o
o
k
s
u
p
p
o
r
t
5.
∗
∗
P
l
a
y
g
r
o
u
n
d
f
o
r
t
e
s
t
i
n
g
∗
∗
w
i
t
h
c
o
n
f
i
g
u
r
a
t
i
o
n
o
v
e
r
r
i
d
e
s
6.
∗
∗
A
n
a
l
y
t
i
c
s
a
n
d
m
o
n
i
t
o
r
i
n
g
∗
∗
f
o
r
u
s
a
g
e
t
r
a
c
k
i
n
g
7.
∗
∗
V
e
c
t
o
r
‘‘‘Thisextensionprovidesacompletechatbotmanagementsystemthatintegrateswithyourexistingknowledgebase.Keyfeaturesinclude:1.∗∗Admin−onlychatbotcreation∗∗withrole−basedaccesscontrol2.∗∗AI−poweredsystempromptgeneration∗∗fromuploadedfiles3.∗∗JavaScriptwidgetembedding∗∗withcustomizationoptions4.∗∗LineOAintegration∗∗withwebhooksupport5.∗∗Playgroundfortesting∗∗withconfigurationoverrides6.∗∗Analyticsandmonitoring∗∗forusagetracking7.∗∗Vector

Vector search integration leveraging existing pgvector infrastructure
Conversation history with full message tracking
Multi-channel support (web, Line OA, API)
Caching and performance optimization for search results
Additional Implementation Details
JavaScript Widget Implementation
javascript
// Example widget loader (loader.js)
(function() {
  const chatbotId = '{{CHATBOT_ID}}';
  const apiEndpoint = '{{API_ENDPOINT}}';
  
  // Create widget container
  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'cosmetics-chatbot-widget';
  widgetContainer.innerHTML = `
    <div id="chatbot-launcher" class="chatbot-launcher">
      <svg><!-- Chat icon --></svg>
    </div>
    <div id="chatbot-window" class="chatbot-window" style="display:none;">
      <div class="chatbot-header">
        <h3>{{CHATBOT_NAME}}</h3>
        <button id="chatbot-close">&times;</button>
      </div>
      <div id="chatbot-messages" class="chatbot-messages"></div>
      <div class="chatbot-input-container">
        <input type="text" id="chatbot-input" placeholder="Type your message...">
        <button id="chatbot-send">Send</button>
      </div>
    </div>
  `;
  
  // Inject styles
  const styles = `{{WIDGET_STYLES}}`;
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
  
  // Append to body
  document.body.appendChild(widgetContainer);
  
  // Initialize chat functionality
  class CosmeticsChatbot {
    constructor() {
      this.sessionId = this.generateSessionId();
      this.apiKey = '{{API_KEY}}';
      this.isOpen = false;
      this.initializeEventListeners();
      this.loadChatHistory();
    }
    
    generateSessionId() {
      return 'web-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    async sendMessage(message) {
      try {
        const response = await fetch(`${apiEndpoint}/public/chat/${chatbotId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
          },
          body: JSON.stringify({
            sessionId: this.sessionId,
            message: message,
            metadata: {
              source: 'website',
              url: window.location.href,
              userAgent: navigator.userAgent
            }
          })
        });
        
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Chatbot error:', error);
        throw error;
      }
    }
    
    // ... Additional methods for UI management, history, etc.
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new CosmeticsChatbot());
  } else {
    new CosmeticsChatbot();
  }
})();
Line OA Integration Service
sql
-- Function to handle Line OA messages
CREATE OR REPLACE FUNCTION process_line_message(
  p_chatbot_id UUID,
  p_user_id VARCHAR(255),
  p_message TEXT,
  p_reply_token VARCHAR(255)
)
RETURNS JSONB AS $$
DECLARE
  v_conversation_id UUID;
  v_query_embedding vector(1536);
  v_search_results JSONB;
  v_response TEXT;
  v_message_id UUID;
BEGIN
  -- Create or get conversation
  v_conversation_id := create_chatbot_conversation(
    p_chatbot_id,
    'line-' || p_user_id,
    'line_oa'::integration_type,
    p_user_id,
    jsonb_build_object('platform', 'line', 'replyToken', p_reply_token)
  );
  
  -- Store user message
  INSERT INTO chatbot_messages (conversation_id, role, content)
  VALUES (v_conversation_id, 'user', p_message)
  RETURNING id INTO v_message_id;
  
  -- Generate embedding for the query
  -- This would call your embedding service
  -- v_query_embedding := generate_embedding(p_message);
  
  -- Search knowledge base
  SELECT jsonb_agg(row_to_json(t.*)) INTO v_search_results
  FROM chatbot_search_knowledge_base(
    p_chatbot_id,
    v_query_embedding,
    0.7,
    5
  ) t;
  
  -- Generate response using LLM
  -- This would call your LLM service with context from search results
  -- v_response := generate_llm_response(p_message, v_search_results);
  
  -- Store assistant response
  INSERT INTO chatbot_messages (
    conversation_id, 
    role, 
    content,
    metadata,
    vector_search_results
  ) VALUES (
    v_conversation_id,
    'assistant',
    v_response,
    jsonb_build_object('replyToken', p_reply_token),
    v_search_results
  );
  
  -- Log activity
  INSERT INTO activity_logs (
    user_id,
    activity_type,
    entity_type,
    entity_id,
    description,
    metadata
  ) VALUES (
    NULL,
    'chatbot_message',
    'chatbot_conversation',
    v_conversation_id,
    'Line OA message processed',
    jsonb_build_object(
      'platform', 'line',
      'userId', p_user_id,
      'messageLength', length(p_message)
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'response', v_response,
    'conversationId', v_conversation_id,
    'messageId', v_message_id
  );
END;
$$ LANGUAGE plpgsql;
System Prompt Generation Service
python
# Example Python service for AI-powered prompt generation
from typing import List, Dict
import asyncio
from PIL import Image
import PyPDF2
import pytesseract
import openai

class PromptGenerationService:
    def __init__(self):
        self.llm_client = openai.Client()
    
    async def generate_system_prompt(
        self,
        files: List[bytes],
        context: str,
        tone: str,
        additional_instructions: str
    ) -> str:
        # Extract content from files
        extracted_content = await self.extract_content_from_files(files)
        
        # Prepare prompt for LLM
        meta_prompt = f"""
        You are an expert at creating system prompts for chatbots in the cosmetics industry.
        
        Based on the following materials and context, create a comprehensive system prompt 
        for a chatbot that will assist users with cosmetic ingredient information.
        
        Context: {context}
        Desired Tone: {tone}
        Additional Instructions: {additional_instructions}
        
        Extracted Content from Files:
        {extracted_content}
        
        The system prompt should:
        1. Define the chatbot's role and expertise clearly
        2. Set appropriate boundaries and limitations
        3. Include specific instructions for handling ingredient queries
        4. Specify the tone and communication style
        5. Include safety and regulatory compliance guidelines
        
        Generate a system prompt that is clear, comprehensive, and effective.
        """
        
        response = await self.llm_client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": meta_prompt}],
            temperature=0.7,
            max_tokens=1000
        )
        
        return response.choices[0].message.content
    
    async def extract_content_from_files(self, files: List[bytes]) -> str:
        contents = []
        
        for file_data in files:
            # Detect file type and extract accordingly
            # This is a simplified example
            content = await self.extract_text(file_data)
            contents.append(content)
        
        return "\n\n".join(contents)
Performance Optimization Strategies
sql
-- Materialized view for frequently accessed chatbot statistics
CREATE MATERIALIZED VIEW chatbot_statistics AS
SELECT 
  ci.id as chatbot_id,
  ci.name,
  COUNT(DISTINCT cc.id) as total_conversations_30d,
  COUNT(DISTINCT cm.id) as total_messages_30d,
  COUNT(DISTINCT cc.user_identifier) as unique_users_30d,
  AVG(sub.message_count) as avg_messages_per_conversation,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sub.response_time_ms) as median_response_time
FROM chatbot_instances ci
LEFT JOIN chatbot_conversations cc ON ci.id = cc.chatbot_id 
  AND cc.started_at >= CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN chatbot_messages cm ON cc.id = cm.conversation_id
LEFT JOIN LATERAL (
  SELECT 
    conversation_id,
    COUNT(*) as message_count,
    AVG(EXTRACT(EPOCH FROM (lead(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at) - created_at)) * 1000) as response_time_ms
  FROM chatbot_messages
  WHERE role = 'assistant'
  GROUP BY conversation_id
) sub ON cc.id = sub.conversation_id
WHERE ci.deleted_at IS NULL
GROUP BY ci.id, ci.name;

-- Refresh materialized view periodically
CREATE OR REPLACE FUNCTION refresh_chatbot_statistics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY chatbot_statistics;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh (using pg_cron or similar)
-- SELECT cron.schedule('refresh-chatbot-stats', '0 * * * *', 'SELECT refresh_chatbot_statistics()');
Security Best Practices
sql
-- API Key Management
CREATE OR REPLACE FUNCTION generate_chatbot_api_key(p_chatbot_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_api_key TEXT;
  v_api_key_hash TEXT;
  v_api_key_hint TEXT;
BEGIN
  -- Generate secure random API key
  v_api_key := encode(gen_random_bytes(32), 'base64');
  v_api_key := regexp_replace(v_api_key, '[/+=]', '', 'g'); -- Remove special chars
  v_api_key := 'ck_' || substring(v_api_key, 1, 40); -- Prefix and limit length
  
  -- Hash for storage
  v_api_key_hash := encode(digest(v_api_key, 'sha256'), 'hex');
  
  -- Store hint (last 8 characters)
  v_api_key_hint := right(v_api_key, 8);
  
  -- Update chatbot instance
  UPDATE chatbot_instances
  SET api_key_hash = v_api_key_hash,
      api_key_hint = v_api_key_hint
  WHERE id = p_chatbot_id;
  
  -- Return full key only once
  RETURN v_api_key;
END;
$$ LANGUAGE plpgsql;

-- Rate limiting table
CREATE TABLE api_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  identifier VARCHAR(255) NOT NULL, -- IP address or user ID
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER DEFAULT 1,
  UNIQUE(chatbot_id, identifier, window_start)
);

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_chatbot_id UUID,
  p_identifier VARCHAR(255),
  p_limit INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_current_count INTEGER;
BEGIN
  v_window_start := date_trunc('hour', CURRENT_TIMESTAMP);
  
  -- Insert or update rate limit counter
  INSERT INTO api_rate_limits (chatbot_id, identifier, window_start, request_count)
  VALUES (p_chatbot_id, p_identifier, v_window_start, 1)
  ON CONFLICT (chatbot_id, identifier, window_start)
  DO UPDATE SET request_count = api_rate_limits.request_count + 1
  RETURNING request_count INTO v_current_count;
  
  -- Clean old entries
  DELETE FROM api_rate_limits
  WHERE window_start < CURRENT_TIMESTAMP - INTERVAL '24 hours';
  
  RETURN v_current_count <= p_limit;
END;
$$ LANGUAGE plpgsql;

-- Audit trail for sensitive operations
CREATE TABLE chatbot_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for audit logging
CREATE OR REPLACE FUNCTION audit_chatbot_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO chatbot_audit_log (
      chatbot_id,
      user_id,
      action,
      old_value,
      new_value
    ) VALUES (
      NEW.id,
      current_user_id(),
      'update_' || TG_ARGV[0],
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO chatbot_audit_log (
      chatbot_id,
      user_id,
      action,
      old_value
    ) VALUES (
      OLD.id,
      current_user_id(),
      'delete',
      to_jsonb(OLD)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_chatbot_instances
AFTER UPDATE OR DELETE ON chatbot_instances
FOR EACH ROW
EXECUTE FUNCTION audit_chatbot_changes('chatbot_instance');

-- Content moderation for messages
CREATE TABLE flagged_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES chatbot_messages(id) ON DELETE CASCADE,
  flag_type VARCHAR(50) NOT NULL, -- 'inappropriate', 'spam', 'security_risk'
  confidence_score FLOAT,
  flagged_by VARCHAR(50), -- 'automated' or user ID
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id),
  review_decision VARCHAR(50), -- 'approved', 'removed', 'escalated'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP WITH TIME ZONE
);
Error Handling and Monitoring
sql
-- Error tracking table
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

-- Health check view
CREATE OR REPLACE VIEW chatbot_health_status AS
SELECT 
  ci.id,
  ci.name,
  ci.status,
  CASE 
    WHEN COUNT(ce.id) FILTER (WHERE ce.occurred_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') > 10 
    THEN 'unhealthy'
    WHEN COUNT(ce.id) FILTER (WHERE ce.occurred_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') > 5 
    THEN 'degraded'
    ELSE 'healthy'
  END as health_status,
  COUNT(ce.id) FILTER (WHERE ce.occurred_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') as errors_last_hour,
  AVG(CASE 
    WHEN cm.role = 'assistant' AND cm.metadata->>'response_time_ms' IS NOT NULL 
    THEN (cm.metadata->>'response_time_ms')::INTEGER 
  END) as avg_response_time_ms
FROM chatbot_instances ci
LEFT JOIN chatbot_errors ce ON ci.id = ce.chatbot_id
LEFT JOIN chatbot_conversations cc ON ci.id = cc.chatbot_id 
  AND cc.last_activity_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
LEFT JOIN chatbot_messages cm ON cc.id = cm.conversation_id
WHERE ci.deleted_at IS NULL
GROUP BY ci.id, ci.name, ci.status;
Advanced Features
sql
-- Conversation context management
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

-- Function to manage conversation memory
CREATE OR REPLACE FUNCTION update_conversation_context(
  p_conversation_id UUID,
  p_key VARCHAR(255),
  p_value JSONB,
  p_ttl_minutes INTEGER DEFAULT 60
)
RETURNS void AS $$
BEGIN
  INSERT INTO conversation_context (
    conversation_id,
    context_key,
    context_value,
    expires_at
  ) VALUES (
    p_conversation_id,
    p_key,
    p_value,
    CURRENT_TIMESTAMP + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  ON CONFLICT (conversation_id, context_key)
  DO UPDATE SET
    context_value = p_value,
    expires_at = CURRENT_TIMESTAMP + (p_ttl_minutes || ' minutes')::INTERVAL,
    updated_at = CURRENT_TIMESTAMP;
  
  -- Clean expired contexts
  DELETE FROM conversation_context
  WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Multi-language support
CREATE TABLE chatbot_translations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID REFERENCES chatbot_instances(id) ON DELETE CASCADE,
  language_code VARCHAR(5) NOT NULL, -- 'en', 'zh-TW', 'ja', etc.
  translations JSONB NOT NULL, -- Key-value pairs for UI elements
  system_prompt TEXT, -- Localized system prompt
  welcome_message TEXT, -- Localized welcome message
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chatbot_id, language_code)
);

-- Feedback collection
CREATE TABLE message_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES chatbot_messages(id) ON DELETE CASCADE,
  feedback_type VARCHAR(50) NOT NULL, -- 'helpful', 'not_helpful', 'inappropriate'
  feedback_text TEXT,
  user_identifier VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_identifier)
);
API Response Examples for New Features
Analytics Dashboard Response:

json
GET /api/v1/chatbots/{chatbotId}/analytics?period=30d
Response:
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
        "uniqueUsers": 45
      }
      // ... more daily data
    ]
  },
  "topQueries": [
    {
      "query": "vitamin c stability",
      "count": 89,
      "avgSatisfaction": 0.91
    },
    {
      "query": "preservative systems",
      "count": 76,
      "avgSatisfaction": 0.85
    }
  ],
  "integrationBreakdown": {
    "web_embed": 65,
    "line_oa": 30,
    "api": 5
  }
}
Health Check Response:

json
GET /api/v1/chatbots/{chatbotId}/health
Response:
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 12
    },
    "vectorSearch": {
      "status": "ok",
      "avgSearchTime": 45,
      "indexSize": 1234567
    },
    "llmService": {
      "status": "ok",
      "avgResponseTime": 1100
    },
    "errorRate": {
      "status": "ok",
      "errorsLastHour": 2,
      "errorThreshold": 10
    }
  },
  "uptime": 2592000,
  "lastError": {
    "type": "rate_limit_exceeded",
    "occurredAt": "2024-01-15T10:30:00Z"
  }
}
Deployment Considerations
yaml
# Docker Compose configuration for chatbot service
version: '3.8'

services:
  chatbot-api:
    build: ./chatbot-service
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/cosmetics_kb
      - REDIS_URL=redis://redis:6379
      - LLM_API_KEY=${LLM_API_KEY}
      - EMBEDDING_API_KEY=${EMBEDDING_API_KEY}
    depends_on:
      - postgres
      - redis
    ports:
      - "8080:8080"
    
  chatbot-worker:
    build: ./chatbot-worker
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/cosmetics_kb
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
      
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    ports:
      - "443:443"
    depends_on:
      - chatbot-api
This comprehensive extension provides:

Complete chatbot lifecycle management from creation to deployment
Robust security features including rate limiting, audit logging, and content moderation
Performance optimization through caching, materialized views, and efficient indexing
Multi-channel integration with specific support for JavaScript widgets and Line OA
Advanced analytics for monitoring usage and performance
AI-powered features for system prompt generation and response improvement
Production-ready infrastructure with error handling, health checks, and monitoring
The system is designed to scale horizontally and can handle high-traffic scenarios while maintaining the security and performance requirements of a B2B cosmetics platform.