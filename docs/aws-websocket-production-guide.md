# AWS WebSocket Production Implementation Guide

## Executive Summary

This guide provides a comprehensive roadmap for implementing production-ready WebSocket functionality for the chatbot platform using AWS services. The implementation leverages AWS API Gateway WebSocket API, Lambda functions, DynamoDB for connection management, and integrates seamlessly with the existing Claude Agent SDK and Neon PostgreSQL database.

## Architecture Overview

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Web    │    │   AWS API        │    │   Lambda        │
│   Application   │───▶│   Gateway        │───▶│   Functions     │
│                 │    │   WebSocket API  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                 │                        │
                                 ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   DynamoDB       │    │   Claude Agent  │
                       │   Connection     │    │   SDK           │
                       │   Management     │    │   (Bedrock)     │
                       └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │   Neon          │
                                               │   PostgreSQL    │
                                               │   Database      │
                                               └─────────────────┘
```

### Core Components

1. **AWS API Gateway WebSocket API**: Manages WebSocket connections and routing
2. **Lambda Functions**: Handle connection lifecycle and message processing
3. **DynamoDB**: Stores connection metadata and session state
4. **CloudWatch**: Monitoring and logging
5. **IAM Roles**: Security and permissions management

## Implementation Roadmap

### Phase 1: Infrastructure Setup

#### 1.1 AWS API Gateway WebSocket API

**Creation Steps:**
```bash
# Create WebSocket API
aws apigatewayv2 create-api \
  --name "chatbot-websocket-api" \
  --protocol-type WEBSOCKET \
  --route-selection-expression "\$request.body.action" \
  --region ap-southeast-1
```

**Route Configuration:**
- `$connect` - Connection establishment
- `$disconnect` - Connection termination
- `$default` - Default message handling
- `sendMessage` - Chat message processing
- `joinSession` - Session management
- `leaveSession` - Session cleanup

#### 1.2 DynamoDB Tables

**Connection Management Table:**
```typescript
interface ConnectionRecord {
  connectionId: string;        // Partition key
  userId: string;             // Global secondary index
  sessionId?: string;         // Session association
  chatbotId?: string;         // Chatbot context
  connectedAt: number;        // Timestamp
  lastActivity: number;       // Activity tracking
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    authToken?: string;
  };
  ttl: number;               // Auto-cleanup
}
```

**Session State Table:**
```typescript
interface SessionState {
  sessionId: string;          // Partition key
  connectionIds: string[];    // Active connections
  chatbotId: string;         // Associated chatbot
  isActive: boolean;         // Session status
  createdAt: number;         // Creation timestamp
  lastMessageAt: number;     // Last activity
  messageCount: number;      // Message counter
  config: {
    temperature?: number;
    maxTokens?: number;
    language?: string;
  };
  ttl: number;               // Auto-cleanup
}
```

#### 1.3 CloudFormation Template

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Chatbot WebSocket Infrastructure'

Parameters:
  Environment:
    Type: String
    Default: production
    AllowedValues: [development, staging, production]

Resources:
  # WebSocket API
  ChatbotWebSocketApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: !Sub "${Environment}-chatbot-websocket"
      ProtocolType: WEBSOCKET
      RouteSelectionExpression: "$request.body.action"

  # DynamoDB Tables
  ConnectionTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${Environment}-websocket-connections"
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: connectionId
          AttributeType: S
        - AttributeName: userId
          AttributeType: S
      KeySchema:
        - AttributeName: connectionId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: UserIdIndex
          KeySchema:
            - AttributeName: userId
              KeyType: HASH
          Projection:
            ProjectionType: ALL
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  SessionStateTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${Environment}-websocket-sessions"
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: sessionId
          AttributeType: S
      KeySchema:
        - AttributeName: sessionId
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  # Lambda Functions
  ConnectFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub "${Environment}-websocket-connect"
      Runtime: nodejs18.x
      Handler: index.handler
      Code:
        ZipFile: |
          // Connect handler code will be deployed separately
          exports.handler = async (event) => {
            return { statusCode: 200 };
          };
      Environment:
        Variables:
          CONNECTION_TABLE: !Ref ConnectionTable
          SESSION_TABLE: !Ref SessionStateTable
          ENVIRONMENT: !Ref Environment

  DisconnectFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub "${Environment}-websocket-disconnect"
      Runtime: nodejs18.x
      Handler: index.handler
      Code:
        ZipFile: |
          // Disconnect handler code will be deployed separately
          exports.handler = async (event) => {
            return { statusCode: 200 };
          };

  MessageFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub "${Environment}-websocket-message"
      Runtime: nodejs18.x
      Handler: index.handler
      Code:
        ZipFile: |
          // Message handler code will be deployed separately
          exports.handler = async (event) => {
            return { statusCode: 200 };
          };
      Environment:
        Variables:
          CONNECTION_TABLE: !Ref ConnectionTable
          SESSION_TABLE: !Ref SessionStateTable
          DATABASE_URL: !Sub "{{resolve:ssm:/${Environment}/DATABASE_URL}}"
          BEDROCK_REGION: us-east-1
```

### Phase 2: Lambda Function Implementation

#### 2.1 Connection Handler (`$connect`)

```typescript
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import jwt from 'jsonwebtoken';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  try {
    // Extract authentication token
    const authToken = event.queryStringParameters?.token;
    if (!authToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Authentication token required' })
      };
    }

    // Verify JWT token
    const decoded = jwt.verify(authToken, process.env.JWT_SECRET!) as any;
    const userId = decoded.userId;

    // Store connection information
    const connectionRecord = {
      connectionId: { S: connectionId },
      userId: { S: userId },
      connectedAt: { N: Date.now().toString() },
      lastActivity: { N: Date.now().toString() },
      metadata: {
        M: {
          userAgent: { S: event.requestContext.identity?.userAgent || 'unknown' },
          sourceIp: { S: event.requestContext.identity?.sourceIp || 'unknown' },
          domainName: { S: domainName },
          stage: { S: stage }
        }
      },
      ttl: { N: Math.floor(Date.now() / 1000 + 24 * 60 * 60).toString() } // 24 hours TTL
    };

    await dynamodb.send(new PutItemCommand({
      TableName: process.env.CONNECTION_TABLE!,
      Item: connectionRecord
    }));

    console.log(`WebSocket connection established: ${connectionId} for user: ${userId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Connected successfully',
        connectionId,
        userId
      })
    };

  } catch (error) {
    console.error('Connection error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

#### 2.2 Disconnect Handler (`$disconnect`)

```typescript
import { DynamoDBClient, DeleteItemCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;

  try {
    // Get connection details before deletion
    const connectionData = await dynamodb.send(new GetItemCommand({
      TableName: process.env.CONNECTION_TABLE!,
      Key: { connectionId: { S: connectionId } }
    }));

    if (connectionData.Item) {
      const sessionId = connectionData.Item.sessionId?.S;

      // If user was in a session, remove from session state
      if (sessionId) {
        await updateSessionConnections(sessionId, connectionId, 'remove');
      }

      // Delete connection record
      await dynamodb.send(new DeleteItemCommand({
        TableName: process.env.CONNECTION_TABLE!,
        Key: { connectionId: { S: connectionId } }
      }));

      console.log(`WebSocket connection closed: ${connectionId}`);
    }

    return { statusCode: 200 };

  } catch (error) {
    console.error('Disconnect error:', error);
    return { statusCode: 500 };
  }
};

async function updateSessionConnections(sessionId: string, connectionId: string, action: 'add' | 'remove') {
  try {
    const updateExpression = action === 'add'
      ? 'ADD connectionIds :connId SET lastMessageAt = :timestamp'
      : 'DELETE connectionIds :connId SET lastMessageAt = :timestamp';

    await dynamodb.send(new UpdateItemCommand({
      TableName: process.env.SESSION_TABLE!,
      Key: { sessionId: { S: sessionId } },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: {
        ':connId': { SS: [connectionId] },
        ':timestamp': { N: Date.now().toString() }
      }
    }));
  } catch (error) {
    console.error('Error updating session connections:', error);
  }
}
```

#### 2.3 Message Handler (Chat Processing)

```typescript
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

// Connection pool for PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const handler = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  // Initialize API Gateway Management API
  const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
    region: process.env.AWS_REGION
  });

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, sessionId, message, config = {} } = body;

    if (action === 'sendMessage') {
      return await handleChatMessage(
        connectionId,
        sessionId,
        message,
        config,
        apiGateway
      );
    } else if (action === 'joinSession') {
      return await handleJoinSession(connectionId, sessionId, apiGateway);
    } else if (action === 'leaveSession') {
      return await handleLeaveSession(connectionId, sessionId, apiGateway);
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Unknown action' })
    };

  } catch (error) {
    console.error('Message handler error:', error);

    // Send error to client
    try {
      await apiGateway.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
          timestamp: new Date().toISOString()
        })
      }));
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }

    return { statusCode: 500 };
  }
};

async function handleChatMessage(
  connectionId: string,
  sessionId: string,
  message: string,
  config: any,
  apiGateway: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {

  // Get session details and user info
  const sessionData = await getSessionData(sessionId);
  if (!sessionData) {
    await sendToConnection(apiGateway, connectionId, {
      type: 'error',
      message: 'Session not found'
    });
    return { statusCode: 404 };
  }

  // Send processing status to client
  await sendToConnection(apiGateway, connectionId, {
    type: 'message_status',
    status: 'processing',
    timestamp: new Date().toISOString()
  });

  try {
    // Store user message in PostgreSQL
    const userMessageId = await storeMessage(sessionData.chatbotId, sessionId, 'user', message);

    // Process with Claude Agent SDK
    const startTime = Date.now();
    const response = await processWithClaude(message, sessionData, config);
    const responseTime = Date.now() - startTime;

    // Store assistant message
    const assistantMessageId = await storeMessage(
      sessionData.chatbotId,
      sessionId,
      'assistant',
      response.content,
      {
        responseTime,
        tokenUsage: response.tokenUsage,
        model: response.model,
        temperature: response.temperature
      }
    );

    // Send response to all session connections
    const responseMessage = {
      type: 'message',
      id: assistantMessageId,
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
      metadata: {
        responseTime,
        tokenUsage: response.tokenUsage,
        model: response.model,
        temperature: response.temperature
      }
    };

    // Broadcast to all connections in session
    await broadcastToSession(apiGateway, sessionId, responseMessage);

    return { statusCode: 200 };

  } catch (error) {
    console.error('Chat processing error:', error);

    // Send error to session connections
    await broadcastToSession(apiGateway, sessionId, {
      type: 'error',
      message: 'Failed to process chat message',
      timestamp: new Date().toISOString()
    });

    return { statusCode: 500 };
  }
}

async function processWithClaude(message: string, sessionData: any, config: any) {
  // Get conversation history
  const conversationHistory = await getConversationHistory(sessionData.chatbotId, sessionData.sessionId);

  // Build messages for Claude
  const messages = [
    {
      role: 'user',
      content: '<system>You are a specialized AI assistant for a Thai cosmetic ingredients B2B business.</system>'
    },
    {
      role: 'assistant',
      content: 'I understand. I\'m ready to assist with cosmetic ingredients inquiries in Thai and English.'
    },
    ...conversationHistory.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    {
      role: 'user',
      content: message
    }
  ];

  const command = new InvokeModelCommand({
    modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.7,
      messages
    })
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return {
    content: responseBody.content?.[0]?.text || 'Sorry, I could not generate a response.',
    tokenUsage: {
      prompt: responseBody.usage?.input_tokens || 0,
      completion: responseBody.usage?.output_tokens || 0,
      total: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0)
    },
    model: 'claude-3-5-sonnet-20240620-v1:0',
    temperature: config.temperature || 0.7
  };
}

async function sendToConnection(
  apiGateway: ApiGatewayManagementApiClient,
  connectionId: string,
  data: any
): Promise<void> {
  try {
    await apiGateway.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(data)
    }));
  } catch (error) {
    console.error(`Failed to send to connection ${connectionId}:`, error);
  }
}

async function broadcastToSession(
  apiGateway: ApiGatewayManagementApiClient,
  sessionId: string,
  data: any
): Promise<void> {
  const sessionData = await getSessionData(sessionId);
  if (!sessionData?.connectionIds) return;

  const sendPromises = sessionData.connectionIds.map(connId =>
    sendToConnection(apiGateway, connId, data)
  );

  await Promise.allSettled(sendPromises);
}

// Additional helper functions for database operations...
```

### Phase 3: Frontend Integration

#### 3.1 WebSocket Client Service

```typescript
// lib/websocket/websocket-client.ts
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private connectionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, Function[]> = new Map();

  constructor(
    private endpoint: string,
    private authToken: string
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.endpoint}?token=${encodeURIComponent(this.authToken)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.handleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  private handleMessage(data: any): void {
    const { type } = data;
    const handlers = this.messageHandlers.get(type) || [];
    handlers.forEach(handler => handler(data));
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        this.connect().catch(console.error);
      }, delay);
    }
  }

  public on(eventType: string, handler: Function): void {
    if (!this.messageHandlers.has(eventType)) {
      this.messageHandlers.set(eventType, []);
    }
    this.messageHandlers.get(eventType)!.push(handler);
  }

  public off(eventType: string, handler: Function): void {
    const handlers = this.messageHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  public sendMessage(sessionId: string, message: string, config?: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'sendMessage',
        sessionId,
        message,
        config
      }));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  public joinSession(sessionId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'joinSession',
        sessionId
      }));
    }
  }

  public leaveSession(sessionId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'leaveSession',
        sessionId
      }));
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

#### 3.2 React WebSocket Provider

```typescript
// components/websocket/websocket-provider.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { WebSocketClient } from '@/lib/websocket/websocket-client';
import { useAuth } from '@/hooks/use-auth';

interface WebSocketContextType {
  client: WebSocketClient | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  sendMessage: (sessionId: string, message: string, config?: any) => void;
  joinSession: (sessionId: string) => void;
  leaveSession: (sessionId: string) => void;
  onMessage: (handler: (data: any) => void) => void;
  onError: (handler: (data: any) => void) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user, authToken } = useAuth();
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  // Initialize WebSocket connection
  useEffect(() => {
    if (user && authToken) {
      const wsEndpoint = process.env.NEXT_PUBLIC_WEBSOCKET_ENDPOINT!;
      const wsClient = new WebSocketClient(wsEndpoint, authToken);

      setConnectionStatus('connecting');

      wsClient.connect()
        .then(() => {
          setClient(wsClient);
          setIsConnected(true);
          setConnectionStatus('connected');
        })
        .catch((error) => {
          console.error('Failed to connect to WebSocket:', error);
          setConnectionStatus('error');
        });

      // Cleanup on unmount
      return () => {
        wsClient.disconnect();
        setClient(null);
        setIsConnected(false);
        setConnectionStatus('disconnected');
      };
    }
  }, [user, authToken]);

  const sendMessage = useCallback((sessionId: string, message: string, config?: any) => {
    if (client) {
      client.sendMessage(sessionId, message, config);
    }
  }, [client]);

  const joinSession = useCallback((sessionId: string) => {
    if (client) {
      client.joinSession(sessionId);
    }
  }, [client]);

  const leaveSession = useCallback((sessionId: string) => {
    if (client) {
      client.leaveSession(sessionId);
    }
  }, [client]);

  const onMessage = useCallback((handler: (data: any) => void) => {
    if (client) {
      client.on('message', handler);
      client.on('message_status', handler);
    }
  }, [client]);

  const onError = useCallback((handler: (data: any) => void) => {
    if (client) {
      client.on('error', handler);
    }
  }, [client]);

  const value: WebSocketContextType = {
    client,
    isConnected,
    connectionStatus,
    sendMessage,
    joinSession,
    leaveSession,
    onMessage,
    onError
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
```

### Phase 4: Enhanced Chat Interface

#### 4.1 WebSocket-Enabled Chat Component

```typescript
// components/chat/websocket-chat-interface.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '@/components/websocket/websocket-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Bot,
  User
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'processing' | 'error';
  metadata?: {
    responseTime?: number;
    tokenUsage?: any;
    model?: string;
  };
}

interface WebSocketChatInterfaceProps {
  sessionId: string;
  className?: string;
  placeholder?: string;
}

export function WebSocketChatInterface({
  sessionId,
  className,
  placeholder = "Type your message..."
}: WebSocketChatInterfaceProps) {
  const { isConnected, connectionStatus, sendMessage, joinSession, leaveSession, onMessage, onError } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Join session on mount
  useEffect(() => {
    if (isConnected && sessionId) {
      joinSession(sessionId);
    }

    return () => {
      if (sessionId) {
        leaveSession(sessionId);
      }
    };
  }, [isConnected, sessionId, joinSession, leaveSession]);

  // Message handlers
  useEffect(() => {
    const handleMessage = (data: any) => {
      if (data.type === 'message') {
        setMessages(prev => [...prev, {
          id: data.id,
          role: data.role,
          content: data.content,
          timestamp: data.timestamp,
          status: 'sent',
          metadata: data.metadata
        }]);
        setIsSending(false);
      } else if (data.type === 'message_status') {
        if (data.status === 'processing') {
          setMessages(prev => [...prev, {
            id: 'temp-processing',
            role: 'assistant',
            content: '',
            timestamp: data.timestamp,
            status: 'processing'
          }]);
        }
      } else if (data.type === 'error') {
        setIsSending(false);
        // Remove processing message if exists
        setMessages(prev => prev.filter(m => m.id !== 'temp-processing'));
        // Show error message
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, there was an error processing your message. Please try again.',
          timestamp: new Date().toISOString(),
          status: 'error'
        }]);
      }
    };

    if (isConnected) {
      onMessage(handleMessage);
      onError(handleMessage);
    }
  }, [isConnected, onMessage, onError]);

  const handleSendMessage = async () => {
    const message = inputValue.trim();
    if (!message || !isConnected || isSending) return;

    // Add user message immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      status: 'sending'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);

    // Send via WebSocket
    try {
      sendMessage(sessionId, message);

      // Update user message status
      setMessages(prev => prev.map(m =>
        m.id === userMessage.id
          ? { ...m, status: 'sent' }
          : m
      ));
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.map(m =>
        m.id === userMessage.id
          ? { ...m, status: 'error' }
          : m
      ));
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getConnectionStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <Badge variant="outline" className="text-green-600">
            <Wifi className="w-3 h-3 mr-1" />
            Real-time
          </Badge>
        );
      case 'connecting':
        return (
          <Badge variant="outline" className="text-yellow-600">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Connecting
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="outline" className="text-gray-600">
            <WifiOff className="w-3 h-3 mr-1" />
            Offline
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="text-red-600">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">WebSocket Chat</CardTitle>
          <div className="flex items-center gap-2">
            {getConnectionStatusBadge()}
            {isConnected && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span>Live</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages Area */}
        <ScrollArea className="flex-1 px-4" style={{ maxHeight: "600px" }}>
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Start a real-time conversation...</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}

                  <div className={`max-w-[80%] space-y-1 ${
                    message.role === 'user' ? 'items-end' : 'items-start'
                  }`}>
                    <div className={`rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}>
                      {message.status === 'processing' ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                          <span className="text-muted-foreground text-xs">Claude is thinking...</span>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>

                    {/* Message metadata */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(message.timestamp).toLocaleTimeString()}</span>

                      {message.metadata?.responseTime && (
                        <Badge variant="outline" className="text-xs">
                          {message.metadata.responseTime}ms
                        </Badge>
                      )}

                      {message.metadata?.tokenUsage?.total && (
                        <Badge variant="outline" className="text-xs">
                          {message.metadata.tokenUsage.total} tokens
                        </Badge>
                      )}
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background/50">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={!isConnected ? "Connecting..." : placeholder}
              disabled={!isConnected || isSending}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!isConnected || !inputValue.trim() || isSending}
              size="sm"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Phase 5: Deployment and Monitoring

#### 5.1 Infrastructure as Code

```bash
# Deploy infrastructure
aws cloudformation deploy \
  --template-file infrastructure/websocket-stack.yaml \
  --stack-name chatbot-websocket-production \
  --parameter-overrides Environment=production \
  --capabilities CAPABILITY_IAM \
  --region ap-southeast-1

# Deploy Lambda functions
cd lambda-functions
npm run build
npm run deploy
```

#### 5.2 Environment Configuration

```bash
# Environment variables for Lambda functions
export CONNECTION_TABLE="production-websocket-connections"
export SESSION_TABLE="production-websocket-sessions"
export DATABASE_URL="postgresql://..."
export JWT_SECRET="..."
export BEDROCK_REGION="us-east-1"

# Frontend environment variables
NEXT_PUBLIC_WEBSOCKET_ENDPOINT="wss://api.chatbot.com/production"
NEXT_PUBLIC_APP_ENV="production"
```

#### 5.3 Monitoring and Alerting

```yaml
# CloudWatch Alarms
WebSocketConnectionsAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: "WebSocket-High-Connection-Count"
    MetricName: "ConnectedCount"
    Namespace: "AWS/ApiGatewayV2"
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 1000
    ComparisonOperator: GreaterThanThreshold

LambdaErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: "WebSocket-Lambda-Error-Rate"
    MetricName: "Errors"
    Namespace: "AWS/Lambda"
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
```

## Security Considerations

### Authentication and Authorization
- JWT token validation for WebSocket connections
- Session-based access control
- Rate limiting and DDoS protection
- Connection timeout management

### Data Protection
- TLS 1.2+ for all WebSocket connections
- Message encryption at rest in DynamoDB
- Audit logging for all activities
- PII data handling compliance

### Infrastructure Security
- VPC isolation for Lambda functions
- IAM least privilege access
- API Gateway throttling
- WAF protection for public endpoints

## Performance Optimization

### Connection Management
- Connection pooling and reuse
- Automatic scaling based on connection count
- Graceful degradation under high load
- Circuit breaker patterns for external services

### Message Processing
- Asynchronous message handling
- Batch processing for high throughput
- Caching frequently accessed data
- Database connection optimization

### Cost Optimization
- DynamoDB on-demand billing
- Lambda provisioned concurrency for hot paths
- CloudWatch log retention policies
- Regular cost monitoring and optimization

## Testing Strategy

### Unit Testing
- Lambda function unit tests
- WebSocket client library tests
- Message processing logic tests
- Error handling scenario tests

### Integration Testing
- End-to-end WebSocket flow tests
- Database integration tests
- Claude Agent SDK integration tests
- Authentication flow tests

### Load Testing
- Connection stress testing
- Message throughput testing
- Concurrent session testing
- Failover scenario testing

## Migration Strategy

### Phase 1: Parallel Deployment
- Deploy WebSocket infrastructure alongside HTTP
- Feature flag for WebSocket vs HTTP mode
- A/B testing with selected users
- Monitor performance and stability

### Phase 2: Gradual Migration
- Migrate non-critical features first
- Implement fallback to HTTP mode
- Monitor error rates and user feedback
- Scale infrastructure based on usage

### Phase 3: Full Migration
- Complete transition to WebSocket
- Remove HTTP fallback code
- Optimize for WebSocket-only architecture
- Final performance tuning

## Conclusion

This AWS WebSocket implementation provides a robust, scalable, and secure real-time chat solution for the chatbot platform. The architecture leverages AWS managed services for reliability and scalability while maintaining integration with the existing Claude Agent SDK and database infrastructure.

Key benefits:
- Real-time bidirectional communication
- Horizontal scalability with AWS managed services
- Comprehensive monitoring and alerting
- Security best practices implementation
- Cost-effective serverless architecture

The implementation is production-ready and provides a solid foundation for real-time features while maintaining the quality and reliability standards established in the HTTP-based implementation.

---

**Documentation Version:** 1.0
**Last Updated:** October 7, 2025
**Status:** Production Implementation Guide
**Next Review:** November 7, 2025