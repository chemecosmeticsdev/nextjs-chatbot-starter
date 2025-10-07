import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * AWS Titan v2 Embeddings Service
 *
 * Provides comprehensive embedding generation capabilities using AWS Bedrock
 * Titan Text Embeddings v2 model with 1024-dimensional vectors.
 */
export class TitanEmbedder {
  private client: BedrockRuntimeClient;
  private modelId = 'amazon.titan-embed-text-v2:0';
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
      },
      maxAttempts: this.maxRetries,
    });
  }

  /**
   * Generate embedding for a single text
   *
   * @param text - Input text to embed (max 8000 tokens)
   * @returns Promise<number[]> - 1024-dimensional embedding vector
   */
  async generateEmbedding(
    text: string
  ): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text input cannot be empty');
    }

    // Validate text length (approximate token limit)
    const estimatedTokens = this.estimateTokens(text);
    if (estimatedTokens > 8000) {
      throw new Error(`Text too long: ${estimatedTokens} tokens (max 8000)`);
    }

    // Ensure payload is properly formatted for Titan v2 model
    const payload = {
      inputText: text.trim(),
      dimensions: 1024,
      normalize: true,
    };

    // Validate payload before sending
    if (!payload.inputText || payload.inputText.length === 0) {
      throw new Error('Input text cannot be empty after trimming');
    }

    const serializedPayload = JSON.stringify(payload);
    console.log(`[TitanEmbedder] Request payload length: ${serializedPayload.length} chars`);

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: serializedPayload,
    });

    try {
      const response = await this.client.send(command);

      if (!response.body) {
        throw new Error('Empty response body from Bedrock');
      }

      const responseBody = JSON.parse(
        new TextDecoder().decode(response.body)
      );

      console.log(`[TitanEmbedder] Response status: ${response.$metadata.httpStatusCode}`);

      if (!responseBody.embedding || !Array.isArray(responseBody.embedding)) {
        console.error('[TitanEmbedder] Invalid response format:', responseBody);
        throw new Error(`Invalid embedding response format. Expected array, got: ${typeof responseBody.embedding}`);
      }

      if (responseBody.embedding.length !== 1024) {
        console.warn(`[TitanEmbedder] Unexpected embedding dimensions: ${responseBody.embedding.length} (expected 1024)`);
      }

      return responseBody.embedding;
    } catch (error) {
      // Enhanced error logging for AWS Bedrock issues
      if (error instanceof Error) {
        console.error('[TitanEmbedder] Detailed error:', {
          message: error.message,
          name: error.name,
          stack: error.stack?.substring(0, 500),
          modelId: this.modelId,
          payloadLength: serializedPayload.length
        });

        // Check for specific AWS Bedrock errors
        if (error.message.includes('ValidationException')) {
          throw new Error(`AWS Bedrock validation error: ${error.message}. Check model ID and payload format.`);
        }
        if (error.message.includes('AccessDeniedException')) {
          throw new Error(`AWS Bedrock access denied: ${error.message}. Check credentials and permissions.`);
        }
        if (error.message.includes('ThrottlingException')) {
          throw new Error(`AWS Bedrock throttling: ${error.message}. Reduce request rate.`);
        }
      }

      console.error('[TitanEmbedder] Embedding generation failed:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch with rate limiting
   *
   * @param texts - Array of texts to embed
   * @param maxConcurrency - Maximum concurrent requests (default: 10)
   * @returns Promise<number[][]> - Array of 1024-dimensional embedding vectors
   */
  async generateEmbeddingsBatch(
    texts: string[],
    maxConcurrency: number = 10
  ): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    const results: number[][] = new Array(texts.length);
    const semaphore = new Semaphore(maxConcurrency);
    const errors: Array<{ index: number; error: string }> = [];

    const promises = texts.map(async (text, index) => {
      await semaphore.acquire();
      try {
        const embedding = await this.generateEmbedding(text);
        results[index] = embedding;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ index, error: errorMessage });
        console.error(`Failed to generate embedding for text ${index}:`, errorMessage);
        // Store empty array for failed embeddings to maintain array structure
        results[index] = [];
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);

    if (errors.length > 0) {
      console.warn(`${errors.length}/${texts.length} embeddings failed:`, errors);
    }

    return results;
  }

  /**
   * Generate embeddings with retry logic for improved reliability
   *
   * @param text - Input text to embed
   * @param retryCount - Current retry attempt (used internally)
   * @returns Promise<number[]> - 1024-dimensional embedding vector
   */
  async generateEmbeddingWithRetry(
    text: string,
    retryCount: number = 0
  ): Promise<number[]> {
    try {
      return await this.generateEmbedding(text);
    } catch (error) {
      if (retryCount >= this.maxRetries) {
        throw error;
      }

      const delay = this.baseDelay * Math.pow(2, retryCount);
      console.log(`Retrying embedding generation in ${delay}ms (attempt ${retryCount + 1})`);

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.generateEmbeddingWithRetry(text, retryCount + 1);
    }
  }

  /**
   * Estimate cost for embedding generation
   *
   * @param tokenCount - Number of input tokens
   * @returns number - Estimated cost in USD
   */
  estimateCost(tokenCount: number): number {
    // Titan Embedding v2 pricing: $0.0001 per 1K tokens
    const costPer1KTokens = 0.0001;
    return (tokenCount / 1000) * costPer1KTokens;
  }

  /**
   * Estimate cost for a batch of texts
   *
   * @param texts - Array of texts
   * @returns number - Estimated total cost in USD
   */
  estimateBatchCost(texts: string[]): number {
    const totalTokens = texts.reduce((sum, text) => sum + this.estimateTokens(text), 0);
    return this.estimateCost(totalTokens);
  }

  /**
   * Estimate token count for a text (rough approximation)
   *
   * @param text - Input text
   * @returns number - Estimated token count
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 0.75 words for English text
    const words = text.split(/\s+/).length;
    return Math.ceil(words * 1.33);
  }

  /**
   * Validate embedding vector format and dimensions
   *
   * @param embedding - Embedding vector to validate
   * @returns boolean - True if valid
   */
  validateEmbedding(embedding: number[]): boolean {
    return (
      Array.isArray(embedding) &&
      embedding.length === 1024 &&
      embedding.every(val => typeof val === 'number' && !isNaN(val))
    );
  }

  /**
   * Get service health status
   *
   * @returns Promise<object> - Health status information
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      // Test with a simple text
      await this.generateEmbedding("Health check test");
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Simple semaphore implementation for rate limiting
 */
class Semaphore {
  private current = 0;
  private waiting: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.current--;
    const next = this.waiting.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}

// Export singleton instance
export const titanEmbedder = new TitanEmbedder();

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
  cost: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
  totalCost: number;
  successCount: number;
  failureCount: number;
}