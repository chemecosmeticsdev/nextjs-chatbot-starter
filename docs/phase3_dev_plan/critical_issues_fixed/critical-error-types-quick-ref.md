# Critical Error Types Quick Reference

**Purpose**: Fast lookup guide for identifying and fixing critical runtime errors
**Target Audience**: Developers during debugging and code review
**Last Updated**: October 3, 2025

## Error Classification System

### 🔴 CRITICAL (Application Breaking)
- Page shows "Unhandled Runtime Error" dialog
- Complete loss of functionality
- User cannot proceed

### 🟡 HIGH (Partial Functionality Loss)
- Component shows error state
- Data not loading but page functional
- Degraded user experience

### 🟢 LOW (Cosmetic/Warning)
- Console warnings only
- No impact on functionality
- Development-time notices

---

## Error Type 1: Select Component Value Error

### 🔍 **Symptoms**
```
Error: A <Select.Item /> must have a value prop that is not an empty string
```

### 📍 **Common Locations**
- Chat interfaces with chatbot selection
- Form dropdowns with dynamic options
- Filter components with conditional items

### ⚡ **Quick Fix**
```jsx
// ❌ BROKEN
<SelectItem value="" disabled>
  No options available
</SelectItem>

// ✅ FIXED
<SelectItem value="no-options" disabled>
  No options available
</SelectItem>
```

### 🔧 **Prevention Code**
```jsx
// Safe Select pattern
{items.length === 0 ? (
  <SelectItem value="empty-state" disabled>
    {emptyMessage}
  </SelectItem>
) : (
  items.map((item, index) => (
    <SelectItem key={item.id} value={item.id || `fallback-${index}`}>
      {item.name}
    </SelectItem>
  ))
)}
```

### ⏱️ **Fix Time**: 2-5 minutes

---

## Error Type 2: TypeError on Number Methods

### 🔍 **Symptoms**
```
TypeError: num.toFixed is not a function
TypeError: Cannot read property 'toFixed' of null
```

### 📍 **Common Locations**
- Analytics dashboards with metrics
- Financial calculations
- Percentage and formatting functions

### ⚡ **Quick Fix**
```typescript
// ❌ BROKEN
const formatNumber = (num: number) => {
  return num.toFixed(2); // Crashes on null/undefined
};

// ✅ FIXED
const formatNumber = (num: number) => {
  if (num == null || typeof num !== 'number' || isNaN(num)) {
    return '0';
  }
  return num.toFixed(2);
};
```

### 🔧 **Prevention Code**
```typescript
// Safe number validation function
const safeNumber = (value: any, fallback: number = 0): number => {
  return (typeof value === 'number' && !isNaN(value)) ? value : fallback;
};

// Usage
const formattedValue = safeNumber(apiResponse.count, 0).toFixed(2);
```

### ⏱️ **Fix Time**: 3-10 minutes

---

## Error Type 3: Array Method on Non-Array

### 🔍 **Symptoms**
```
TypeError: chatbots.map is not a function
TypeError: data.filter is not a function
TypeError: items.forEach is not a function
```

### 📍 **Common Locations**
- Dashboard components with API data
- List rendering components
- Data processing functions

### ⚡ **Quick Fix**
```typescript
// ❌ BROKEN
const response = await fetch('/api/data');
const result = await response.json();
const items = result.data || [];
items.map(item => ...); // Crashes if data is not array

// ✅ FIXED
const response = await fetch('/api/data');
const result = await response.json();
const items = Array.isArray(result.data) ? result.data : [];
items.map(item => ...); // Always safe
```

### 🔧 **Prevention Code**
```typescript
// Safe array extraction utility
const safeArray = <T>(data: any): T[] => {
  return Array.isArray(data) ? data : [];
};

// Usage in components
const chatbots = safeArray(apiResponse.data);
const conversations = safeArray(apiResponse.conversations);
```

### ⏱️ **Fix Time**: 1-5 minutes per occurrence

---

## Error Type 4: API Response Errors

### 🔍 **Symptoms**
```
Failed to fetch documents: Internal Server Error
HTTP 500: Internal Server Error
Network request failed
```

### 📍 **Common Locations**
- Document management pages
- Data fetching hooks
- Form submission handlers

### ⚡ **Quick Fix**
```typescript
// ❌ BROKEN
if (!response.ok) {
  throw new Error(response.statusText); // Unhelpful to users
}

// ✅ FIXED
if (!response.ok) {
  if (response.status === 500) {
    throw new Error('Service temporarily unavailable. Please try again.');
  } else if (response.status === 404) {
    throw new Error('Resource not found. Please refresh the page.');
  } else {
    throw new Error('Unable to complete request. Please try again.');
  }
}
```

### 🔧 **Prevention Code**
```typescript
// Error message generator
const getErrorMessage = (status: number, context: string = 'operation') => {
  const messages = {
    500: `${context} service is temporarily unavailable.`,
    404: `${context} not found. Please refresh the page.`,
    401: `Please log in to access ${context}.`,
    403: `You don't have permission for this ${context}.`,
  };
  return messages[status] || `Unable to complete ${context}. Please try again.`;
};
```

### ⏱️ **Fix Time**: 5-15 minutes

---

## Error Type 5: Undefined Property Access

### 🔍 **Symptoms**
```
TypeError: Cannot read property 'name' of undefined
TypeError: Cannot read property 'length' of null
```

### 📍 **Common Locations**
- User profile components
- Nested object rendering
- Configuration object access

### ⚡ **Quick Fix**
```typescript
// ❌ BROKEN
const userName = user.profile.name; // Crashes if profile is null

// ✅ FIXED
const userName = user?.profile?.name || 'Anonymous';
```

### 🔧 **Prevention Code**
```typescript
// Safe property access utility
const safeGet = (obj: any, path: string, fallback: any = null) => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : fallback;
  }, obj);
};

// Usage
const userName = safeGet(user, 'profile.name', 'Anonymous');
const email = safeGet(user, 'contact.email', 'No email');
```

### ⏱️ **Fix Time**: 2-8 minutes

---

## Emergency Response Workflow

### 🚨 **Critical Error Detected (0-5 minutes)**
1. **Identify Error Type** using symptoms above
2. **Apply Quick Fix** from this guide
3. **Test Immediately** in development
4. **Deploy Hotfix** if production issue

### 🔍 **Investigation Phase (5-30 minutes)**
1. **Find All Occurrences** of same pattern
2. **Apply Prevention Code** to prevent recurrence
3. **Add Tests** to catch similar issues
4. **Update Documentation** if needed

### 📋 **Code Review Checklist**
- [ ] All Select components have non-empty values
- [ ] All number operations include validation
- [ ] All array operations use `Array.isArray()` check
- [ ] All API errors have user-friendly messages
- [ ] All property access uses safe patterns

---

## File-Specific Quick Fixes

### 📄 **Chat Components**
```jsx
// conversation-sidebar.tsx common fix
<SelectItem value="no-chatbots" disabled>
  No chatbots available
</SelectItem>
```

### 📊 **Analytics Components**
```typescript
// analytics/page.tsx common fix
const formatNumber = (num: number): string => {
  if (num == null || typeof num !== 'number' || isNaN(num)) return '0';
  return num.toFixed(0);
};
```

### 🗂️ **Dashboard Components**
```typescript
// Dashboard cards common fix
const data = Array.isArray(response.data) ? response.data : [];
```

### 📚 **Knowledge Base Components**
```typescript
// knowledge-base/page.tsx common fix
if (response.status === 500) {
  throw new Error('Knowledge base temporarily unavailable. Please try again.');
}
```

---

## Code Pattern Detection

### 🔍 **Search Patterns to Find Issues**

```bash
# Find potential Select component issues
grep -r "value=\"\"" components/

# Find potential number method issues
grep -r "\.toFixed\|\.toPrecision" app/ components/

# Find potential array method issues without validation
grep -r "\.map\|\.filter\|\.forEach" app/ components/ | grep -v "Array.isArray"

# Find generic error handling
grep -r "response.statusText" app/ components/
```

### 🛡️ **VS Code Snippets for Quick Fixes**

```json
{
  "Safe Array Check": {
    "prefix": "safearray",
    "body": "Array.isArray($1) ? $1 : []",
    "description": "Safe array validation"
  },
  "Safe Number Check": {
    "prefix": "safenum",
    "body": "($1 == null || typeof $1 !== 'number' || isNaN($1)) ? $2 : $1",
    "description": "Safe number validation"
  },
  "Safe Select Item": {
    "prefix": "selectitem",
    "body": "<SelectItem value=\"${1:fallback}\" disabled>\n  ${2:No options available}\n</SelectItem>",
    "description": "Safe Select item with fallback value"
  }
}
```

---

## Testing Commands

### 🧪 **Quick Test Commands**
```bash
# Test with empty responses
curl -X GET localhost:3000/api/v1/chatbots -H "Content-Type: application/json" -d '{}'

# Test error scenarios
curl -X GET localhost:3000/api/v1/documents -w "%{http_code}"

# Test malformed data
curl -X GET localhost:3000/api/v1/analytics -H "Content-Type: application/json" -d '{"data": "not-an-array"}'
```

### 🔧 **Browser Console Tests**
```javascript
// Test formatNumber function
formatNumber(null); // Should return '0'
formatNumber("string"); // Should return '0'
formatNumber(1234.567); // Should return formatted number

// Test array operations
const testData = [null, undefined, [], {}, "string"];
testData.forEach(data => {
  const safe = Array.isArray(data) ? data : [];
  console.log(safe.length); // Should not crash
});
```

---

## Recovery Commands

### 🔄 **Quick Recovery Actions**
```bash
# Restart development server
npm run dev

# Clear build cache
rm -rf .next/
npm run build

# Reset to last working commit
git checkout HEAD~1 -- [filename]

# Apply emergency patch
git stash
git pull origin main
git stash pop
```

---

**Remember**: This guide is for fast problem-solving. For comprehensive understanding, refer to the main [Navigation Runtime Errors Resolution Guide](./navigation-runtime-errors-resolution-guide.md).