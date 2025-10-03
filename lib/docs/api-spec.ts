/**
 * OpenAPI 3.0 specification for the Chatbot Public API
 * This generates interactive documentation for third-party developers
 */

export const apiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Chatbot Public API',
    description: `
# Chatbot Public API

The Chatbot Public API allows third-party developers to integrate chatbot functionality into their applications.

## Authentication

All API requests require authentication using an API key. Include your API key in the request header:

\`\`\`
x-api-key: cb_live_your_api_key_here
\`\`\`

Or as a Bearer token:

\`\`\`
Authorization: Bearer cb_live_your_api_key_here
\`\`\`

## Rate Limits

- **Free Tier**: 1,000 requests/hour, 10,000 requests/day
- **Basic Tier**: 10,000 requests/hour, 100,000 requests/day
- **Premium Tier**: 100,000 requests/hour, 1,000,000 requests/day
- **Enterprise Tier**: Custom limits

## Error Handling

The API uses standard HTTP status codes and returns structured error responses:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": ["message: Message cannot be empty"]
  }
}
\`\`\`

## SDKs and Libraries

- JavaScript/TypeScript: \`npm install @chatbot/sdk\`
- Python: \`pip install chatbot-sdk\`
- PHP: \`composer require chatbot/sdk\`
- Go: \`go get github.com/chatbot/go-sdk\`
    `,
    version: '1.0.0',
    contact: {
      name: 'API Support',
      email: 'api-support@chatbot.com',
      url: 'https://docs.chatbot.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'https://api.chatbot.com/v1',
      description: 'Production server'
    },
    {
      url: 'https://staging-api.chatbot.com/v1',
      description: 'Staging server'
    }
  ],
  security: [
    {
      ApiKeyAuth: []
    },
    {
      BearerAuth: []
    }
  ],
  paths: {
    '/public/chat/{chatbotId}/config': {
      get: {
        summary: 'Get chatbot configuration',
        description: 'Retrieve public configuration for a chatbot widget integration.',
        operationId: 'getChatbotConfig',
        tags: ['Chat'],
        parameters: [
          {
            name: 'chatbotId',
            in: 'path',
            required: true,
            description: 'Unique identifier for the chatbot',
            schema: {
              type: 'string',
              format: 'uuid'
            },
            example: '123e4567-e89b-12d3-a456-426614174000'
          }
        ],
        responses: {
          '200': {
            description: 'Chatbot configuration retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ChatbotConfigResponse'
                }
              }
            }
          },
          '401': {
            description: 'Authentication required',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          },
          '404': {
            description: 'Chatbot not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          }
        }
      }
    },
    '/public/chat/{chatbotId}/messages': {
      post: {
        summary: 'Send message to chatbot',
        description: 'Send a message to a chatbot and receive a response.',
        operationId: 'sendMessage',
        tags: ['Chat'],
        parameters: [
          {
            name: 'chatbotId',
            in: 'path',
            required: true,
            description: 'Unique identifier for the chatbot',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SendMessageRequest'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Message sent successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SendMessageResponse'
                }
              }
            }
          },
          '400': {
            description: 'Invalid request data',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          },
          '401': {
            description: 'Authentication required',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          },
          '429': {
            description: 'Rate limit exceeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RateLimitErrorResponse'
                }
              }
            }
          }
        }
      },
      get: {
        summary: 'Get conversation history',
        description: 'Retrieve conversation history for a specific session.',
        operationId: 'getConversationHistory',
        tags: ['Chat'],
        parameters: [
          {
            name: 'chatbotId',
            in: 'path',
            required: true,
            description: 'Unique identifier for the chatbot',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          },
          {
            name: 'sessionId',
            in: 'query',
            required: true,
            description: 'Session identifier',
            schema: {
              type: 'string'
            }
          },
          {
            name: 'userId',
            in: 'query',
            required: false,
            description: 'User identifier',
            schema: {
              type: 'string'
            }
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Maximum number of messages to return',
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50
            }
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            description: 'Number of messages to skip',
            schema: {
              type: 'integer',
              minimum: 0,
              default: 0
            }
          }
        ],
        responses: {
          '200': {
            description: 'Conversation history retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ConversationHistoryResponse'
                }
              }
            }
          },
          '400': {
            description: 'Missing session ID',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          },
          '401': {
            description: 'Authentication required',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key for authentication. Format: cb_live_32_character_string'
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token authentication. Format: Bearer cb_live_32_character_string'
      }
    },
    schemas: {
      SendMessageRequest: {
        type: 'object',
        required: ['message'],
        properties: {
          message: {
            type: 'string',
            description: 'The message to send to the chatbot',
            minLength: 1,
            maxLength: 2000,
            example: 'Hello, can you help me with my order?'
          },
          sessionId: {
            type: 'string',
            description: 'Optional session identifier for conversation continuity',
            maxLength: 100,
            example: 'session_123456789'
          },
          userId: {
            type: 'string',
            description: 'Optional user identifier',
            maxLength: 100,
            example: 'user_abc123'
          },
          metadata: {
            type: 'object',
            description: 'Optional metadata object',
            additionalProperties: true,
            example: {
              source: 'mobile_app',
              version: '1.2.3'
            }
          },
          context: {
            type: 'object',
            description: 'Optional context configuration',
            properties: {
              previousMessages: {
                type: 'integer',
                minimum: 0,
                maximum: 10,
                description: 'Number of previous messages to include in context'
              },
              includeVectorSearch: {
                type: 'boolean',
                description: 'Whether to include vector search results'
              },
              maxTokens: {
                type: 'integer',
                minimum: 1,
                maximum: 4000,
                description: 'Maximum tokens for the response'
              },
              temperature: {
                type: 'number',
                minimum: 0,
                maximum: 2,
                description: 'Temperature for response generation'
              }
            }
          }
        }
      },
      SendMessageResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The chatbot response',
                example: 'Hello! I\'d be happy to help you with your order. Could you please provide your order number?'
              },
              sessionId: {
                type: 'string',
                description: 'Session identifier for this conversation',
                example: 'session_123456789'
              },
              messageId: {
                type: 'string',
                description: 'Unique identifier for this message',
                example: 'msg_abc123def456'
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
                description: 'When the message was processed',
                example: '2024-01-15T10:30:00Z'
              },
              usage: {
                type: 'object',
                properties: {
                  tokensUsed: {
                    type: 'integer',
                    description: 'Number of tokens consumed',
                    example: 45
                  },
                  responseTime: {
                    type: 'integer',
                    description: 'Response time in milliseconds',
                    example: 1250
                  },
                  vectorSearchResults: {
                    type: 'integer',
                    description: 'Number of vector search results used',
                    example: 3
                  }
                }
              }
            }
          }
        }
      },
      ChatbotConfigResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
                description: 'Chatbot unique identifier'
              },
              name: {
                type: 'string',
                description: 'Chatbot display name',
                example: 'Customer Support Bot'
              },
              description: {
                type: 'string',
                description: 'Chatbot description',
                example: 'AI-powered customer support assistant'
              },
              settings: {
                type: 'object',
                properties: {
                  maxTokens: {
                    type: 'integer',
                    description: 'Maximum tokens per response'
                  },
                  temperature: {
                    type: 'number',
                    description: 'Response generation temperature'
                  },
                  greeting: {
                    type: 'string',
                    description: 'Initial greeting message'
                  },
                  theme: {
                    type: 'string',
                    description: 'UI theme',
                    example: 'default'
                  },
                  colors: {
                    type: 'object',
                    description: 'Custom color scheme'
                  },
                  features: {
                    type: 'object',
                    properties: {
                      typing: {
                        type: 'boolean',
                        description: 'Show typing indicators'
                      },
                      timestamps: {
                        type: 'boolean',
                        description: 'Show message timestamps'
                      },
                      userAvatar: {
                        type: 'boolean',
                        description: 'Show user avatars'
                      },
                      botAvatar: {
                        type: 'boolean',
                        description: 'Show bot avatar'
                      },
                      feedback: {
                        type: 'boolean',
                        description: 'Allow message feedback'
                      },
                      fileUpload: {
                        type: 'boolean',
                        description: 'Allow file uploads'
                      }
                    }
                  }
                }
              },
              limits: {
                type: 'object',
                properties: {
                  maxMessageLength: {
                    type: 'integer',
                    description: 'Maximum message length in characters'
                  },
                  rateLimitPerMinute: {
                    type: 'integer',
                    description: 'Rate limit per minute'
                  },
                  sessionTimeout: {
                    type: 'integer',
                    description: 'Session timeout in milliseconds'
                  }
                }
              },
              supportedFormats: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Supported message formats'
              },
              version: {
                type: 'string',
                description: 'API version'
              },
              lastUpdated: {
                type: 'string',
                format: 'date-time',
                description: 'Last configuration update'
              }
            }
          }
        }
      },
      ConversationHistoryResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                      description: 'Message unique identifier'
                    },
                    message: {
                      type: 'string',
                      description: 'Message content'
                    },
                    role: {
                      type: 'string',
                      enum: ['user', 'assistant'],
                      description: 'Message sender role'
                    },
                    timestamp: {
                      type: 'string',
                      format: 'date-time',
                      description: 'Message timestamp'
                    },
                    metadata: {
                      type: 'object',
                      description: 'Message metadata'
                    }
                  }
                }
              },
              pagination: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'integer',
                    description: 'Results per page'
                  },
                  offset: {
                    type: 'integer',
                    description: 'Number of results skipped'
                  },
                  total: {
                    type: 'integer',
                    description: 'Total number of messages'
                  }
                }
              }
            }
          }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'Error code',
                example: 'VALIDATION_ERROR'
              },
              message: {
                type: 'string',
                description: 'Human-readable error message',
                example: 'Invalid request data'
              },
              details: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Detailed error information',
                example: ['message: Message cannot be empty']
              }
            }
          }
        }
      },
      RateLimitErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'RATE_LIMIT_EXCEEDED'
              },
              message: {
                type: 'string',
                example: 'Rate limit exceeded'
              },
              limit: {
                type: 'integer',
                description: 'Rate limit threshold'
              },
              remaining: {
                type: 'integer',
                description: 'Remaining requests'
              },
              resetTime: {
                type: 'string',
                format: 'date-time',
                description: 'When the rate limit resets'
              }
            }
          }
        }
      }
    }
  },
  tags: [
    {
      name: 'Chat',
      description: 'Chat operations for sending messages and retrieving conversation history'
    }
  ]
};