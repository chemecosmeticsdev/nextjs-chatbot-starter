# WebSocket Production Deployment Guide

## Overview

This document outlines the WebSocket configuration and deployment strategy for production environments, particularly for AWS Amplify deployments.

## Current Status ✅ **FIXED**

### Development Environment
- **Status**: ✅ **Working**
- **WebSocket Server**: `ws://localhost:3001/api/ws`
- **Connection Handling**: Enhanced duplicate upgrade handler protection
- **Authentication**: JWT token-based with rate limiting

### Production Environment Requirements
- **Status**: ⚠️ **Requires AWS API Gateway WebSocket API**
- **Current Blocker**: Node.js HTTP server incompatible with serverless deployment
- **Solution**: AWS API Gateway WebSocket API implementation

## Fixed Issues ✅

### 1. WebSocket Module Import Error
- **Problem**: `Module not found: Can't resolve './lib/websocket/dev-server'`
- **Solution**: Changed relative import to absolute import using @/ alias
- **File**: `instrumentation.ts:15`
- **Status**: ✅ **Fixed**

### 2. Production URL Construction
- **Problem**: Invalid URLs like `wss://domain.com:/api/ws` in production
- **Solution**: Environment-aware URL construction with fallback logic
- **File**: `lib/websocket/client.ts:389-429`
- **Status**: ✅ **Fixed**

### 3. Duplicate Upgrade Handler Race Condition
- **Problem**: `server.handleUpgrade() was called more than once with the same socket`
- **Solution**: Enhanced deduplication with timeout cleanup and proper handler management
- **File**: `lib/websocket/dev-server.ts:54-137`
- **Status**: ✅ **Fixed**

## Environment Configuration

### Development (.env.local)
```bash
# WebSocket automatically uses ws://localhost:3001/api/ws
NODE_ENV=development
```

### Production Environment Variables
```bash
# Set this in your production environment (AWS Amplify, Vercel, etc.)
NEXT_PUBLIC_WS_URL=wss://your-websocket-endpoint.com/api/ws

# Example for AWS API Gateway WebSocket API:
NEXT_PUBLIC_WS_URL=wss://your-api-id.execute-api.region.amazonaws.com/production

# Example for custom domain:
NEXT_PUBLIC_WS_URL=wss://ws.yourdomain.com/api/ws
```

## AWS API Gateway WebSocket API Implementation Plan

### Architecture Overview
```
Client Browser
    ↓ WebSocket Connection
AWS API Gateway WebSocket API
    ↓ Lambda Integration
AWS Lambda Functions
    ↓ Database/Queue Operations
Neon PostgreSQL + AWS SQS
```

### Required AWS Resources

#### 1. API Gateway WebSocket API
```typescript
// CDK/CloudFormation Template
const webSocketApi = new WebSocketApi(this, 'ChatbotWebSocketApi', {
  apiName: 'chatbot-websocket-api',
  description: 'WebSocket API for real-time chat functionality',
  routeSelectionExpression: '$request.body.action',
});

// Routes
const connectRoute = new WebSocketRoute(this, 'ConnectRoute', {
  webSocketApi,
  routeKey: '$connect',
  integration: new WebSocketLambdaIntegration('ConnectIntegration', connectLambda),
});

const disconnectRoute = new WebSocketRoute(this, 'DisconnectRoute', {
  webSocketApi,
  routeKey: '$disconnect',
  integration: new WebSocketLambdaIntegration('DisconnectIntegration', disconnectLambda),
});

const defaultRoute = new WebSocketRoute(this, 'DefaultRoute', {
  webSocketApi,
  routeKey: '$default',
  integration: new WebSocketLambdaIntegration('DefaultIntegration', messageLambda),
});
```

#### 2. Lambda Functions

**Connection Handler (`connect-lambda`)**
```typescript
// Handles $connect route
// - Authenticate JWT token
// - Store connection ID in database
// - Return success/failure
```

**Disconnect Handler (`disconnect-lambda`)**
```typescript
// Handles $disconnect route
// - Clean up connection from database
// - Update user presence
```

**Message Handler (`message-lambda`)**
```typescript
// Handles $default route (all messages)
// - Parse message type
// - Route to appropriate handler
// - Send responses via API Gateway Management API
```

#### 3. DynamoDB Table (Optional)
```typescript
// For connection management (alternative to PostgreSQL)
const connectionsTable = new Table(this, 'WebSocketConnections', {
  tableName: 'websocket-connections',
  partitionKey: { name: 'connectionId', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});
```

### Migration Steps

#### Phase 1: Infrastructure Setup (1-2 weeks)
1. Create AWS API Gateway WebSocket API
2. Implement Lambda functions for connection management
3. Update database schema for connection tracking
4. Configure IAM roles and permissions

#### Phase 2: Integration (1 week)
1. Update client WebSocket URL configuration
2. Implement API Gateway Management API for message sending
3. Migrate authentication flow to Lambda
4. Update message routing logic

#### Phase 3: Testing & Deployment (1 week)
1. Test WebSocket connections in staging environment
2. Load testing with multiple concurrent connections
3. Validate message delivery and error handling
4. Production deployment with DNS configuration

## Client Configuration

### WebSocket Client URL Resolution
```typescript
// lib/websocket/client.ts - Current Implementation
if (isDevelopment) {
  wsUrl = `ws://localhost:3001/api/ws`;
} else {
  const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || window.location.origin;
  wsUrl = `${wsProtocol}//${wsHost}/api/ws`;
}
```

### Connection Flow
1. **Development**: Direct connection to Node.js HTTP server on port 3001
2. **Production**: Connection to AWS API Gateway WebSocket API
3. **Authentication**: JWT token passed as query parameter
4. **Fallback**: Graceful degradation to REST API polling if WebSocket fails

## Security Considerations

### Authentication
- JWT token validation in Lambda authorizer
- Connection-level rate limiting
- User session management

### Authorization
- User role-based message filtering
- Room-based access control
- Admin privilege validation

### Network Security
- WSS (WebSocket Secure) in production
- CORS configuration for WebSocket origins
- DDoS protection via AWS Shield

## Monitoring & Observability

### CloudWatch Metrics
- Connection count
- Message throughput
- Lambda execution duration
- Error rates

### Logging
- Connection events (connect/disconnect)
- Message routing and delivery
- Authentication failures
- Error tracking

### Alarms
- High error rates
- Connection limit approaching
- Lambda timeout issues
- Database connection failures

## Cost Optimization

### API Gateway WebSocket API Pricing
- $1.00 per million connection minutes
- $0.25 per million messages
- No data transfer charges within AWS

### Lambda Pricing
- Pay per request and execution time
- Provisioned concurrency for low latency (optional)

### Estimated Monthly Costs (1000 concurrent users)
- API Gateway: ~$720/month (connection minutes)
- Lambda: ~$50/month (execution time)
- Data transfer: Minimal within AWS
- **Total: ~$770/month**

## Fallback Strategy

### REST API Polling (Backup)
```typescript
// Implement as fallback when WebSocket unavailable
const pollInterval = setInterval(async () => {
  const messages = await fetch('/api/v1/messages/poll', {
    headers: { Authorization: `Bearer ${token}` }
  });
  // Process messages
}, 5000);
```

### Progressive Enhancement
1. Attempt WebSocket connection
2. Fall back to Server-Sent Events (SSE)
3. Final fallback to REST API polling

## Testing Strategy

### Development Testing
- Local WebSocket server testing ✅
- Connection stability testing ✅
- Message delivery validation ✅

### Production Testing
- AWS API Gateway WebSocket API integration
- Load testing with Artillery or similar tools
- Cross-browser compatibility testing
- Mobile device testing

## Deployment Checklist

### Pre-Deployment
- [ ] AWS API Gateway WebSocket API configured
- [ ] Lambda functions deployed and tested
- [ ] Database migration for connection tracking
- [ ] Environment variables configured
- [ ] DNS/SSL certificates for custom domain

### Deployment
- [ ] Update NEXT_PUBLIC_WS_URL environment variable
- [ ] Deploy to staging environment
- [ ] Run integration tests
- [ ] Monitor connection metrics
- [ ] Deploy to production

### Post-Deployment
- [ ] Monitor CloudWatch metrics
- [ ] Validate connection stability
- [ ] Check message delivery rates
- [ ] Test failover scenarios
- [ ] Performance optimization

## Known Limitations

### Current Development Server
- Not suitable for production deployment
- Hard-coded port 3001
- Single server instance limitation
- No horizontal scaling capability

### Production Requirements
- Serverless architecture compatibility
- Horizontal scaling support
- Global availability
- Enterprise-grade reliability

## Next Steps

1. **Immediate**: Complete current development testing
2. **Short-term**: Begin AWS API Gateway WebSocket API implementation
3. **Medium-term**: Full production deployment with monitoring
4. **Long-term**: Performance optimization and feature enhancement

---

**Last Updated**: October 7, 2025
**Status**: Development fixes complete, production implementation pending
**Priority**: High - Required for production deployment