# API Handler Migration Guide

This guide shows how to migrate existing API routes to use the new unified API handler system.

## Benefits of the New System

- **Standardized Error Handling**: Consistent error responses across all endpoints
- **Built-in Validation**: Automatic request/response validation with Zod schemas
- **Caching Support**: Integrated Redis caching with TTL management
- **Rate Limiting**: Configurable rate limiting per endpoint
- **Authentication**: Centralized auth middleware
- **Performance Monitoring**: Request timing and metrics
- **Type Safety**: Full TypeScript support with validated types

## Basic Migration Pattern

### Before (Old Pattern)
```typescript
// app/api/chatbots/[chatbotId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatbots } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  try {
    // Manual validation
    if (!params.chatbotId || !/^[0-9a-f-]{36}$/.test(params.chatbotId)) {
      return NextResponse.json(
        { error: 'Invalid chatbot ID' },
        { status: 400 }
      );
    }

    // Manual auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Database query
    const chatbot = await db
      .select()
      .from(chatbots)
      .where(eq(chatbots.id, params.chatbotId))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json(
        { error: 'Chatbot not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ chatbot: chatbot[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### After (New Pattern)
```typescript
// app/api/chatbots/[chatbotId]/route.ts
import { NextRequest } from 'next/server';
import { getChatbotHandler } from '@/lib/api/examples/chatbot-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  return getChatbotHandler.handle(request, params);
}
```

## Step-by-Step Migration

### 1. Create Handler Definition

Create a new handler using the `createApiHandler` function:

```typescript
// lib/api/handlers/my-handler.ts
import { createApiHandler, CommonSchemas, ErrorCodes, ApiError } from '../handler';
import { z } from 'zod';

export const myHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(20),
      }),
    },
    auth: { required: true },
    cache: { ttl: 300 },
    rateLimit: { windowMs: 60000, max: 100 },
  },
  async (request, context) => {
    // Your business logic here
    const { chatbotId } = context.validatedParams;
    const { page, limit } = context.validatedQuery;

    // Use validated data - no manual validation needed
    // Auth is handled automatically
    // Errors are caught and formatted consistently

    return { data: 'your response' };
  }
);
```

### 2. Update Route File

Replace the route implementation:

```typescript
// app/api/my-endpoint/route.ts
import { NextRequest } from 'next/server';
import { myHandler } from '@/lib/api/handlers/my-handler';

export async function GET(request: NextRequest) {
  return myHandler.handle(request);
}

// For parameterized routes
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return myHandler.handle(request, params);
}
```

### 3. Remove Manual Error Handling

The new system handles these automatically:
- ❌ Remove try/catch blocks
- ❌ Remove manual validation
- ❌ Remove manual auth checks
- ❌ Remove manual error responses
- ❌ Remove manual rate limiting

## Common Migration Patterns

### Validation Migration

**Before:**
```typescript
// Manual validation
const body = await request.json();
if (!body.name || body.name.length < 1) {
  return NextResponse.json({ error: 'Name is required' }, { status: 400 });
}
if (body.email && !/\S+@\S+\.\S+/.test(body.email)) {
  return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
}
```

**After:**
```typescript
// Automatic validation with Zod
validation: {
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email().optional(),
  }),
}

// In handler function
const { name, email } = context.validatedBody; // Already validated!
```

### Error Handling Migration

**Before:**
```typescript
try {
  const result = await someOperation();
  return NextResponse.json({ data: result });
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}
```

**After:**
```typescript
// Just throw standardized errors
const result = await someOperation();
if (!result) {
  throw new ApiError(ErrorCodes.NOT_FOUND, 'Resource not found');
}
return { data: result }; // Success responses are handled automatically
```

### Pagination Migration

**Before:**
```typescript
const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');

if (page < 1 || limit < 1 || limit > 100) {
  return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 });
}

const offset = (page - 1) * limit;
// Database query with offset/limit
```

**After:**
```typescript
validation: {
  query: CommonSchemas.pagination, // Handles page/limit validation
}

// In handler
const { page, limit } = context.validatedQuery;
const offset = (page - 1) * limit; // Pre-validated
```

## Configuration Options

### Authentication
```typescript
auth: {
  required: true,           // Require auth for this endpoint
  roles: ['admin', 'user'], // Optional role-based access
}
```

### Caching
```typescript
cache: {
  ttl: 300,                 // Cache for 5 minutes
  keyGenerator: (req, ctx) => `custom:${ctx.params.id}:${ctx.userId}`,
}
```

### Rate Limiting
```typescript
rateLimit: {
  windowMs: 60000,          // 1 minute window
  max: 100,                 // 100 requests per window
  keyGenerator: (req) => req.headers.get('x-api-key'), // Custom key
}
```

### Validation Schemas
```typescript
validation: {
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    search: z.string().min(1).optional(),
    sortBy: z.enum(['name', 'date']).default('name'),
  }),
  body: z.object({
    name: z.string().min(1).max(100),
    settings: z.record(z.any()).optional(),
  }),
}
```

## Error Response Format

All errors now return a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "path": ["name"],
        "message": "String must contain at least 1 character(s)"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-20T10:30:00.000Z",
    "requestId": "req_1705747800000_abc123",
    "duration": "150ms"
  }
}
```

## Success Response Format

All successful responses follow this format:

```json
{
  "success": true,
  "data": {
    // Your response data
  },
  "meta": {
    "timestamp": "2024-01-20T10:30:00.000Z",
    "requestId": "req_1705747800000_abc123",
    "duration": "150ms",
    "cached": false,
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "hasMore": true
    }
  }
}
```

## Best Practices

1. **Use Common Schemas**: Leverage `CommonSchemas` for standard patterns like pagination, IDs, and time ranges.

2. **Throw Specific Errors**: Use predefined `ErrorCodes` for consistent error handling.

3. **Cache Appropriately**: Set reasonable TTLs - shorter for frequently changing data, longer for static data.

4. **Rate Limit by Usage**: More restrictive limits for expensive operations, looser for read operations.

5. **Validate Thoroughly**: Use Zod's rich validation features for type safety and better error messages.

6. **Monitor Performance**: The handler automatically tracks request duration - use this for optimization.

## Next Steps

1. Start with high-traffic endpoints first
2. Migrate one endpoint at a time
3. Test thoroughly in development
4. Monitor error rates and performance after migration
5. Update API documentation to reflect new response formats

## Available Examples

- `lib/api/examples/chatbot-handler.ts` - CRUD operations for chatbots
- `lib/api/examples/conversation-handler.ts` - Paginated listings and messaging

These examples demonstrate real-world usage patterns you can adapt for your specific endpoints.