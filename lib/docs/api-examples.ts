/**
 * API Examples and Code Snippets
 * Comprehensive examples for integrating with the Chatbot Public API
 */

export interface CodeExample {
  id: string;
  title: string;
  description: string;
  language: string;
  category: 'basic' | 'intermediate' | 'advanced';
  tags: string[];
  code: string;
  dependencies?: string[];
  notes?: string[];
}

export const apiExamples: CodeExample[] = [
  // Basic Examples
  {
    id: 'basic-message-send',
    title: 'Send a Simple Message',
    description: 'Send a basic message to a chatbot and receive a response',
    language: 'javascript',
    category: 'basic',
    tags: ['chat', 'message', 'basic'],
    code: `// Send a message to a chatbot
const response = await fetch('https://api.chatbot.com/v1/public/chat/123e4567-e89b-12d3-a456-426614174000/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'cb_live_your_api_key_here'
  },
  body: JSON.stringify({
    message: 'Hello, can you help me with my order?',
    sessionId: 'session_' + Date.now(),
    userId: 'user_123'
  })
});

const data = await response.json();

if (data.success) {
  console.log('Bot response:', data.data.message);
  console.log('Session ID:', data.data.sessionId);
  console.log('Tokens used:', data.data.usage.tokensUsed);
} else {
  console.error('Error:', data.error.message);
}`,
    notes: [
      'Replace the chatbot ID with your actual chatbot ID',
      'Always include your API key in the headers',
      'Session ID helps maintain conversation context'
    ]
  },
  {
    id: 'get-chatbot-config',
    title: 'Get Chatbot Configuration',
    description: 'Retrieve public configuration for widget integration',
    language: 'javascript',
    category: 'basic',
    tags: ['config', 'widget', 'integration'],
    code: `// Get chatbot configuration
const response = await fetch('https://api.chatbot.com/v1/public/chat/123e4567-e89b-12d3-a456-426614174000/config', {
  method: 'GET',
  headers: {
    'x-api-key': 'cb_live_your_api_key_here'
  }
});

const data = await response.json();

if (data.success) {
  const config = data.data;
  console.log('Chatbot name:', config.name);
  console.log('Greeting:', config.settings.greeting);
  console.log('Theme:', config.settings.theme);
  console.log('Features:', config.settings.features);
  console.log('Rate limits:', config.limits);
} else {
  console.error('Error:', data.error.message);
}`,
    notes: [
      'Configuration data is safe to store in frontend applications',
      'Use this data to customize your chat widget appearance',
      'Rate limits help you implement proper throttling'
    ]
  },
  {
    id: 'conversation-history',
    title: 'Get Conversation History',
    description: 'Retrieve chat history for a specific session',
    language: 'javascript',
    category: 'basic',
    tags: ['history', 'conversation', 'session'],
    code: `// Get conversation history
const sessionId = 'session_123456789';
const response = await fetch(\`https://api.chatbot.com/v1/public/chat/123e4567-e89b-12d3-a456-426614174000/messages?sessionId=\${sessionId}&limit=50\`, {
  method: 'GET',
  headers: {
    'x-api-key': 'cb_live_your_api_key_here'
  }
});

const data = await response.json();

if (data.success) {
  const messages = data.data.messages;
  console.log(\`Found \${messages.length} messages\`);

  messages.forEach(msg => {
    console.log(\`[\${msg.role}] \${msg.message}\`);
  });

  console.log('Pagination:', data.data.pagination);
} else {
  console.error('Error:', data.error.message);
}`,
    notes: [
      'Session ID is required to retrieve history',
      'Use pagination for large conversation histories',
      'Messages are returned in chronological order'
    ]
  },

  // Intermediate Examples
  {
    id: 'error-handling',
    title: 'Comprehensive Error Handling',
    description: 'Handle various error scenarios and rate limiting',
    language: 'javascript',
    category: 'intermediate',
    tags: ['error-handling', 'rate-limiting', 'retry'],
    code: `class ChatbotAPI {
  constructor(apiKey, baseUrl = 'https://api.chatbot.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async sendMessage(chatbotId, message, options = {}) {
    const { sessionId, userId, retries = 3, retryDelay = 1000 } = options;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(\`\${this.baseUrl}/public/chat/\${chatbotId}/messages\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
          },
          body: JSON.stringify({
            message,
            sessionId,
            userId
          })
        });

        const data = await response.json();

        if (response.ok) {
          return { success: true, data: data.data };
        }

        // Handle specific error cases
        switch (response.status) {
          case 401:
            throw new Error('Invalid API key or insufficient permissions');
          case 404:
            throw new Error('Chatbot not found or inactive');
          case 429:
            // Rate limit hit - calculate delay and retry
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const retryAfter = response.headers.get('Retry-After');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay * attempt;

            if (attempt < retries) {
              console.log(\`Rate limit hit, retrying in \${delay}ms (attempt \${attempt}/\${retries})\`);
              await this.sleep(delay);
              continue;
            }
            throw new Error(\`Rate limit exceeded. Try again at \${resetTime}\`);
          case 400:
            throw new Error(\`Validation error: \${data.error.details?.join(', ') || data.error.message}\`);
          default:
            throw new Error(\`API error: \${data.error.message}\`);
        }
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        console.log(\`Request failed, retrying in \${retryDelay * attempt}ms\`);
        await this.sleep(retryDelay * attempt);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage example
const api = new ChatbotAPI('cb_live_your_api_key_here');

try {
  const result = await api.sendMessage(
    '123e4567-e89b-12d3-a456-426614174000',
    'Hello, world!',
    { sessionId: 'session_123', userId: 'user_456', retries: 3 }
  );
  console.log('Success:', result.data.message);
} catch (error) {
  console.error('Failed to send message:', error.message);
}`,
    notes: [
      'Always implement retry logic for production applications',
      'Respect rate limit headers and implement exponential backoff',
      'Different HTTP status codes require different handling strategies'
    ]
  },
  {
    id: 'conversation-manager',
    title: 'Conversation Session Manager',
    description: 'Manage multiple chat sessions with context preservation',
    language: 'javascript',
    category: 'intermediate',
    tags: ['session-management', 'context', 'state'],
    code: `class ConversationManager {
  constructor(apiKey, chatbotId) {
    this.apiKey = apiKey;
    this.chatbotId = chatbotId;
    this.sessions = new Map();
    this.baseUrl = 'https://api.chatbot.com/v1';
  }

  // Create a new conversation session
  createSession(userId) {
    const sessionId = \`session_\${userId}_\${Date.now()}\`;
    const session = {
      sessionId,
      userId,
      messages: [],
      metadata: {
        startTime: new Date(),
        messageCount: 0,
        lastActivity: new Date()
      }
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  // Send message with session context
  async sendMessage(sessionId, message, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(\`Session \${sessionId} not found\`);
    }

    try {
      const response = await fetch(\`\${this.baseUrl}/public/chat/\${this.chatbotId}/messages\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          message,
          sessionId,
          userId: session.userId,
          context: {
            previousMessages: Math.min(session.messages.length, 5),
            ...options.context
          },
          metadata: {
            clientTimestamp: new Date().toISOString(),
            messageIndex: session.metadata.messageCount,
            ...options.metadata
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Update session with new messages
        session.messages.push(
          { role: 'user', message, timestamp: new Date() },
          { role: 'assistant', message: data.data.message, timestamp: new Date() }
        );
        session.metadata.messageCount += 2;
        session.metadata.lastActivity = new Date();

        return {
          success: true,
          message: data.data.message,
          messageId: data.data.messageId,
          usage: data.data.usage,
          sessionInfo: {
            messageCount: session.metadata.messageCount,
            duration: new Date() - session.metadata.startTime
          }
        };
      } else {
        throw new Error(\`API error: \${data.error.message}\`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Get session history
  getSessionHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.messages : null;
  }

  // Clean up inactive sessions
  cleanupSessions(maxAgeMinutes = 30) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    for (const [sessionId, session] of this.sessions) {
      if (session.metadata.lastActivity < cutoff) {
        this.sessions.delete(sessionId);
        console.log(\`Cleaned up inactive session: \${sessionId}\`);
      }
    }
  }

  // Get session statistics
  getStats() {
    const activeSessions = this.sessions.size;
    const totalMessages = Array.from(this.sessions.values())
      .reduce((sum, session) => sum + session.metadata.messageCount, 0);

    return {
      activeSessions,
      totalMessages,
      averageMessagesPerSession: activeSessions > 0 ? totalMessages / activeSessions : 0
    };
  }
}

// Usage example
const conversationManager = new ConversationManager('cb_live_your_api_key_here', '123e4567-e89b-12d3-a456-426614174000');

// Create a new session
const sessionId = conversationManager.createSession('user_123');

// Send messages
try {
  const response1 = await conversationManager.sendMessage(sessionId, 'Hello, I need help with my order');
  console.log('Bot:', response1.message);

  const response2 = await conversationManager.sendMessage(sessionId, 'My order number is #12345');
  console.log('Bot:', response2.message);

  // Get conversation history
  const history = conversationManager.getSessionHistory(sessionId);
  console.log(\`Conversation has \${history.length} messages\`);

  // Clean up old sessions periodically
  setInterval(() => {
    conversationManager.cleanupSessions(30); // 30 minutes
  }, 5 * 60 * 1000); // Check every 5 minutes

} catch (error) {
  console.error('Conversation error:', error.message);
}`,
    notes: [
      'Session management helps maintain conversation context',
      'Implement cleanup to prevent memory leaks in long-running applications',
      'Use metadata to track conversation analytics'
    ]
  },

  // Advanced Examples
  {
    id: 'streaming-chat-widget',
    title: 'Real-time Chat Widget',
    description: 'Complete chat widget with real-time updates and typing indicators',
    language: 'javascript',
    category: 'advanced',
    tags: ['widget', 'real-time', 'ui', 'react'],
    code: `import React, { useState, useEffect, useRef } from 'react';

const ChatWidget = ({ chatbotId, apiKey, userId }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [config, setConfig] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize chat widget
  useEffect(() => {
    initializeChat();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeChat = async () => {
    try {
      // Get chatbot configuration
      const configResponse = await fetch(\`https://api.chatbot.com/v1/public/chat/\${chatbotId}/config\`, {
        headers: { 'x-api-key': apiKey }
      });
      const configData = await configResponse.json();

      if (configData.success) {
        setConfig(configData.data);

        // Create session and add greeting message
        const newSessionId = \`session_\${userId}_\${Date.now()}\`;
        setSessionId(newSessionId);

        if (configData.data.settings.greeting) {
          setMessages([{
            id: 'greeting',
            role: 'assistant',
            message: configData.data.settings.greeting,
            timestamp: new Date()
          }]);
        }
      }
    } catch (error) {
      console.error('Failed to initialize chat:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading || !sessionId) return;

    const userMessage = {
      id: \`msg_\${Date.now()}\`,
      role: 'user',
      message: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Simulate typing delay
      setTimeout(() => setIsTyping(false), 2000);

      const response = await fetch(\`https://api.chatbot.com/v1/public/chat/\${chatbotId}/messages\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          message: inputValue,
          sessionId,
          userId,
          context: {
            previousMessages: 5,
            includeVectorSearch: true
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        const botMessage = {
          id: data.data.messageId,
          role: 'assistant',
          message: data.data.message,
          timestamp: new Date(),
          usage: data.data.usage
        };

        setMessages(prev => [...prev, botMessage]);
      } else {
        throw new Error(data.error.message);
      }
    } catch (error) {
      console.error('Error sending message:', error);

      // Add error message
      const errorMessage = {
        id: \`error_\${Date.now()}\`,
        role: 'system',
        message: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
        error: true
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!config) {
    return (
      <div className="chat-widget loading">
        <div className="loading-spinner"></div>
        <p>Loading chat...</p>
      </div>
    );
  }

  return (
    <div
      className="chat-widget"
      style={{
        '--primary-color': config.settings.colors?.primary || '#007bff',
        '--secondary-color': config.settings.colors?.secondary || '#f8f9fa'
      }}
    >
      {/* Header */}
      <div className="chat-header">
        <div className="bot-info">
          {config.settings.features.botAvatar && (
            <div className="bot-avatar">🤖</div>
          )}
          <div>
            <h3>{config.name}</h3>
            <p className="status">Online</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={\`message \${message.role} \${message.error ? 'error' : ''}\`}
          >
            <div className="message-content">
              <p>{message.message}</p>
              {config.settings.features.timestamps && (
                <span className="timestamp">
                  {formatTimestamp(message.timestamp)}
                </span>
              )}
            </div>
            {message.usage && (
              <div className="message-stats">
                <small>Tokens: {message.usage.tokensUsed} | Response: {message.usage.responseTime}ms</small>
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="message assistant typing">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input">
        <div className="input-container">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            disabled={isLoading}
            maxLength={config.limits.maxMessageLength}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !inputValue.trim()}
            className="send-button"
          >
            {isLoading ? '⟳' : '➤'}
          </button>
        </div>
        <div className="input-footer">
          <small>
            {inputValue.length}/{config.limits.maxMessageLength} characters
          </small>
        </div>
      </div>
    </div>
  );
};

// CSS styles (add to your stylesheet)
const styles = \`
.chat-widget {
  width: 400px;
  height: 600px;
  border: 1px solid #ddd;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-header {
  padding: 16px;
  background: var(--primary-color);
  color: white;
  border-radius: 12px 12px 0 0;
}

.bot-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bot-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.status {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.chat-messages {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  max-width: 80%;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-content {
  padding: 12px 16px;
  border-radius: 18px;
  word-wrap: break-word;
}

.message.user .message-content {
  background: var(--primary-color);
  color: white;
}

.message.assistant .message-content {
  background: var(--secondary-color);
  color: #333;
}

.message.error .message-content {
  background: #fee;
  color: #c33;
  border: 1px solid #fcc;
}

.timestamp {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 4px;
  display: block;
}

.message-stats {
  font-size: 10px;
  color: #666;
  margin-top: 4px;
}

.typing-dots {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ccc;
  animation: typing 1.4s infinite;
}

.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-10px); }
}

.chat-input {
  padding: 16px;
  border-top: 1px solid #eee;
}

.input-container {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-container input {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 24px;
  outline: none;
  font-size: 14px;
}

.input-container input:focus {
  border-color: var(--primary-color);
}

.send-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-footer {
  margin-top: 8px;
  text-align: right;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
\`;

export default ChatWidget;`,
    dependencies: ['react'],
    notes: [
      'This is a complete chat widget implementation with React',
      'Includes real-time features like typing indicators',
      'Handles errors gracefully and provides user feedback',
      'Fully customizable based on chatbot configuration'
    ]
  },
  {
    id: 'python-sdk',
    title: 'Python SDK Implementation',
    description: 'Complete Python SDK for the Chatbot API',
    language: 'python',
    category: 'advanced',
    tags: ['python', 'sdk', 'async', 'client'],
    code: `import asyncio
import aiohttp
import json
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime
import time

@dataclass
class ChatbotMessage:
    id: str
    role: str
    message: str
    timestamp: datetime
    usage: Optional[Dict[str, Any]] = None

@dataclass
class ChatbotConfig:
    id: str
    name: str
    description: str
    settings: Dict[str, Any]
    limits: Dict[str, Any]
    version: str

class ChatbotAPIError(Exception):
    """Base exception for Chatbot API errors"""
    def __init__(self, message: str, status_code: int = None, error_code: str = None):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(message)

class RateLimitError(ChatbotAPIError):
    """Raised when rate limit is exceeded"""
    def __init__(self, message: str, retry_after: int = None):
        super().__init__(message, 429, 'RATE_LIMIT_EXCEEDED')
        self.retry_after = retry_after

class ChatbotAPI:
    """
    Async Python client for the Chatbot API

    Example:
        api = ChatbotAPI('cb_live_your_api_key_here')
        config = await api.get_config('chatbot_id')
        response = await api.send_message('chatbot_id', 'Hello!', session_id='session_123')
    """

    def __init__(self, api_key: str, base_url: str = 'https://api.chatbot.com/v1'):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.session = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def _get_headers(self) -> Dict[str, str]:
        return {
            'Content-Type': 'application/json',
            'x-api-key': self.api_key,
            'User-Agent': 'ChatbotAPI-Python/1.0'
        }

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
        retries: int = 3
    ) -> Dict[str, Any]:
        """Make an HTTP request with retry logic"""

        if not self.session:
            self.session = aiohttp.ClientSession()

        url = f"{self.base_url}{endpoint}"
        headers = self._get_headers()

        for attempt in range(retries):
            try:
                async with self.session.request(
                    method,
                    url,
                    headers=headers,
                    json=data,
                    params=params
                ) as response:

                    response_data = await response.json()

                    if response.status == 200:
                        return response_data

                    elif response.status == 429:
                        # Rate limit handling
                        retry_after = int(response.headers.get('Retry-After', 60))
                        if attempt < retries - 1:
                            print(f"Rate limited, waiting {retry_after} seconds...")
                            await asyncio.sleep(retry_after)
                            continue
                        else:
                            raise RateLimitError(
                                response_data.get('error', {}).get('message', 'Rate limit exceeded'),
                                retry_after
                            )

                    elif response.status == 401:
                        raise ChatbotAPIError(
                            'Invalid API key or insufficient permissions',
                            401,
                            'UNAUTHORIZED'
                        )

                    elif response.status == 404:
                        raise ChatbotAPIError(
                            'Resource not found',
                            404,
                            'NOT_FOUND'
                        )

                    else:
                        error_info = response_data.get('error', {})
                        raise ChatbotAPIError(
                            error_info.get('message', f'HTTP {response.status}'),
                            response.status,
                            error_info.get('code', 'UNKNOWN_ERROR')
                        )

            except aiohttp.ClientError as e:
                if attempt < retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    print(f"Request failed, retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise ChatbotAPIError(f"Network error: {str(e)}")

    async def get_config(self, chatbot_id: str) -> ChatbotConfig:
        """Get chatbot configuration"""
        response = await self._make_request(
            'GET',
            f'/public/chat/{chatbot_id}/config'
        )

        if response.get('success'):
            data = response['data']
            return ChatbotConfig(
                id=data['id'],
                name=data['name'],
                description=data['description'],
                settings=data['settings'],
                limits=data['limits'],
                version=data['version']
            )
        else:
            raise ChatbotAPIError('Failed to get configuration')

    async def send_message(
        self,
        chatbot_id: str,
        message: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict] = None,
        context: Optional[Dict] = None
    ) -> ChatbotMessage:
        """Send a message to the chatbot"""

        payload = {
            'message': message,
            'sessionId': session_id,
            'userId': user_id,
            'metadata': metadata or {},
            'context': context or {}
        }

        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        response = await self._make_request(
            'POST',
            f'/public/chat/{chatbot_id}/messages',
            data=payload
        )

        if response.get('success'):
            data = response['data']
            return ChatbotMessage(
                id=data['messageId'],
                role='assistant',
                message=data['message'],
                timestamp=datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00')),
                usage=data.get('usage')
            )
        else:
            raise ChatbotAPIError('Failed to send message')

    async def get_conversation_history(
        self,
        chatbot_id: str,
        session_id: str,
        user_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[ChatbotMessage]:
        """Get conversation history"""

        params = {
            'sessionId': session_id,
            'limit': limit,
            'offset': offset
        }

        if user_id:
            params['userId'] = user_id

        response = await self._make_request(
            'GET',
            f'/public/chat/{chatbot_id}/messages',
            params=params
        )

        if response.get('success'):
            messages = []
            for msg_data in response['data']['messages']:
                messages.append(ChatbotMessage(
                    id=msg_data['id'],
                    role=msg_data['role'],
                    message=msg_data['message'],
                    timestamp=datetime.fromisoformat(msg_data['timestamp'].replace('Z', '+00:00'))
                ))
            return messages
        else:
            raise ChatbotAPIError('Failed to get conversation history')

    async def get_usage_analytics(
        self,
        period: str = 'day',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get usage analytics"""

        params = {'period': period}
        if start_date:
            params['startDate'] = start_date
        if end_date:
            params['endDate'] = end_date

        response = await self._make_request(
            'GET',
            '/analytics/usage',
            params=params
        )

        if response.get('success'):
            return response['data']
        else:
            raise ChatbotAPIError('Failed to get usage analytics')

class ConversationSession:
    """Helper class for managing conversation sessions"""

    def __init__(self, api: ChatbotAPI, chatbot_id: str, user_id: str):
        self.api = api
        self.chatbot_id = chatbot_id
        self.user_id = user_id
        self.session_id = f"session_{user_id}_{int(time.time())}"
        self.messages: List[ChatbotMessage] = []

    async def send_message(self, message: str, **kwargs) -> ChatbotMessage:
        """Send a message in this session"""
        response = await self.api.send_message(
            self.chatbot_id,
            message,
            session_id=self.session_id,
            user_id=self.user_id,
            **kwargs
        )

        # Add both user and bot messages to history
        user_msg = ChatbotMessage(
            id=f"user_{len(self.messages)}",
            role='user',
            message=message,
            timestamp=datetime.now()
        )

        self.messages.extend([user_msg, response])
        return response

    async def get_history(self) -> List[ChatbotMessage]:
        """Get full conversation history from API"""
        return await self.api.get_conversation_history(
            self.chatbot_id,
            self.session_id,
            self.user_id
        )

    def get_local_history(self) -> List[ChatbotMessage]:
        """Get locally stored message history"""
        return self.messages.copy()

# Usage examples
async def main():
    # Initialize API client
    async with ChatbotAPI('cb_live_your_api_key_here') as api:
        chatbot_id = '123e4567-e89b-12d3-a456-426614174000'

        try:
            # Get chatbot configuration
            config = await api.get_config(chatbot_id)
            print(f"Chatbot: {config.name}")
            print(f"Description: {config.description}")

            # Create a conversation session
            session = ConversationSession(api, chatbot_id, 'user_123')

            # Send messages
            response1 = await session.send_message('Hello, can you help me?')
            print(f"Bot: {response1.message}")

            response2 = await session.send_message('What services do you offer?')
            print(f"Bot: {response2.message}")

            # Get conversation history
            history = await session.get_history()
            print(f"\\nConversation has {len(history)} messages")

            # Get usage analytics
            analytics = await api.get_usage_analytics(period='day')
            print(f"\\nToday's usage: {analytics['usage']['requests']['total']} requests")

        except RateLimitError as e:
            print(f"Rate limited: {e.message}")
            print(f"Retry after: {e.retry_after} seconds")

        except ChatbotAPIError as e:
            print(f"API Error ({e.status_code}): {e.message}")

        except Exception as e:
            print(f"Unexpected error: {e}")

# Run the example
if __name__ == "__main__":
    asyncio.run(main())`,
    dependencies: ['aiohttp', 'asyncio'],
    notes: [
      'This is a complete async Python SDK with proper error handling',
      'Includes rate limiting, retries, and session management',
      'Supports all major API endpoints with type hints',
      'Use async context manager for automatic session cleanup'
    ]
  }
];

export const getExamplesByCategory = (category: 'basic' | 'intermediate' | 'advanced') => {
  return apiExamples.filter(example => example.category === category);
};

export const getExamplesByLanguage = (language: string) => {
  return apiExamples.filter(example => example.language === language);
};

export const getExamplesByTag = (tag: string) => {
  return apiExamples.filter(example => example.tags.includes(tag));
};

export const getExampleById = (id: string) => {
  return apiExamples.find(example => example.id === id);
};