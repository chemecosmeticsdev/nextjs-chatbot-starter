# Content Moderation Integration Guide

This document outlines how the Phase 5.2 Content Moderation system has been integrated with existing chatbot infrastructure and how to use it effectively.

## Overview

The content moderation system provides:
- Real-time content filtering for WebSocket and REST API endpoints
- Configurable moderation rules and severity thresholds
- User reporting and appeals system
- Admin review interface for flagged content
- Compliance logging and analytics

## Integration Points

### 1. WebSocket Chat Messages

**File**: `lib/websocket/message-broker.ts`

The WebSocket message broker now includes content moderation for all incoming chat messages:

```typescript
// Content moderation is applied before processing chat messages
const moderationResult = await ContentModerationService.moderateContent(moderationContext);

// Messages are blocked, flagged, or allowed based on moderation rules
if (moderationResult.isViolation && moderationResult.action === 'block') {
  // Send error notification to client
  return;
}
```

### 2. REST API Endpoints

**File**: `app/api/v1/conversations/[id]/messages/route.ts`

REST endpoints use the content filter middleware:

```typescript
// Apply content filtering middleware
export const POST = withContentFilter({
  enabled: true,
  blockOnViolation: true,
  severityThreshold: 'medium',
  logViolations: true,
  rateLimitViolators: true,
  exemptRoles: ['admin', 'super_admin']
})(postHandler);
```

### 3. Available Middleware Configurations

#### Chat Content Filter (Strict)
```typescript
import { withChatContentFilter } from '@/lib/middleware/content-filter';

export const POST = withChatContentFilter()(handler);
```

#### API Content Filter (Moderate)
```typescript
import { withApiContentFilter } from '@/lib/middleware/content-filter';

export const POST = withApiContentFilter()(handler);
```

#### Admin Content Filter (Minimal)
```typescript
import { withAdminContentFilter } from '@/lib/middleware/content-filter';

export const POST = withAdminContentFilter()(handler);
```

## API Endpoints

### User-Facing Endpoints

#### Content Pre-validation
```
POST /api/v1/moderation/check
```
Check content before sending to validate against moderation rules.

#### User Reporting
```
POST /api/v1/moderation/report
GET /api/v1/moderation/report?userIdentifier={id}
```
Submit reports for inappropriate content and view report history.

#### Content Appeals
```
POST /api/v1/moderation/appeal
GET /api/v1/moderation/appeal?userIdentifier={id}
```
Submit appeals for moderation decisions and view appeal history.

### Admin Endpoints

#### Review Management
```
GET /api/v1/admin/moderation/reviews
POST /api/v1/admin/moderation/reviews
```
Review pending violations and process appeals.

#### Rule Configuration
```
GET /api/v1/admin/moderation/rules
POST /api/v1/admin/moderation/rules
DELETE /api/v1/admin/moderation/rules
```
Manage moderation rules and configurations.

#### Analytics and Reporting
```
GET /api/v1/admin/moderation/analytics
POST /api/v1/admin/moderation/analytics/export
```
Access moderation analytics and export compliance reports.

## Database Schema

### Core Tables

- `content_moderation_rules` - Configurable moderation rules
- `content_moderation_violations` - Violation records
- `content_moderation_reviews` - Admin review records
- `content_moderation_appeals` - User appeals
- `message_feedback` - User feedback and reports

### Rule Types

1. **Profanity Detection** - Filters offensive language
2. **Spam Detection** - Identifies spam patterns
3. **Toxicity Detection** - Detects toxic/harmful content
4. **Custom Patterns** - Regex-based custom rules
5. **AI Detection** - ML-based content analysis

## Usage Examples

### 1. Adding Content Moderation to New Endpoints

```typescript
import { withContentFilter } from '@/lib/middleware/content-filter';

async function myHandler(request: NextRequest) {
  // Your handler logic
}

export const POST = withContentFilter({
  enabled: true,
  blockOnViolation: true,
  severityThreshold: 'high',
  customHandler: async (result, context) => {
    // Custom handling logic
    return null; // Continue with default handling
  }
})(myHandler);
```

### 2. Manual Content Moderation

```typescript
import { ContentModerationService } from '@/lib/services/content-moderation';

const result = await ContentModerationService.moderateContent({
  messageContent: "Content to moderate",
  userId: "user-id",
  chatbotId: "chatbot-id",
  conversationId: "conversation-id",
  userIdentifier: "unique-identifier",
  metadata: {
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0...",
    endpoint: "/api/endpoint",
    method: "POST"
  }
});

if (result.isViolation) {
  // Handle violation
  console.log(`Violation detected: ${result.reasoning}`);
  console.log(`Action: ${result.action}`);
  console.log(`Severity: ${result.severity}`);
}
```

### 3. Creating Custom Moderation Rules

```typescript
// Via API
const response = await fetch('/api/v1/admin/moderation/rules', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-api-key': 'your-admin-key'
  },
  body: JSON.stringify({
    name: 'Custom Spam Filter',
    ruleType: 'custom_pattern',
    configuration: {
      patterns: ['spam-pattern-1', 'spam-pattern-2'],
      ignoreCase: true,
      wholeWords: false
    },
    severityLevel: 'medium',
    autoAction: 'flag',
    adminId: 'admin-user-id'
  })
});
```

### 4. User Reporting Integration

```typescript
// Submit user report
const reportResponse = await fetch('/api/v1/moderation/report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messageId: 'message-to-report',
    reportCategory: 'inappropriate',
    reportReason: 'Contains offensive language',
    additionalDetails: 'Specific details about the violation',
    chatbotId: 'chatbot-id',
    conversationId: 'conversation-id'
  })
});

const result = await reportResponse.json();
console.log(`Report ID: ${result.reportId}`);
console.log(`Status: ${result.status}`);
```

## Configuration

### Environment Variables

Add to `.env.local`:

```env
# Content Moderation Configuration
CONTENT_MODERATION_ENABLED=true
CONTENT_MODERATION_DEFAULT_SEVERITY=medium
CONTENT_MODERATION_RATE_LIMIT_ENABLED=true
CONTENT_MODERATION_ADMIN_API_KEY=your-secure-admin-key
```

### Rule Configuration Examples

#### Profanity Filter
```json
{
  "name": "Basic Profanity Filter",
  "ruleType": "profanity",
  "configuration": {
    "wordList": ["word1", "word2"],
    "severity": "high",
    "allowList": ["exception1"],
    "ignoreCase": true
  },
  "severityLevel": "high",
  "autoAction": "block"
}
```

#### Spam Detection
```json
{
  "name": "Spam Pattern Detector",
  "ruleType": "spam",
  "configuration": {
    "indicators": {
      "repeatedCharacters": 5,
      "capsPercentage": 80,
      "urlCount": 3,
      "phoneNumberPattern": true
    }
  },
  "severityLevel": "medium",
  "autoAction": "flag"
}
```

## Monitoring and Analytics

### Admin Dashboard

Access the moderation dashboard at `/dashboard/moderation` for:
- Review pending violations
- Manage moderation rules
- View analytics and trends
- Process user appeals

### Compliance Reporting

Generate compliance reports:

```typescript
const report = await ComplianceLogger.generateComplianceReport(
  startDate,
  endDate,
  chatbotId // optional
);

// Export as CSV
const csvExport = await ComplianceLogger.exportDataForCompliance(
  'csv',
  startDate,
  endDate,
  chatbotId
);
```

## Security Considerations

1. **Rate Limiting**: Content moderation includes rate limiting for violators
2. **Admin Authentication**: Admin endpoints require proper authentication
3. **Audit Logging**: All moderation actions are logged for compliance
4. **Data Retention**: Configurable retention policies for moderation data
5. **Appeal Process**: Users can appeal moderation decisions

## Best Practices

1. **Gradual Rollout**: Start with permissive settings and gradually increase strictness
2. **Regular Review**: Regularly review flagged content to improve rule accuracy
3. **User Communication**: Clearly communicate moderation policies to users
4. **Appeal Process**: Provide clear instructions for the appeal process
5. **Performance Monitoring**: Monitor moderation performance impact on response times

## Troubleshooting

### Common Issues

1. **High False Positives**: Adjust rule configurations or severity thresholds
2. **Performance Impact**: Consider async processing for non-critical paths
3. **Rule Conflicts**: Ensure rule priorities are properly configured
4. **Storage Growth**: Implement data retention policies

### Debug Mode

Enable debug logging:

```typescript
// Add to environment
DEBUG_CONTENT_MODERATION=true

// Check logs for detailed moderation decisions
console.log('Moderation result:', result);
```

## Migration and Rollback

### Enabling Content Moderation

1. Deploy the content moderation system
2. Configure initial rules through admin interface
3. Enable middleware on endpoints gradually
4. Monitor performance and accuracy

### Disabling Content Moderation

```typescript
// Disable via middleware options
export const POST = withContentFilter({
  enabled: false
})(handler);

// Or remove middleware entirely
export const POST = handler;
```

This integration ensures comprehensive content moderation across all chat interfaces while maintaining system performance and providing administrative control over moderation policies.