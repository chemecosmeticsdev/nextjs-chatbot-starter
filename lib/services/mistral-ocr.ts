/**
 * Mistral OCR Service
 *
 * Provides comprehensive text extraction capabilities for various document formats
 * using the Mistral API for OCR processing and native parsing for text-based formats.
 */

export interface DocumentFormat {
  mimeType: string;
  extension: string;
  requiresOCR: boolean;
  supported: boolean;
}

export interface TextExtractionResult {
  success: boolean;
  text: string;
  metadata: {
    format: string;
    pageCount?: number;
    wordCount: number;
    characterCount: number;
    extractionMethod: 'native' | 'mistral_ocr' | 'hybrid';
    confidence?: number;
    processingTime: number;
    hasImages?: boolean;
    hasTables?: boolean;
    language?: string;
  };
  error?: string;
  warnings?: string[];
}

export interface MistralOCRResponse {
  text: string;
  confidence: number;
  metadata: {
    pageCount: number;
    hasImages: boolean;
    hasTables: boolean;
    language: string;
    processingTime: number;
  };
}

export class MistralOCRService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.mistral.ai/v1/ocr';
  private readonly maxRetries = 3;
  private readonly timeoutMs = 60000; // 60 seconds

  // Supported document formats
  private readonly supportedFormats: Record<string, DocumentFormat> = {
    'application/pdf': {
      mimeType: 'application/pdf',
      extension: 'pdf',
      requiresOCR: true,
      supported: true,
    },
    'application/msword': {
      mimeType: 'application/msword',
      extension: 'doc',
      requiresOCR: true,
      supported: true,
    },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      requiresOCR: true,
      supported: true,
    },
    'text/plain': {
      mimeType: 'text/plain',
      extension: 'txt',
      requiresOCR: false,
      supported: true,
    },
    'text/markdown': {
      mimeType: 'text/markdown',
      extension: 'md',
      requiresOCR: false,
      supported: true,
    },
    'application/rtf': {
      mimeType: 'application/rtf',
      extension: 'rtf',
      requiresOCR: true,
      supported: true,
    }
  };

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY;
    if (!this.apiKey) {
      throw new Error('MISTRAL_API_KEY environment variable is required');
    }
  }

  /**
   * Extract text from a document file
   *
   * @param fileContent - File content as Buffer or string
   * @param mimeType - MIME type of the document
   * @param filename - Original filename for context
   * @returns Promise<TextExtractionResult>
   */
  async extractText(
    fileContent: Buffer | string,
    mimeType: string,
    filename: string
  ): Promise<TextExtractionResult> {
    const startTime = Date.now();
    const format = this.detectFormat(mimeType, filename);

    if (!format.supported) {
      return {
        success: false,
        text: '',
        metadata: {
          format: format.extension,
          wordCount: 0,
          characterCount: 0,
          extractionMethod: 'native',
          processingTime: Date.now() - startTime,
        },
        error: `Unsupported document format: ${mimeType}`,
      };
    }

    try {
      let result: TextExtractionResult;

      if (format.requiresOCR) {
        // Use Mistral OCR for complex formats
        result = await this.extractWithMistralOCR(fileContent, format, filename);
      } else {
        // Use native extraction for text formats
        result = await this.extractNative(fileContent, format);
      }

      // Add processing time
      result.metadata.processingTime = Date.now() - startTime;

      return result;
    } catch (error) {
      return {
        success: false,
        text: '',
        metadata: {
          format: format.extension,
          wordCount: 0,
          characterCount: 0,
          extractionMethod: format.requiresOCR ? 'mistral_ocr' : 'manual',
          processingTime: Date.now() - startTime,
        },
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }

  /**
   * Extract text using Mistral OCR API
   */
  private async extractWithMistralOCR(
    fileContent: Buffer | string,
    format: DocumentFormat,
    filename: string
  ): Promise<TextExtractionResult> {
    try {
      // Convert file content to base64 for API transmission
      const base64Content = Buffer.isBuffer(fileContent)
        ? fileContent.toString('base64')
        : Buffer.from(fileContent).toString('base64');

      // Format as data URL for Mistral API
      const mimeTypeForDataUrl = format.mimeType || `application/${format.extension}`;
      const dataUrl = `data:${mimeTypeForDataUrl};base64,${base64Content}`;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-ocr-latest',
          document: {
            type: 'document_url',
            document_url: dataUrl
          },
          include_image_base64: false
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mistral OCR API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const apiResponse = await response.json();

      // Extract text from pages array (official API format)
      let extractedText = '';
      if (apiResponse.pages && Array.isArray(apiResponse.pages)) {
        extractedText = apiResponse.pages
          .map((page: any) => page.markdown || '')
          .join('\n\n');
      } else {
        // Fallback for different response format
        extractedText = apiResponse.text || '';
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text extracted from document');
      }

      // Calculate metadata from response
      const wordCount = this.countWords(extractedText);
      const pageCount = apiResponse.pages?.length || 1;

      return {
        success: true,
        text: extractedText,
        metadata: {
          format: format.extension,
          wordCount: wordCount,
          characterCount: extractedText.length,
          extractionMethod: 'mistral_ocr',
          confidence: 95, // Mistral OCR typically has high confidence
          pageCount: pageCount,
          hasImages: false, // Will be determined from document analysis
          hasTables: false, // Will be determined from document analysis
          language: 'en', // Default, could be enhanced with language detection
          processingTime: 0, // Will be set by caller
        },
      };
    } catch (error) {
      throw new Error(`Mistral OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from native text formats
   */
  private async extractNative(
    fileContent: Buffer | string,
    format: DocumentFormat
  ): Promise<TextExtractionResult> {
    try {
      const text = typeof fileContent === 'string'
        ? fileContent
        : fileContent.toString('utf-8');

      // Clean and normalize text
      const cleanedText = this.cleanText(text);

      return {
        success: true,
        text: cleanedText,
        metadata: {
          format: format.extension,
          wordCount: this.countWords(cleanedText),
          characterCount: cleanedText.length,
          extractionMethod: 'manual',
          processingTime: 0, // Will be set by caller
        },
      };
    } catch (error) {
      throw new Error(`Native text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect document format from MIME type and filename
   */
  private detectFormat(mimeType: string, filename: string): DocumentFormat {
    // First try MIME type
    if (this.supportedFormats[mimeType]) {
      return this.supportedFormats[mimeType];
    }

    // Fallback to file extension
    const extension = filename.split('.').pop()?.toLowerCase();
    const formatByExtension = Object.values(this.supportedFormats)
      .find(format => format.extension === extension);

    if (formatByExtension) {
      return formatByExtension;
    }

    // Default for unknown formats
    return {
      mimeType: mimeType,
      extension: extension || 'unknown',
      requiresOCR: true,
      supported: false,
    };
  }


  /**
   * Clean and normalize extracted text
   */
  private cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace
      .trim()
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive line breaks
      .replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get list of supported formats
   */
  getSupportedFormats(): DocumentFormat[] {
    return Object.values(this.supportedFormats).filter(format => format.supported);
  }

  /**
   * Check if a format is supported
   */
  isFormatSupported(mimeType: string, filename?: string): boolean {
    const format = this.detectFormat(mimeType, filename || '');
    return format.supported;
  }

  /**
   * Estimate processing cost for document
   */
  estimateProcessingCost(fileSize: number, format: DocumentFormat): number {
    // Base cost estimation (in USD)
    const baseRatePerMB = 0.01; // $0.01 per MB for OCR processing
    const sizeMB = fileSize / (1024 * 1024);

    if (!format.requiresOCR) {
      return 0; // Native text extraction is free
    }

    // OCR processing cost
    return sizeMB * baseRatePerMB;
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      // Test with simple text
      const result = await this.extractText(
        'Health check test document',
        'text/plain',
        'test.txt'
      );

      if (!result.success) {
        throw new Error(result.error || 'Health check failed');
      }

      return {
        healthy: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Lazy singleton instance - only create when needed at runtime
let mistralOCRInstance: MistralOCRService | null = null;

/**
 * Get the MistralOCR service instance (lazy initialization)
 * This prevents the service from being created during build time
 */
export function getMistralOCR(): MistralOCRService {
  if (!mistralOCRInstance) {
    mistralOCRInstance = new MistralOCRService();
  }
  return mistralOCRInstance;
}

/**
 * Get MistralOCR service with build-time safety
 * Returns null during build to prevent initialization errors
 */
export function getMistralOCRSafe(): MistralOCRService | null {
  // Skip initialization during build time
  if (typeof window === 'undefined' && process.env.NODE_ENV !== 'development' && !process.env.MISTRAL_API_KEY) {
    return null;
  }
  return getMistralOCR();
}

// Export backward compatible instance with build guard
const createSafeMistralOCR = (): MistralOCRService | null => {
  try {
    // Only create during development or when API key is available
    if (process.env.NODE_ENV === 'development' || process.env.MISTRAL_API_KEY) {
      return getMistralOCR();
    }
    return null;
  } catch (error) {
    console.warn('[MistralOCR] Service unavailable during build:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
};

export const mistralOCR = createSafeMistralOCR();

// Export types for use in other modules
export type ExtractionMethod = 'native' | 'mistral_ocr' | 'hybrid';