// Mock modules before importing
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@/lib/cache/query-cache');

import { TitanEmbedder } from '@/lib/embeddings/titan-embedder';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { queryCache } from '@/lib/cache/query-cache';

const MockBedrockRuntimeClient = jest.mocked(BedrockRuntimeClient);
const MockInvokeModelCommand = jest.mocked(InvokeModelCommand);
const mockQueryCache = jest.mocked(queryCache);

describe('TitanEmbedder', () => {
  let titanEmbedder: TitanEmbedder;
  let mockClient: jest.Mocked<BedrockRuntimeClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the BedrockRuntimeClient instance
    mockClient = {
      send: jest.fn(),
    } as any;

    MockBedrockRuntimeClient.mockImplementation(() => mockClient);

    // Mock cache methods
    mockQueryCache.get = jest.fn();
    mockQueryCache.set = jest.fn();

    titanEmbedder = new TitanEmbedder();
  });

  describe('generateEmbedding', () => {
    it('successfully generates embedding for text input', async () => {
      const inputText = 'This is a test document for embedding generation.';
      const mockEmbedding = Array(1024).fill(0).map(() => Math.random());

      // Mock Bedrock response
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);
      mockQueryCache.get.mockResolvedValue(null); // No cache hit

      const result = await titanEmbedder.generateEmbedding(inputText);

      expect(result).toEqual({
        success: true,
        embedding: mockEmbedding,
        dimensions: 1024,
        inputText,
        inputTokens: expect.any(Number),
        processingTime: expect.any(Number),
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });

      expect(mockClient.send).toHaveBeenCalledWith(expect.any(MockInvokeModelCommand));
      expect(mockQueryCache.set).toHaveBeenCalled();
    });

    it('returns cached embedding when available', async () => {
      const inputText = 'Cached test document';
      const cachedEmbedding = Array(1024).fill(0).map(() => Math.random());

      const cachedResult = {
        success: true,
        embedding: cachedEmbedding,
        dimensions: 1024,
        inputText,
        inputTokens: 5,
        processingTime: 0,
        model: 'amazon.titan-embed-text-v2:0',
        cached: true
      };

      mockQueryCache.get.mockResolvedValue(cachedResult);

      const result = await titanEmbedder.generateEmbedding(inputText);

      expect(result).toEqual(cachedResult);
      expect(mockClient.send).not.toHaveBeenCalled();
    });

    it('handles empty input text', async () => {
      const result = await titanEmbedder.generateEmbedding('');

      expect(result).toEqual({
        success: false,
        error: 'Input text cannot be empty',
        embedding: null,
        dimensions: 0,
        inputText: '',
        inputTokens: 0,
        processingTime: expect.any(Number),
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });
    });

    it('handles text that exceeds maximum length', async () => {
      const longText = 'a'.repeat(5000); // Exceed max length

      const result = await titanEmbedder.generateEmbedding(longText);

      expect(result).toEqual({
        success: false,
        error: 'Input text exceeds maximum length of 4096 characters',
        embedding: null,
        dimensions: 0,
        inputText: longText,
        inputTokens: expect.any(Number),
        processingTime: expect.any(Number),
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });
    });

    it('handles AWS API errors gracefully', async () => {
      const inputText = 'Test document';
      const apiError = new Error('AWS API Error');

      mockClient.send.mockRejectedValue(apiError);
      mockQueryCache.get.mockResolvedValue(null);

      const result = await titanEmbedder.generateEmbedding(inputText);

      expect(result).toEqual({
        success: false,
        error: 'Failed to generate embedding: AWS API Error',
        embedding: null,
        dimensions: 0,
        inputText,
        inputTokens: expect.any(Number),
        processingTime: expect.any(Number),
        model: 'amazon.titan-embed-text-v2:0',
        cached: false,
        retryCount: 0
      });
    });

    it('retries on failure and succeeds on second attempt', async () => {
      const inputText = 'Retry test document';
      const mockEmbedding = Array(1024).fill(0).map(() => Math.random());

      // First call fails, second succeeds
      mockClient.send
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          body: new TextEncoder().encode(JSON.stringify({
            embedding: mockEmbedding
          }))
        });

      mockQueryCache.get.mockResolvedValue(null);

      const result = await titanEmbedder.generateEmbeddingWithRetry(inputText, 2);

      expect(result).toEqual({
        success: true,
        embedding: mockEmbedding,
        dimensions: 1024,
        inputText,
        inputTokens: expect.any(Number),
        processingTime: expect.any(Number),
        model: 'amazon.titan-embed-text-v2:0',
        cached: false,
        retryCount: 1
      });

      expect(mockClient.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateEmbeddingsBatch', () => {
    it('successfully generates embeddings for multiple texts', async () => {
      const inputTexts = [
        'First test document',
        'Second test document',
        'Third test document'
      ];

      const mockEmbeddings = inputTexts.map(() =>
        Array(1024).fill(0).map(() => Math.random())
      );

      // Mock individual responses
      mockEmbeddings.forEach((embedding, index) => {
        mockClient.send.mockResolvedValueOnce({
          body: new TextEncoder().encode(JSON.stringify({
            embedding
          }))
        });
      });

      mockQueryCache.get.mockResolvedValue(null); // No cache hits

      const results = await titanEmbedder.generateEmbeddingsBatch(inputTexts);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result).toEqual({
          success: true,
          embedding: mockEmbeddings[index],
          dimensions: 1024,
          inputText: inputTexts[index],
          inputTokens: expect.any(Number),
          processingTime: expect.any(Number),
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        });
      });

      expect(mockClient.send).toHaveBeenCalledTimes(3);
    });

    it('handles batch size limits correctly', async () => {
      const inputTexts = Array(15).fill(0).map((_, i) => `Document ${i + 1}`);
      const mockEmbedding = Array(1024).fill(0).map(() => Math.random());

      mockClient.send.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      });

      mockQueryCache.get.mockResolvedValue(null);

      const results = await titanEmbedder.generateEmbeddingsBatch(inputTexts, 5);

      expect(results).toHaveLength(15);
      // Should be called 15 times with rate limiting
      expect(mockClient.send).toHaveBeenCalledTimes(15);
    });

    it('handles mixed success and failure in batch', async () => {
      const inputTexts = ['Success document', '', 'Another success'];

      const mockEmbedding = Array(1024).fill(0).map(() => Math.random());
      mockClient.send.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      });

      mockQueryCache.get.mockResolvedValue(null);

      const results = await titanEmbedder.generateEmbeddingsBatch(inputTexts);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false); // Empty string
      expect(results[2].success).toBe(true);
    });
  });

  describe('validateInput', () => {
    it('validates normal text correctly', () => {
      const result = titanEmbedder.validateInput('Normal text input');
      expect(result).toEqual({ isValid: true });
    });

    it('rejects empty text', () => {
      const result = titanEmbedder.validateInput('');
      expect(result).toEqual({
        isValid: false,
        error: 'Input text cannot be empty'
      });
    });

    it('rejects text exceeding maximum length', () => {
      const longText = 'a'.repeat(5000);
      const result = titanEmbedder.validateInput(longText);
      expect(result).toEqual({
        isValid: false,
        error: 'Input text exceeds maximum length of 4096 characters'
      });
    });

    it('rejects non-string input', () => {
      const result = titanEmbedder.validateInput(null as any);
      expect(result).toEqual({
        isValid: false,
        error: 'Input text must be a string'
      });
    });
  });

  describe('preprocessText', () => {
    it('normalizes text correctly', () => {
      const input = '  Multiple   spaces\n\nand newlines  ';
      const result = titanEmbedder.preprocessText(input);
      expect(result).toBe('Multiple spaces and newlines');
    });

    it('preserves important punctuation', () => {
      const input = 'Hello, world! How are you?';
      const result = titanEmbedder.preprocessText(input);
      expect(result).toBe('Hello, world! How are you?');
    });

    it('handles special characters appropriately', () => {
      const input = 'Test—with—em-dashes and "smart quotes"';
      const result = titanEmbedder.preprocessText(input);
      expect(result).toBe('Test—with—em-dashes and "smart quotes"');
    });
  });

  describe('estimateTokenCount', () => {
    it('estimates token count for normal text', () => {
      const text = 'This is a test document with multiple words.';
      const tokenCount = titanEmbedder.estimateTokenCount(text);
      expect(tokenCount).toBeGreaterThan(0);
      expect(tokenCount).toBeLessThan(text.length); // Should be less than character count
    });

    it('handles empty text', () => {
      const tokenCount = titanEmbedder.estimateTokenCount('');
      expect(tokenCount).toBe(0);
    });
  });

  describe('getHealthStatus', () => {
    it('returns healthy status when client is working', async () => {
      mockClient.send.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: Array(1024).fill(0)
        }))
      });

      const status = await titanEmbedder.getHealthStatus();

      expect(status).toEqual({
        healthy: true,
        model: 'amazon.titan-embed-text-v2:0',
        region: 'us-east-1',
        dimensions: 1024,
        lastChecked: expect.any(Date),
        responseTime: expect.any(Number)
      });
    });

    it('returns unhealthy status when client fails', async () => {
      mockClient.send.mockRejectedValue(new Error('Health check failed'));

      const status = await titanEmbedder.getHealthStatus();

      expect(status).toEqual({
        healthy: false,
        model: 'amazon.titan-embed-text-v2:0',
        region: 'us-east-1',
        dimensions: 1024,
        lastChecked: expect.any(Date),
        error: 'Health check failed'
      });
    });
  });
});