# Vector Search API Usage Examples

## Knowledge Base Search API

### Endpoint
`POST /api/v1/knowledge-base/search`

### Request Format
```json
{
  "query": "string (required) - Search query text",
  "limit": "number (optional, default: 10) - Max results to return",
  "threshold": "number (optional, default: 0.7) - Similarity threshold (0-1)",
  "filters": {
    "documentTypes": ["string"] // Optional document type filters
    "categories": ["string"],   // Optional category filters
    "supplierIds": ["uuid"],    // Optional supplier filters
    "documentIds": ["uuid"],    // Optional specific document filters
    "dateRange": {
      "from": "ISO date string",
      "to": "ISO date string"
    }
  },
  "includeContent": "boolean (optional, default: true) - Include chunk content",
  "cacheResults": "boolean (optional, default: true) - Enable result caching"
}
```

### Response Format
```json
{
  "success": true,
  "data": {
    "query": "artificial intelligence machine learning",
    "results": [
      {
        "documentId": "uuid",
        "chunkId": "uuid",
        "content": "Full chunk content...",
        "similarity": 0.95,
        "metadata": {
          "documentName": "Document Title",
          "category": "scientific",
          "supplier": "Company Name",
          "tags": ["AI", "ML"],
          "chunkIndex": 0
        }
      }
    ],
    "totalResults": 10,
    "searchTime": 45,
    "cached": false,
    "filters": {}
  }
}
```

## Usage Examples

### Basic Search
```javascript
const response = await fetch('/api/v1/knowledge-base/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-auth-token'
  },
  body: JSON.stringify({
    query: 'machine learning algorithms',
    limit: 5,
    threshold: 0.8
  })
});

const data = await response.json();
console.log('Search results:', data.data.results);
```

### Advanced Search with Filters
```javascript
const searchWithFilters = await fetch('/api/v1/knowledge-base/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-auth-token'
  },
  body: JSON.stringify({
    query: 'product specifications safety data',
    limit: 10,
    threshold: 0.75,
    filters: {
      categories: ['safety', 'compliance'],
      dateRange: {
        from: '2024-01-01T00:00:00Z',
        to: '2024-12-31T23:59:59Z'
      }
    },
    includeContent: true,
    cacheResults: true
  })
});
```

### React Component Integration
```tsx
import { useState } from 'react';

export function VectorSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const performSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/v1/knowledge-base/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          query,
          limit: 20,
          threshold: 0.7,
          includeContent: true
        })
      });

      const data = await response.json();
      if (data.success) {
        setResults(data.data.results);
      } else {
        console.error('Search failed:', data.error);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter search query..."
        onKeyDown={(e) => e.key === 'Enter' && performSearch()}
      />
      <button onClick={performSearch} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </button>

      <div>
        {results.map((result, index) => (
          <div key={result.chunkId} className="search-result">
            <h4>{result.metadata.documentName}</h4>
            <p>Similarity: {(result.similarity * 100).toFixed(1)}%</p>
            <p>{result.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Error Handling

### Common Error Responses
```json
// Authentication Error
{
  "success": false,
  "error": {
    "message": "Authentication required",
    "code": "UNAUTHORIZED"
  }
}

// Validation Error
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "query",
        "message": "Query is required"
      }
    ]
  }
}

// Search Service Error
{
  "success": false,
  "error": {
    "message": "Vector search failed",
    "code": "SEARCH_ERROR"
  }
}
```

### Error Handling Best Practices
```javascript
const handleSearch = async (searchQuery) => {
  try {
    const response = await fetch('/api/v1/knowledge-base/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery })
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Handle authentication error
        redirectToLogin();
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error.message || 'Search failed');
    }

    return data.data.results;
  } catch (error) {
    console.error('Search error:', error);
    showErrorMessage('Search failed. Please try again.');
    return [];
  }
};
```