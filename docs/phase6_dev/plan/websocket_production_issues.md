# WebSocket Production Deployment Issues Report

**Report Date:** October 7, 2025
**Phase:** 6 Development
**Priority:** Critical - Production Blocker

## Executive Summary

The current WebSocket implementation contains multiple critical issues that prevent successful deployment to production environments, specifically AWS Amplify. These issues center around hard-coded development configurations, missing environment-based settings, and architectural choices that are incompatible with serverless deployment models.

## Current WebSocket Architecture

### Development Setup
- **WebSocket Server:** Custom Node.js HTTP server running on port 3001
- **Client Configuration:** Hard-coded development URLs with localhost assumptions
- **Integration:** Next.js instrumentation.ts initializes WebSocket server in development
- **Authentication:** JWT token-based auth middleware with rate limiting

### File Structure
```
lib/websocket/
├── dev-server.ts           # Development WebSocket server (port 3001)
├── client.ts               # WebSocket client with hard-coded development logic
├── auth-middleware.ts      # Authentication and security middleware
├── connection-manager.ts   # Connection state management
├── message-broker.ts       # Message routing and processing
└── message-types.ts        # WebSocket message schemas
```

## Critical Production Issues

### 1. Hard-Coded Port Configuration ⚠️ **CRITICAL**

**Problem:**
- WebSocket server is hard-coded to port 3001 in development
- Production environments (AWS Amplify) don't provide access to custom ports
- Client assumes port 3001 is available for WebSocket connections

**Code Locations:**
- `lib/websocket/dev-server.ts:97` - `const WS_PORT = 3001;`
- `lib/websocket/client.ts:391` - `const wsPort = isDevelopment ? '3001' : window.location.port;`

**Impact:** WebSocket connections will fail in production environments where port 3001 is not available.

### 2. Development-Specific URL Logic ⚠️ **CRITICAL**

**Problem:**
- Client has hard-coded development detection logic
- Assumes localhost and specific port configurations
- No proper environment-based URL construction

**Code Example:**
```typescript
// lib/websocket/client.ts:390-395
const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
const wsPort = isDevelopment ? '3001' : window.location.port;
const wsHost = isDevelopment ? 'localhost' : window.location.hostname;

const config: WebSocketClientConfig = {
  url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${wsHost}:${wsPort}/api/ws`,
```

**Impact:** Production deployments will attempt to connect to incorrect WebSocket URLs.

### 3. Serverless Architecture Incompatibility ⚠️ **HIGH**

**Problem:**
- Current implementation uses a persistent Node.js HTTP server
- AWS Amplify uses serverless functions that don't support persistent connections
- WebSocket upgrade handling is not compatible with AWS Lambda runtime

**Impact:** The entire WebSocket server architecture needs redesign for serverless deployment.

### 4. Missing Environment Configuration ⚠️ **HIGH**

**Problem:**
- No environment variables for WebSocket configuration
- Hard-coded security settings for development
- Missing production-specific timeout and connection limits

**Missing Environment Variables:**
```bash
# Required for production
WEBSOCKET_URL=
WEBSOCKET_SECURE=
WEBSOCKET_MAX_CONNECTIONS=
WEBSOCKET_TIMEOUT=
WEBSOCKET_HEARTBEAT_INTERVAL=
```

### 5. CORS and Security Configuration ⚠️ **MEDIUM**

**Problem:**
- Security configuration includes development URLs
- Missing proper CORS handling for production domains
- Hard-coded allowed origins in `auth-middleware.ts:280-284`

**Code Example:**
```typescript
// lib/websocket/auth-middleware.ts:280-284
allowedOrigins: [
  'http://localhost:3000',
  'https://master.d8z7xlyl8bjeg.amplifyapp.com',
  process.env.NEXT_PUBLIC_APP_URL
].filter(Boolean) as string[]
```

## Production Architecture Recommendations

### Option 1: AWS API Gateway WebSocket API (Recommended)

**Architecture:**
```
Client → AWS API Gateway WebSocket → Lambda Functions → DynamoDB
```

**Benefits:**
- Native AWS serverless WebSocket support
- Automatic scaling and connection management
- Built-in authentication and authorization
- No port configuration required

**Implementation Changes:**
1. Replace custom WebSocket server with AWS API Gateway WebSocket API
2. Convert message handlers to individual Lambda functions
3. Use DynamoDB for connection state management
4. Update client to connect to API Gateway WebSocket URL

### Option 2: Server-Sent Events (SSE) Alternative

**Architecture:**
```
Client → Next.js API Routes → Server-Sent Events → Database Polling
```

**Benefits:**
- Compatible with serverless architecture
- Simpler implementation than WebSocket
- Native browser support
- Works with existing Next.js API routes

**Implementation Changes:**
1. Replace WebSocket with Server-Sent Events
2. Use API routes for bi-directional communication
3. Implement polling mechanism for real-time updates
4. Maintain existing authentication middleware

## Immediate Action Items

### 1. Environment Configuration (Priority: Critical)

Create environment-based WebSocket URL configuration:

```typescript
// lib/websocket/config.ts
export const getWebSocketConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    return {
      url: 'ws://localhost:3001/api/ws',
      secure: false
    };
  }

  if (isProduction) {
    return {
      url: process.env.WEBSOCKET_URL || `wss://${window.location.host}/api/ws`,
      secure: true
    };
  }

  // Fallback for other environments
  return {
    url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws`,
    secure: window.location.protocol === 'https:'
  };
};
```

### 2. Production WebSocket URL Strategy (Priority: Critical)

**Option A: AWS API Gateway WebSocket**
```bash
# Production environment variables
WEBSOCKET_URL=wss://your-api-gateway-url.execute-api.region.amazonaws.com/stage
WEBSOCKET_SECURE=true
```

**Option B: SSE Fallback**
```bash
# Use existing Next.js API routes
REALTIME_API_URL=https://your-domain.com/api/realtime
```

### 3. Client Configuration Update (Priority: High)

Update WebSocket client to use environment-based configuration:

```typescript
// lib/websocket/client.ts - Updated createWebSocketClient function
export function createWebSocketClient(
  token: string,
  events: WebSocketClientEvents = {},
  userId?: string
): WebSocketClient {
  const wsConfig = getWebSocketConfig();

  const config: WebSocketClientConfig = {
    url: wsConfig.url,
    token,
    userId,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 1000,
    heartbeatInterval: 30000
  };

  return new WebSocketClient(config, events);
}
```

## Testing Strategy

### Development Testing
1. Maintain current localhost:3001 WebSocket server for development
2. Add environment variable override capability
3. Test both development and production URL configurations

### Production Testing
1. Deploy to AWS Amplify staging environment
2. Test WebSocket connection attempts and error handling
3. Validate fallback mechanisms when WebSocket is unavailable
4. Monitor connection success rates and error patterns

### Load Testing
1. Test connection limits in production environment
2. Validate auto-scaling behavior with AWS API Gateway
3. Monitor latency and connection stability under load

## Migration Timeline

### Phase 1: Configuration Fixes (Week 1)
- [ ] Add environment-based WebSocket URL configuration
- [ ] Update client connection logic
- [ ] Test development environment compatibility
- [ ] Update CORS and security settings

### Phase 2: Production Architecture (Week 2-3)
- [ ] Implement AWS API Gateway WebSocket API
- [ ] Convert message handlers to Lambda functions
- [ ] Set up DynamoDB connection state management
- [ ] Deploy and test in staging environment

### Phase 3: Fallback Implementation (Week 4)
- [ ] Implement Server-Sent Events fallback
- [ ] Add graceful degradation for unsupported environments
- [ ] Comprehensive production testing
- [ ] Performance optimization

## Risk Assessment

### High Risk
- **Complete WebSocket failure in production** - Current architecture will not work
- **User experience degradation** - Real-time features will be unavailable
- **Development workflow disruption** - Changes may affect local development

### Medium Risk
- **Migration complexity** - Moving to AWS API Gateway requires significant changes
- **Testing coverage** - Ensuring all WebSocket functionality works in new architecture
- **Performance impact** - Potential latency changes with serverless architecture

### Mitigation Strategies
1. **Incremental deployment** - Test changes in staging before production
2. **Feature flags** - Ability to disable WebSocket features if issues arise
3. **Monitoring and alerting** - Track WebSocket connection success rates
4. **Rollback plan** - Ability to revert to synchronous updates if needed

## Conclusion

The current WebSocket implementation has critical production deployment blockers that must be addressed before AWS Amplify deployment. The recommended approach is to migrate to AWS API Gateway WebSocket API for production while maintaining the current development setup.

**Immediate next steps:**
1. Implement environment-based configuration
2. Update client connection logic
3. Begin AWS API Gateway WebSocket API implementation
4. Establish comprehensive testing strategy

**Success criteria:**
- WebSocket connections work in both development and production
- Real-time chat functionality is maintained
- Connection management is reliable and scalable
- Graceful fallback when WebSocket is unavailable

---

**Report prepared by:** Claude Code
**Technical review required by:** Development Team Lead
**Implementation timeline:** 4 weeks
**Next review date:** October 14, 2025