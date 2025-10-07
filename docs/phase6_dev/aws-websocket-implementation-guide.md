# AWS WebSocket Production Implementation Guide

## Overview

This guide provides a comprehensive approach to implementing WebSocket functionality for production deployment using AWS services. While the current HTTP-based playground implementation provides excellent reliability and debuggability, WebSocket implementation offers real-time capabilities essential for production chatbot interfaces.

## Architecture Overview

### High-Level Architecture

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   Frontend  │    │  AWS API Gateway │    │   Lambda     │    │  DynamoDB   │
│   (Next.js) │◄──►│   WebSocket API  │◄──►│  Functions   │◄──►│ Connection  │
│             │    │                 │    │              │    │   Store     │
└─────────────┘    └─────────────────┘    └──────────────┘    └─────────────┘
                            │                        │
                            ▼                        ▼
                   ┌─────────────────┐    ┌──────────────┐
                   │   CloudWatch    │    │     SQS      │
                   │   Monitoring    │    │   Message    │
                   │                 │    │    Queue     │
                   └─────────────────┘    └──────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────┐
                                          │   Claude     │
                                          │  Agent SDK   │
                                          │  (Bedrock)   │
                                          └──────────────┘
```

### Technology Stack

**AWS Services:**
- **API Gateway WebSocket API:** Real-time connection management
- **Lambda Functions:** Serverless message processing
- **DynamoDB:** Connection state and session management
- **SQS:** Asynchronous message processing queue
- **CloudWatch:** Monitoring and logging
- **IAM:** Security and access control

**Integration Points:**
- **Existing Database:** Neon PostgreSQL for persistent data
- **Authentication:** JWT-based user authentication
- **Claude Agent SDK:** AWS Bedrock for AI processing
- **Frontend:** Next.js client with WebSocket integration

## Implementation Components

### 1. AWS API Gateway WebSocket API

**Configuration:**
```yaml
# serverless.yml or CloudFormation template
Resources:
  ChatbotWebSocketApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: chatbot-websocket-api
      ProtocolType: WEBSOCKET
      RouteSelectionExpression: "$request.body.action"

  ConnectRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref ChatbotWebSocketApi
      RouteKey: $connect
      Target: !Sub "integrations/${ConnectIntegration}"

  DisconnectRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref ChatbotWebSocketApi
      RouteKey: $disconnect
      Target: !Sub "integrations/${DisconnectIntegration}"

  MessageRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref ChatbotWebSocketApi
      RouteKey: sendMessage
      Target: !Sub "integrations/${MessageIntegration}"
```

**Features:**
- **Connection Management:** Automatic connection/disconnection handling
- **Route-based Actions:** Different Lambda functions for different message types
- **Built-in Scaling:** Automatic scaling based on connection count
- **Security Integration:** JWT-based authentication for connections

### 2. Lambda Functions Architecture

#### A. Connection Handler (`onConnect`)

**Purpose:** Handle new WebSocket connections and authentication

```typescript
// src/lambda/onConnect.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { AuthTokenService } from '../lib/auth';

const dynamodb = new DynamoDB.DocumentClient();

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const token = event.queryStringParameters?.token;

  // Authenticate user
  const user = await AuthTokenService.verifySession(token);
  if (!user) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // Store connection in DynamoDB
  await dynamodb.put({
    TableName: 'ChatbotConnections',
    Item: {
      connectionId,
      userId: user.userId,
      connectedAt: new Date().toISOString(),
      status: 'connected'
    }
  }).promise();

  return { statusCode: 200, body: 'Connected' };
};
```

#### B. Disconnection Handler (`onDisconnect`)

**Purpose:** Clean up connection state on disconnection

```typescript
// src/lambda/onDisconnect.ts
export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  // Remove connection from DynamoDB
  await dynamodb.delete({
    TableName: 'ChatbotConnections',
    Key: { connectionId }
  }).promise();

  return { statusCode: 200, body: 'Disconnected' };
};
```

#### C. Message Handler (`onMessage`)

**Purpose:** Process incoming messages and coordinate response generation

```typescript
// src/lambda/onMessage.ts
import { SQS } from 'aws-sdk';

const sqs = new SQS();

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');

  // Validate connection and get user info
  const connection = await getConnection(connectionId);
  if (!connection) {
    return { statusCode: 404, body: 'Connection not found' };
  }

  // Send message to processing queue
  await sqs.sendMessage({
    QueueUrl: process.env.MESSAGE_PROCESSING_QUEUE_URL,
    MessageBody: JSON.stringify({
      connectionId,
      userId: connection.userId,
      message: body.message,
      chatbotId: body.chatbotId,
      sessionId: body.sessionId
    })
  }).promise();

  return { statusCode: 200, body: 'Message queued' };
};
```

#### D. Message Processor (`processMessage`)

**Purpose:** Process messages through Claude Agent SDK and send responses

```typescript
// src/lambda/processMessage.ts
import { SQSHandler } from 'aws-lambda';
import { ApiGatewayManagementApi } from 'aws-sdk';
import { claudeAgentService } from '../lib/agents/claude-agent-service';

export const handler: SQSHandler = async (event) => {
  const apigateway = new ApiGatewayManagementApi({
    endpoint: process.env.WEBSOCKET_API_ENDPOINT
  });

  for (const record of event.Records) {
    const messageData = JSON.parse(record.body);

    try {
      // Send processing indicator
      await sendToConnection(apigateway, messageData.connectionId, {
        type: 'processing',
        messageId: messageData.messageId
      });

      // Process with Claude Agent SDK
      const response = await claudeAgentService.processMessage(
        messageData.message,
        {
          chatbotId: messageData.chatbotId,
          sessionId: messageData.sessionId,
          userId: messageData.userId
        }
      );

      // Send response back through WebSocket
      await sendToConnection(apigateway, messageData.connectionId, {
        type: 'response',
        messageId: messageData.messageId,
        content: response.content,
        metadata: response.metadata
      });

    } catch (error) {
      // Send error response
      await sendToConnection(apigateway, messageData.connectionId, {
        type: 'error',
        messageId: messageData.messageId,
        error: 'Failed to process message'
      });
    }
  }
};

async function sendToConnection(apigateway: ApiGatewayManagementApi, connectionId: string, data: any) {
  try {
    await apigateway.postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify(data)
    }).promise();
  } catch (error) {
    if (error.statusCode === 410) {
      // Connection is stale, remove from database
      await removeStaleConnection(connectionId);
    }
  }
}
```

### 3. DynamoDB Schema Design

#### Connections Table

```typescript
// DynamoDB Table: ChatbotConnections
interface ConnectionRecord {
  connectionId: string;           // Primary Key
  userId: string;                // GSI Key
  chatbotId?: string;            // Optional chatbot context
  sessionId?: string;            // Optional session context
  connectedAt: string;           // ISO timestamp
  lastActivity: string;          // ISO timestamp
  status: 'connected' | 'idle';  // Connection status
  metadata?: {                   // Additional connection data
    userAgent?: string;
    ipAddress?: string;
    region?: string;
  };
}
```

#### Sessions Table

```typescript
// DynamoDB Table: ChatbotWebSocketSessions
interface WebSocketSession {
  sessionId: string;             // Primary Key
  connectionId: string;          // Foreign key to connection
  userId: string;                // User identifier
  chatbotId: string;             // Chatbot identifier
  configuration: {               // Session configuration
    temperature?: number;
    maxTokens?: number;
    language?: string;
  };
  messageCount: number;          // Number of messages in session
  createdAt: string;             // ISO timestamp
  lastMessageAt: string;         // ISO timestamp
  status: 'active' | 'inactive'; // Session status
}
```

### 4. SQS Message Processing

**Queue Configuration:**
```yaml
MessageProcessingQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: chatbot-message-processing
    VisibilityTimeoutSeconds: 60
    MessageRetentionPeriod: 1209600  # 14 days
    ReceiveMessageWaitTimeSeconds: 20  # Long polling
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt DeadLetterQueue.Arn
      maxReceiveCount: 3
```

**Benefits:**
- **Asynchronous Processing:** Decouples message receiving from processing
- **Scalability:** Handles message bursts without blocking connections
- **Reliability:** Dead letter queue for failed message handling
- **Cost Optimization:** Processes messages in batches for efficiency

### 5. Frontend WebSocket Integration

#### WebSocket Client Implementation

```typescript
// lib/websocket/client.ts
export class ChatbotWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(
    private token: string,
    private onMessage: (data: any) => void,
    private onError: (error: any) => void
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}?token=${this.token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      };

      this.ws.onclose = () => {
        this.handleReconnect();
      };

      this.ws.onerror = (error) => {
        this.onError(error);
        reject(error);
      };
    });
  }

  sendMessage(message: string, chatbotId: string, sessionId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'sendMessage',
        message,
        chatbotId,
        sessionId,
        messageId: generateMessageId()
      }));
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

#### React Hook Integration

```typescript
// hooks/useWebSocket.ts
import { useEffect, useState } from 'react';
import { ChatbotWebSocketClient } from '@/lib/websocket/client';

export function useWebSocket(token: string) {
  const [client, setClient] = useState<ChatbotWebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    const wsClient = new ChatbotWebSocketClient(
      token,
      (data) => {
        if (data.type === 'response') {
          setMessages(prev => [...prev, {
            id: data.messageId,
            content: data.content,
            role: 'assistant',
            metadata: data.metadata,
            timestamp: new Date().toISOString()
          }]);
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      }
    );

    wsClient.connect().then(() => {
      setConnected(true);
      setClient(wsClient);
    });

    return () => {
      wsClient.disconnect();
    };
  }, [token]);

  const sendMessage = (message: string, chatbotId: string, sessionId: string) => {
    client?.sendMessage(message, chatbotId, sessionId);

    // Add user message immediately
    setMessages(prev => [...prev, {
      id: generateMessageId(),
      content: message,
      role: 'user',
      timestamp: new Date().toISOString()
    }]);
  };

  return { connected, messages, sendMessage };
}
```

## Security Implementation

### 1. Authentication and Authorization

**JWT Token Validation:**
```typescript
// Lambda authorizer for WebSocket connections
export const handler = async (event: any) => {
  const token = event.queryStringParameters?.token;

  try {
    const user = await AuthTokenService.verifySession(token);
    if (!user) {
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    return generatePolicy(user.userId, 'Allow', event.methodArn, {
      userId: user.userId,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};
```

### 2. Connection Security

**Features:**
- **Origin Validation:** Verify request origin to prevent CSRF
- **Rate Limiting:** Implement connection limits per user/IP
- **Session Timeout:** Automatic disconnection for idle connections
- **Data Encryption:** TLS/SSL encryption for all WebSocket traffic

### 3. IAM Policies

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:region:account:table/ChatbotConnections",
        "arn:aws:dynamodb:region:account:table/ChatbotWebSocketSessions"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage"
      ],
      "Resource": "arn:aws:sqs:region:account:chatbot-message-processing"
    },
    {
      "Effect": "Allow",
      "Action": [
        "execute-api:ManageConnections"
      ],
      "Resource": "arn:aws:execute-api:region:account:api-id/stage/POST/@connections/*"
    }
  ]
}
```

## Monitoring and Observability

### 1. CloudWatch Metrics

**Custom Metrics:**
```typescript
// Custom metrics for monitoring
const cloudwatch = new CloudWatch();

await cloudwatch.putMetricData({
  Namespace: 'ChatbotWebSocket',
  MetricData: [
    {
      MetricName: 'ActiveConnections',
      Value: connectionCount,
      Unit: 'Count'
    },
    {
      MetricName: 'MessageProcessingTime',
      Value: processingTime,
      Unit: 'Milliseconds'
    },
    {
      MetricName: 'FailedMessages',
      Value: 1,
      Unit: 'Count'
    }
  ]
}).promise();
```

### 2. Logging Strategy

**Structured Logging:**
```typescript
const logger = {
  info: (message: string, data?: any) => {
    console.log(JSON.stringify({
      level: 'INFO',
      message,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },
  error: (message: string, error?: any) => {
    console.error(JSON.stringify({
      level: 'ERROR',
      message,
      error: error?.message || error,
      stack: error?.stack,
      timestamp: new Date().toISOString()
    }));
  }
};
```

### 3. Alerting

**CloudWatch Alarms:**
```yaml
HighErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: ChatbotWebSocket-HighErrorRate
    MetricName: Errors
    Namespace: AWS/Lambda
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref SNSNotificationTopic
```

## Deployment Strategy

### 1. Infrastructure as Code

**Serverless Framework Configuration:**
```yaml
# serverless.yml
service: chatbot-websocket-api

provider:
  name: aws
  runtime: nodejs18.x
  region: ap-southeast-1
  environment:
    CONNECTIONS_TABLE: ${self:service}-connections-${self:provider.stage}
    SESSIONS_TABLE: ${self:service}-sessions-${self:provider.stage}
    MESSAGE_QUEUE_URL: !Ref MessageProcessingQueue

functions:
  connectHandler:
    handler: src/lambda/onConnect.handler
    events:
      - websocket:
          route: $connect

  disconnectHandler:
    handler: src/lambda/onDisconnect.handler
    events:
      - websocket:
          route: $disconnect

  messageHandler:
    handler: src/lambda/onMessage.handler
    events:
      - websocket:
          route: sendMessage

  messageProcessor:
    handler: src/lambda/processMessage.handler
    events:
      - sqs:
          arn: !GetAtt MessageProcessingQueue.Arn
          batchSize: 10

resources:
  Resources:
    ConnectionsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:provider.environment.CONNECTIONS_TABLE}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: connectionId
            AttributeType: S
        KeySchema:
          - AttributeName: connectionId
            KeyType: HASH
```

### 2. CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
name: Deploy WebSocket API

on:
  push:
    branches: [main]
    paths: ['src/websocket/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Deploy to AWS
        run: npx serverless deploy --stage production
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### 3. Environment Configuration

**Production Settings:**
```bash
# .env.production
WEBSOCKET_API_ENDPOINT=wss://api-id.execute-api.region.amazonaws.com/production
CONNECTIONS_TABLE=chatbot-connections-production
SESSIONS_TABLE=chatbot-sessions-production
MESSAGE_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name

# Database configuration (existing Neon setup)
DATABASE_URL=postgresql://connection-string

# AWS configuration
AWS_REGION=ap-southeast-1
BEDROCK_REGION=us-east-1
```

## Performance Optimization

### 1. Connection Management

**Best Practices:**
- **Connection Pooling:** Reuse database connections across Lambda invocations
- **Idle Timeout:** Automatically disconnect idle connections after 30 minutes
- **Heartbeat Protocol:** Periodic ping/pong to detect stale connections
- **Graceful Degradation:** Fallback to HTTP API if WebSocket fails

### 2. Message Processing

**Optimization Strategies:**
- **Batch Processing:** Process multiple messages together for efficiency
- **Caching:** Cache frequently accessed data in Redis/ElastiCache
- **Asynchronous Processing:** Use SQS for non-blocking message handling
- **Auto-scaling:** Lambda concurrency limits based on load

### 3. Cost Optimization

**Cost Management:**
- **On-Demand Pricing:** DynamoDB and Lambda scale with usage
- **Reserved Capacity:** Pre-purchase capacity for predictable workloads
- **Data Lifecycle:** Automatic cleanup of old connection and session data
- **Monitoring:** Regular cost analysis and optimization

## Testing Strategy

### 1. Unit Testing

```typescript
// tests/lambda/onConnect.test.ts
import { handler } from '../../src/lambda/onConnect';

describe('onConnect handler', () => {
  it('should authenticate and store connection', async () => {
    const event = {
      requestContext: { connectionId: 'test-connection' },
      queryStringParameters: { token: 'valid-jwt-token' }
    };

    const result = await handler(event, {} as any, {} as any);
    expect(result.statusCode).toBe(200);
  });
});
```

### 2. Integration Testing

```typescript
// tests/integration/websocket.test.ts
import WebSocket from 'ws';

describe('WebSocket Integration', () => {
  it('should connect and send messages', async () => {
    const ws = new WebSocket(`${process.env.WEBSOCKET_URL}?token=${validToken}`);

    await new Promise(resolve => ws.on('open', resolve));

    ws.send(JSON.stringify({
      action: 'sendMessage',
      message: 'Hello',
      chatbotId: 'test-chatbot',
      sessionId: 'test-session'
    }));

    const response = await new Promise(resolve => {
      ws.on('message', data => resolve(JSON.parse(data.toString())));
    });

    expect(response.type).toBe('response');
    expect(response.content).toBeDefined();
  });
});
```

### 3. Load Testing

```javascript
// Load testing with Artillery
config:
  target: wss://api-id.execute-api.region.amazonaws.com/production
  phases:
    - duration: 300
      arrivalRate: 10
  ws:
    query:
      token: "{{ $processEnvironment.TEST_TOKEN }}"

scenarios:
  - name: "WebSocket Chat Session"
    weight: 100
    engine: ws
    beforeRequest: "setJWTToken"
    steps:
      - send:
          payload:
            action: "sendMessage"
            message: "Hello from load test"
            chatbotId: "{{ chatbotId }}"
            sessionId: "{{ sessionId }}"
      - think: 1
```

## Migration Strategy

### 1. Phased Rollout

**Phase 1: Infrastructure Setup**
- Deploy AWS WebSocket API and Lambda functions
- Set up DynamoDB tables and SQS queues
- Configure monitoring and alerting

**Phase 2: Parallel Implementation**
- Implement WebSocket client alongside existing HTTP implementation
- Feature flag to switch between HTTP and WebSocket modes
- A/B testing with small percentage of users

**Phase 3: Gradual Migration**
- Increase WebSocket traffic percentage gradually
- Monitor performance and error rates
- Keep HTTP fallback available

**Phase 4: Full Deployment**
- Complete migration to WebSocket for all users
- Remove HTTP fallback (optional)
- Optimize performance based on production data

### 2. Rollback Strategy

**Automated Rollback Triggers:**
- Error rate > 5% for 5 minutes
- Response time > 2 seconds for 10 minutes
- Connection failure rate > 10%

**Rollback Process:**
1. Switch traffic back to HTTP implementation
2. Disable WebSocket Lambda functions
3. Investigate and fix issues
4. Re-deploy with fixes
5. Gradual re-enablement

## Maintenance and Operations

### 1. Routine Maintenance

**Daily Tasks:**
- Monitor connection counts and performance metrics
- Review error logs for anomalies
- Check SQS queue depths and processing rates

**Weekly Tasks:**
- Analyze cost metrics and optimize resources
- Review and update security policies
- Performance testing and capacity planning

**Monthly Tasks:**
- Update dependencies and security patches
- Review and optimize DynamoDB table performance
- Disaster recovery testing

### 2. Troubleshooting Guide

**Common Issues:**

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| High Latency | Response times > 2s | Check Lambda cold starts, optimize code |
| Connection Drops | Frequent reconnections | Review idle timeout, check network stability |
| Message Loss | Missing responses | Check SQS DLQ, verify Lambda error handling |
| Auth Failures | 401 errors on connect | Verify JWT token validity and expiration |

### 3. Scaling Considerations

**Horizontal Scaling:**
- Lambda functions scale automatically to 1000 concurrent executions
- DynamoDB auto-scaling based on read/write capacity
- SQS handles unlimited message throughput

**Vertical Scaling:**
- Increase Lambda memory allocation for complex processing
- Use DynamoDB provisioned capacity for predictable workloads
- Implement Redis caching for frequently accessed data

## Conclusion

This comprehensive AWS WebSocket implementation guide provides a production-ready architecture for real-time chatbot functionality. The solution offers:

**Key Benefits:**
- **Real-time Communication:** Instant message delivery and response
- **High Scalability:** Serverless architecture handles thousands of concurrent connections
- **Cost Efficiency:** Pay-per-use pricing model with automatic scaling
- **Reliability:** Built-in failover and retry mechanisms
- **Security:** Comprehensive authentication and authorization
- **Observability:** Full monitoring and alerting capabilities

**Implementation Timeline:**
- **Phase 1 (Week 1-2):** Infrastructure setup and basic Lambda functions
- **Phase 2 (Week 3-4):** Frontend integration and testing
- **Phase 3 (Week 5-6):** Performance optimization and security hardening
- **Phase 4 (Week 7-8):** Production deployment and monitoring setup

**Next Steps:**
1. Review and approve architecture design
2. Set up AWS infrastructure using provided CloudFormation/Serverless templates
3. Implement and test Lambda functions with existing Claude Agent SDK
4. Integrate WebSocket client with current Next.js frontend
5. Conduct load testing and performance optimization
6. Deploy to production with gradual rollout strategy

This implementation builds upon the successful HTTP-based playground foundation while providing the real-time capabilities required for production chatbot interfaces.

---

**Architecture Team:** Claude Code AI Assistant
**Document Version:** 1.0
**Last Updated:** October 7, 2025
**Status:** Ready for Implementation