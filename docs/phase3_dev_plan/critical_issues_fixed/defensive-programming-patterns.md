# Defensive Programming Patterns

**Purpose**: Reusable code patterns and examples for preventing runtime errors
**Focus**: Real-world examples from actual fixes implemented in the chatbot application
**Last Updated**: October 3, 2025

## Core Principles

### 🛡️ Defensive Programming Philosophy
1. **Assume external data is invalid until proven otherwise**
2. **Provide graceful fallbacks for all edge cases**
3. **Validate early, fail gracefully**
4. **Prioritize user experience over technical accuracy**
5. **Log technical details, show friendly messages**

## Pattern 1: Array Validation and Safe Operations

### ❌ Problem Pattern
```typescript
// Dangerous: Assumes API always returns array
const response = await fetch('/api/chatbots');
const result = await response.json();
const chatbots = result.data || [];

// CRASHES if result.data is null, undefined, or non-array
chatbots.map(bot => ({ ...bot, formatted: true }));
chatbots.filter(bot => bot.status === 'active');
chatbots.forEach(bot => console.log(bot.name));
```

### ✅ Solution Pattern
```typescript
// Safe: Validates array before operations
const response = await fetch('/api/chatbots');
const result = await response.json();

// Defensive array validation
const chatbots = Array.isArray(result.data) ? result.data : [];

// Now all array operations are safe
const formattedBots = chatbots.map(bot => ({ ...bot, formatted: true }));
const activeBots = chatbots.filter(bot => bot.status === 'active');
chatbots.forEach(bot => console.log(bot.name || 'Unnamed bot'));
```

### 🔧 Reusable Utility Function
```typescript
/**
 * Safely extracts array from API response
 * @param response - API response object
 * @param path - Dot notation path to array (e.g., 'data.items')
 * @returns Safe array, never null or undefined
 */
export function safeArrayExtract<T>(response: any, path: string = 'data'): T[] {
  const keys = path.split('.');
  let current = response;

  for (const key of keys) {
    if (current && typeof current === 'object') {
      current = current[key];
    } else {
      return [];
    }
  }

  return Array.isArray(current) ? current : [];
}

// Usage examples:
const chatbots = safeArrayExtract<Chatbot>(apiResponse, 'data');
const conversations = safeArrayExtract<Conversation>(apiResponse, 'result.conversations');
const logs = safeArrayExtract<Log>(apiResponse); // defaults to 'data'
```

### 📍 Real Implementation (From Our Fixes)
```typescript
// File: components/dashboard/chatbot-performance-card.tsx
const fetchChatbotPerformance = async (showLoader = false) => {
  try {
    const chatbotsResponse = await fetch('/api/v1/chatbots');
    const chatbotsResult = await chatbotsResponse.json();

    // ✅ DEFENSIVE: Validate array before use
    const chatbots = Array.isArray(chatbotsResult.data) ? chatbotsResult.data : [];

    const conversationsResponse = await fetch('/api/v1/conversations?limit=100');
    const conversationsResult = conversationsResponse.ok
      ? await conversationsResponse.json()
      : { data: [] };

    // ✅ DEFENSIVE: Multiple layers of validation
    const conversations = Array.isArray(conversationsResult.data)
      ? conversationsResult.data
      : [];

    // Safe to use array methods
    const activeChatbots = chatbots.filter((bot: any) => bot.status === 'active').length;
    const totalConversations = conversations.length;
  } catch (err) {
    // Handle gracefully
  }
};
```

---

## Pattern 2: Number Validation and Safe Operations

### ❌ Problem Pattern
```typescript
// Dangerous: Assumes value is always a valid number
const formatNumber = (num: number, decimals: number = 0): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K';
  }
  return num.toFixed(decimals); // CRASHES on null/undefined/NaN
};
```

### ✅ Solution Pattern
```typescript
// Safe: Validates number before operations
const formatNumber = (num: number, decimals: number = 0): string => {
  // Comprehensive number validation
  if (num == null || typeof num !== 'number' || isNaN(num)) {
    return '0';
  }

  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K';
  }
  return num.toFixed(decimals);
};
```

### 🔧 Reusable Type Guards
```typescript
/**
 * Type guard for valid numbers
 */
export function isValidNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard for positive numbers
 */
export function isPositiveNumber(value: any): value is number {
  return isValidNumber(value) && value >= 0;
}

/**
 * Safe number extraction with fallback
 */
export function safeNumber(value: any, fallback: number = 0): number {
  return isValidNumber(value) ? value : fallback;
}

// Usage examples:
const userCount = safeNumber(response.userCount, 0);
const percentage = safeNumber(response.successRate, 0);

if (isPositiveNumber(score)) {
  // Safe to use score as positive number
  const formatted = score.toFixed(2);
}
```

### 📍 Real Implementation (From Our Fixes)
```typescript
// File: app/dashboard/analytics/page.tsx
const formatNumber = (num: number, decimals: number = 0): string => {
  // ✅ DEFENSIVE: Validate before any number operations
  if (num == null || typeof num !== 'number' || isNaN(num)) {
    return '0';
  }

  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K';
  }
  return num.toFixed(decimals);
};

// Safe usage in component
<div className="text-2xl font-bold">
  {formatNumber(dashboardMetrics.periodMetrics.totalConversations)}
</div>
```

---

## Pattern 3: Select Component Safety

### ❌ Problem Pattern
```jsx
// Dangerous: Empty string value causes runtime error
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select chatbot" />
  </SelectTrigger>
  <SelectContent>
    {chatbots.length === 0 ? (
      <SelectItem value="" disabled>  {/* ❌ CRASHES */}
        No chatbots available
      </SelectItem>
    ) : (
      chatbots.map(bot => (
        <SelectItem key={bot.id} value={bot.id}>
          {bot.name}
        </SelectItem>
      ))
    )}
  </SelectContent>
</Select>
```

### ✅ Solution Pattern
```jsx
// Safe: Meaningful values for all states
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select chatbot" />
  </SelectTrigger>
  <SelectContent>
    {chatbots.length === 0 ? (
      <SelectItem value="no-chatbots" disabled>  {/* ✅ SAFE */}
        No chatbots available
      </SelectItem>
    ) : (
      chatbots.map((bot, index) => (
        <SelectItem
          key={bot.id || `bot-${index}`}
          value={bot.id || `fallback-${index}`}
        >
          {bot.name || 'Unnamed chatbot'}
        </SelectItem>
      ))
    )}
  </SelectContent>
</Select>
```

### 🔧 Reusable Select Component
```tsx
interface SafeSelectProps {
  items: Array<{ id: string; name: string; disabled?: boolean }>;
  placeholder?: string;
  emptyMessage?: string;
  onValueChange?: (value: string) => void;
  value?: string;
}

export function SafeSelect({
  items,
  placeholder = "Select an option",
  emptyMessage = "No options available",
  onValueChange,
  value
}: SafeSelectProps) {
  // Validate items array
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <Select onValueChange={onValueChange} value={value}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {safeItems.length === 0 ? (
          <SelectItem value="no-options" disabled>
            {emptyMessage}
          </SelectItem>
        ) : (
          safeItems.map((item, index) => (
            <SelectItem
              key={item.id || `item-${index}`}
              value={item.id || `fallback-${index}`}
              disabled={item.disabled}
            >
              {item.name || 'Unnamed item'}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
```

### 📍 Real Implementation (From Our Fixes)
```tsx
// File: components/chat/conversation-sidebar.tsx
<Select onValueChange={setSelectedChatbot} value={selectedChatbot}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Select chatbot" />
  </SelectTrigger>
  <SelectContent>
    {chatbots.length === 0 ? (
      <SelectItem value="no-chatbots" disabled>  {/* ✅ FIXED */}
        No chatbots available
      </SelectItem>
    ) : (
      chatbots.map((chatbot) => (
        <SelectItem key={chatbot.id} value={chatbot.id}>
          {chatbot.name}
        </SelectItem>
      ))
    )}
  </SelectContent>
</Select>
```

---

## Pattern 4: Enhanced Error Handling

### ❌ Problem Pattern
```typescript
// Dangerous: Generic error handling with poor UX
const fetchDocuments = async () => {
  try {
    const response = await fetch('/api/documents');
    if (!response.ok) {
      throw new Error(response.statusText); // Unhelpful to users
    }
    return await response.json();
  } catch (error) {
    throw error; // Raw error exposed to user
  }
};
```

### ✅ Solution Pattern
```typescript
// Safe: Specific error handling with user-friendly messages
const fetchDocuments = async () => {
  try {
    const response = await fetch('/api/documents');

    if (!response.ok) {
      // Specific handling for different error types
      if (response.status === 500) {
        throw new Error('Service temporarily unavailable. Please try again in a few minutes.');
      } else if (response.status === 404) {
        throw new Error('Documents not found. Please check your permissions.');
      } else if (response.status === 401) {
        throw new Error('Please log in to access documents.');
      } else if (response.status >= 400 && response.status < 500) {
        throw new Error('Unable to load documents. Please refresh the page.');
      } else {
        throw new Error('Network error. Please check your connection.');
      }
    }

    return await response.json();
  } catch (error) {
    // Log technical details for debugging (not shown to user)
    console.error('Document fetch error:', error);

    // Re-throw with user-friendly message if it's our custom error
    if (error instanceof Error && error.message.includes('Service temporarily')) {
      throw error;
    }

    // Generic fallback for unexpected errors
    throw new Error('Unable to load documents. Please try again.');
  }
};
```

### 🔧 Reusable Error Handler
```typescript
export interface UserError {
  message: string;
  action?: 'retry' | 'refresh' | 'login' | 'contact_support';
  severity: 'error' | 'warning' | 'info';
}

export function createUserError(
  response: Response,
  context: string = 'operation'
): UserError {
  const status = response.status;

  switch (true) {
    case status === 500:
      return {
        message: `The ${context} service is temporarily unavailable. Please try again.`,
        action: 'retry',
        severity: 'error'
      };

    case status === 404:
      return {
        message: `${context} not found. Please check the URL or try refreshing.`,
        action: 'refresh',
        severity: 'warning'
      };

    case status === 401:
      return {
        message: `Please log in to access ${context}.`,
        action: 'login',
        severity: 'warning'
      };

    case status >= 400 && status < 500:
      return {
        message: `Unable to complete ${context}. Please try again.`,
        action: 'retry',
        severity: 'error'
      };

    default:
      return {
        message: `Network error during ${context}. Please check your connection.`,
        action: 'retry',
        severity: 'error'
      };
  }
}

// Usage:
try {
  const response = await fetch('/api/documents');
  if (!response.ok) {
    const userError = createUserError(response, 'document loading');
    throw new Error(userError.message);
  }
} catch (error) {
  setErrorState(error.message);
}
```

### 📍 Real Implementation (From Our Fixes)
```typescript
// File: app/dashboard/knowledge-base/page.tsx
const fetchDocuments = async () => {
  try {
    const response = await fetch('/api/v1/documents');

    if (!response.ok) {
      // ✅ ENHANCED: Specific error handling for different status codes
      if (response.status === 500) {
        throw new Error(`Internal Server Error: The knowledge base service is temporarily unavailable. Please try again.`);
      } else if (response.status === 404) {
        throw new Error(`Knowledge base endpoint not found. Please check the API configuration.`);
      } else {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error fetching documents:', err);
    setError(err instanceof Error ? err.message : 'Failed to fetch documents');
  }
};
```

---

## Pattern 5: Object Validation and Safe Property Access

### ❌ Problem Pattern
```typescript
// Dangerous: Assumes object structure
const processUserData = (userData: any) => {
  const name = userData.profile.name; // CRASHES if profile is null
  const email = userData.contact.email; // CRASHES if contact is undefined
  const settings = userData.preferences.theme; // Multiple crash points
};
```

### ✅ Solution Pattern
```typescript
// Safe: Defensive property access
const processUserData = (userData: any) => {
  // Safe property access with fallbacks
  const name = userData?.profile?.name || 'Anonymous User';
  const email = userData?.contact?.email || 'No email provided';
  const theme = userData?.preferences?.theme || 'default';

  return { name, email, theme };
};
```

### 🔧 Reusable Object Validators
```typescript
/**
 * Safely extracts nested property with fallback
 */
export function safeGet<T>(
  obj: any,
  path: string,
  fallback: T
): T {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return fallback;
    }
  }

  return current !== undefined ? current : fallback;
}

/**
 * Validates object has required properties
 */
export function hasRequiredProps(
  obj: any,
  requiredProps: string[]
): boolean {
  if (!obj || typeof obj !== 'object') return false;

  return requiredProps.every(prop => {
    const keys = prop.split('.');
    let current = obj;

    for (const key of keys) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        return false;
      }
      current = current[key];
    }

    return current !== undefined;
  });
}

// Usage examples:
const userName = safeGet(userData, 'profile.name', 'Anonymous');
const isValid = hasRequiredProps(userData, ['id', 'profile.name', 'contact.email']);
```

---

## Pattern 6: Loading and Error State Management

### ❌ Problem Pattern
```tsx
// Dangerous: No loading/error states
function DataComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);

  return (
    <div>
      {data.map(item => <div key={item.id}>{item.name}</div>)} {/* CRASHES */}
    </div>
  );
}
```

### ✅ Solution Pattern
```tsx
// Safe: Comprehensive state management
interface DataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function DataComponent() {
  const [state, setState] = useState<DataState<any[]>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));

        const response = await fetch('/api/data');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const result = await response.json();
        const data = Array.isArray(result.data) ? result.data : [];

        setState({ data, loading: false, error: null });
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };

    fetchData();
  }, []);

  if (state.loading) {
    return <div>Loading...</div>;
  }

  if (state.error) {
    return (
      <div className="error">
        <p>Error: {state.error}</p>
        <button onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!state.data || state.data.length === 0) {
    return <div>No data available</div>;
  }

  return (
    <div>
      {state.data.map((item, index) => (
        <div key={item.id || `item-${index}`}>
          {item.name || 'Unnamed item'}
        </div>
      ))}
    </div>
  );
}
```

---

## Testing Patterns for Defensive Code

### 🧪 Unit Test Examples
```typescript
describe('Defensive Programming Patterns', () => {
  describe('safeArrayExtract', () => {
    test('handles null response', () => {
      expect(safeArrayExtract(null)).toEqual([]);
    });

    test('handles undefined data property', () => {
      expect(safeArrayExtract({ data: undefined })).toEqual([]);
    });

    test('handles non-array data', () => {
      expect(safeArrayExtract({ data: 'string' })).toEqual([]);
      expect(safeArrayExtract({ data: 123 })).toEqual([]);
      expect(safeArrayExtract({ data: {} })).toEqual([]);
    });

    test('returns valid arrays unchanged', () => {
      const input = { data: [1, 2, 3] };
      expect(safeArrayExtract(input)).toEqual([1, 2, 3]);
    });
  });

  describe('formatNumber', () => {
    test('handles invalid inputs', () => {
      expect(formatNumber(null as any)).toBe('0');
      expect(formatNumber(undefined as any)).toBe('0');
      expect(formatNumber('string' as any)).toBe('0');
      expect(formatNumber(NaN)).toBe('0');
    });

    test('formats valid numbers correctly', () => {
      expect(formatNumber(1234)).toBe('1.2K');
      expect(formatNumber(1234567)).toBe('1.2M');
      expect(formatNumber(123)).toBe('123');
    });
  });
});
```

---

## Quick Implementation Guide

### 🚀 Copy-Paste Code Snippets

```typescript
// 1. Safe API Response Handler
const handleApiResponse = async <T>(url: string): Promise<T[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    console.error('API Error:', error);
    return [];
  }
};

// 2. Safe Number Formatter
const safeFormat = (num: any, decimals = 0): string => {
  if (num == null || typeof num !== 'number' || isNaN(num)) return '0';
  return num.toFixed(decimals);
};

// 3. Safe Select Item
const SafeSelectItem = ({ value, children, ...props }: any) => (
  <SelectItem value={value || 'fallback'} {...props}>
    {children || 'Unnamed item'}
  </SelectItem>
);

// 4. Error Boundary Hook
const useErrorBoundary = () => {
  const [error, setError] = useState<string | null>(null);

  const resetError = () => setError(null);

  const handleError = (err: any) => {
    const message = err instanceof Error ? err.message : 'An error occurred';
    setError(message);
  };

  return { error, resetError, handleError };
};
```

---

**Remember**: These patterns are not just theoretical examples - they are proven solutions that fixed real production issues. Apply them consistently to prevent runtime errors and improve user experience.