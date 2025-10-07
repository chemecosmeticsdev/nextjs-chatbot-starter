# Runtime Error Prevention Checklist

**Purpose**: Actionable checklist to prevent critical runtime errors during development
**Target Audience**: Developers, Code Reviewers, QA Engineers
**Last Updated**: October 3, 2025

## Pre-Development Checklist

### 🔍 Before Writing Code
- [ ] Review similar components for defensive programming patterns
- [ ] Identify all external data sources (APIs, props, user input)
- [ ] Plan validation strategy for each data source
- [ ] Consider edge cases (empty arrays, null values, network failures)

## Development Phase Checklist

### 📝 API Integration
- [ ] **NEVER** trust API response structure
- [ ] Always validate arrays with `Array.isArray(data) ? data : []`
- [ ] Check for null/undefined: `data != null`
- [ ] Validate object structure before accessing properties
- [ ] Implement specific error handling for HTTP status codes
- [ ] Provide user-friendly error messages, not technical ones

```typescript
// ✅ GOOD - Defensive API handling
const response = await fetch('/api/data');
const result = await response.json();

if (!response.ok) {
  if (response.status === 500) {
    throw new Error('Service temporarily unavailable. Please try again.');
  }
  // Handle other status codes...
}

const data = Array.isArray(result.data) ? result.data : [];
```

### 🎛️ Select Components
- [ ] **NEVER** use empty string `""` as value prop
- [ ] Use semantic values: `"no-options"`, `"loading"`, `"disabled"`
- [ ] Test with empty data arrays
- [ ] Provide disabled state for unavailable options
- [ ] Ensure fallback options for edge cases

```jsx
// ✅ GOOD - Safe Select implementation
<SelectItem value={item.id || `fallback-${index}`} disabled={!item.id}>
  {item.name || 'Unnamed item'}
</SelectItem>

// ❌ BAD - Unsafe Select implementation
<SelectItem value={item.id || ""}>
  {item.name}
</SelectItem>
```

### 🔢 Function Parameters
- [ ] Validate all parameters before operations
- [ ] Check for `null`, `undefined`, and `NaN`
- [ ] Use type guards for complex validations
- [ ] Provide meaningful fallback values
- [ ] Document expected parameter types and ranges

```typescript
// ✅ GOOD - Safe function implementation
const formatNumber = (num: number, decimals: number = 0): string => {
  if (num == null || typeof num !== 'number' || isNaN(num)) {
    return '0';
  }
  return num.toFixed(decimals);
};

// ❌ BAD - Unsafe function implementation
const formatNumber = (num: number, decimals: number = 0): string => {
  return num.toFixed(decimals); // Crashes on null/undefined
};
```

### 🛡️ Error Handling
- [ ] Implement error boundaries for component trees
- [ ] Provide specific error messages for different scenarios
- [ ] Include actionable next steps in error messages
- [ ] Log technical details for debugging (not shown to users)
- [ ] Test error states manually and automatically

```typescript
// ✅ GOOD - User-friendly error handling
const handleError = (error: Error, context: string) => {
  console.error(`${context}:`, error); // Technical details for debugging

  return {
    message: 'Unable to load data. Please refresh the page and try again.',
    action: 'retry',
    severity: 'error'
  };
};
```

## Code Review Checklist

### 🔍 Review Requirements
- [ ] **Array Operations**: All `.map()`, `.filter()`, `.forEach()` preceded by `Array.isArray()` check
- [ ] **Number Operations**: All `.toFixed()`, math operations include null/NaN checks
- [ ] **Select Components**: No empty string values, all have meaningful fallbacks
- [ ] **Error Messages**: User-friendly, actionable, no technical jargon
- [ ] **API Responses**: Defensive handling, no assumptions about data structure

### 🧪 Testing Requirements
- [ ] **Edge Case Testing**: Test with `null`, `undefined`, `[]`, `{}`
- [ ] **Error State Testing**: Simulate 500, 404, network failures
- [ ] **Performance Testing**: Test with large datasets and slow responses
- [ ] **User Experience Testing**: Verify error messages are helpful

## Component-Specific Guidelines

### 📊 Dashboard Components
- [ ] Validate all metrics data before rendering
- [ ] Provide loading states for all data fetching
- [ ] Handle empty data gracefully with meaningful messages
- [ ] Implement refresh mechanisms for failed data loads

### 💬 Chat Components
- [ ] Validate conversation data structure
- [ ] Handle empty conversation lists
- [ ] Provide fallback UI for missing chatbots
- [ ] Ensure message rendering handles malformed content

### 📄 Form Components
- [ ] Validate all form data before submission
- [ ] Provide clear validation error messages
- [ ] Handle server-side validation errors gracefully
- [ ] Implement proper loading states during submission

## Testing Strategy

### 🔄 Manual Testing Workflow
1. **Happy Path Testing**: Verify normal functionality works
2. **Edge Case Testing**: Test with empty/null/undefined data
3. **Error State Testing**: Simulate API failures and network issues
4. **Performance Testing**: Test with large datasets and slow connections
5. **Accessibility Testing**: Ensure error states are screen reader friendly

### 🤖 Automated Testing Requirements
```typescript
// Required test patterns for all components
describe('Component Defensive Programming', () => {
  test('handles null/undefined data gracefully', () => {
    // Test with null, undefined, empty arrays, malformed objects
  });

  test('displays user-friendly error messages', () => {
    // Test error message content and formatting
  });

  test('provides fallback UI for edge cases', () => {
    // Test loading states, empty states, error states
  });
});
```

## Common Anti-Patterns to Avoid

### ❌ Dangerous Patterns
```typescript
// DON'T: Trust API response structure
const items = response.data;
items.map(item => ...); // Can crash

// DON'T: Use empty string values in Select
<SelectItem value="">Empty Option</SelectItem> // Causes error

// DON'T: Assume numeric values are valid
const result = value.toFixed(2); // Crashes on null/undefined

// DON'T: Show technical errors to users
throw new Error('HTTP 500: Internal Server Error'); // Unhelpful
```

### ✅ Safe Patterns
```typescript
// DO: Validate before using
const items = Array.isArray(response.data) ? response.data : [];
items.map(item => ...); // Always safe

// DO: Use meaningful values in Select
<SelectItem value="no-options" disabled>No options available</SelectItem>

// DO: Validate before operations
const result = (typeof value === 'number' && !isNaN(value))
  ? value.toFixed(2)
  : '0.00';

// DO: Provide helpful error messages
throw new Error('Unable to save changes. Please check your connection and try again.');
```

## Emergency Response Checklist

### 🚨 When Runtime Errors Occur in Production
1. **Immediate Response** (0-15 minutes):
   - [ ] Identify affected components/pages
   - [ ] Check error frequency and user impact
   - [ ] Implement quick hotfix if possible
   - [ ] Communicate with stakeholders

2. **Short-term Fix** (15 minutes - 2 hours):
   - [ ] Apply defensive programming patterns
   - [ ] Add comprehensive error handling
   - [ ] Test fix thoroughly in staging
   - [ ] Deploy with monitoring

3. **Long-term Prevention** (2+ hours):
   - [ ] Analyze root cause thoroughly
   - [ ] Update coding guidelines if needed
   - [ ] Add automated tests to prevent regression
   - [ ] Review similar patterns across codebase
   - [ ] Update documentation

## Monitoring and Alerts

### 📈 Key Metrics to Track
- [ ] JavaScript error frequency by component
- [ ] API failure rates and response times
- [ ] User-reported navigation issues
- [ ] Browser console error patterns

### 🔔 Alert Thresholds
- [ ] **Critical**: >5 JavaScript errors per minute
- [ ] **High**: >20% API failure rate
- [ ] **Medium**: >100ms increase in page load time
- [ ] **Low**: >10 console warnings per session

## Documentation Requirements

### 📚 Required Documentation for Each Fix
- [ ] **Root Cause Analysis**: What caused the error?
- [ ] **Fix Implementation**: What specific changes were made?
- [ ] **Prevention Strategy**: How to avoid similar issues?
- [ ] **Testing Strategy**: How to verify the fix works?
- [ ] **Monitoring Plan**: How to detect if issue reoccurs?

---

## Quick Reference Commands

### Validation Snippets
```typescript
// Array validation
const safeArray = Array.isArray(data) ? data : [];

// Number validation
const safeNumber = (num == null || typeof num !== 'number' || isNaN(num)) ? 0 : num;

// Object validation
const safeObject = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};

// String validation
const safeString = (typeof str === 'string') ? str : '';
```

### Error Handling Template
```typescript
try {
  // Risky operation
} catch (error) {
  console.error('Technical details:', error);
  setUserError('User-friendly message with next steps');
}
```

---

**Remember**: The goal is to create a robust, user-friendly application that gracefully handles all edge cases. When in doubt, add more validation rather than less.