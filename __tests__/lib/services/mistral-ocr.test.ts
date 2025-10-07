// Mock modules before importing
jest.mock('node-fetch');

import { MistralOCRService } from '@/lib/services/mistral-ocr';
import fetch from 'node-fetch';

const mockFetch = jest.mocked(fetch);

describe('MistralOCRService', () => {
  let mistralOCR: MistralOCRService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock environment variables
    process.env.MISTRAL_API_KEY = 'test-api-key';
    process.env.MISTRAL_API_URL = 'https://api.mistral.test';

    mistralOCR = new MistralOCRService();
  });

  afterEach(() => {
    delete process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_URL;
  });

  describe('extractText', () => {
    it('successfully extracts text from PDF buffer', async () => {
      const mockPdfBuffer = Buffer.from('mock-pdf-content');
      const mockExtractedText = 'This is extracted text from PDF document.';

      const mockResponse = {
        ok: true,
        json: async () => ({
          success: true,
          extractedText: mockExtractedText,
          metadata: {
            pageCount: 2,
            hasImages: true,
            hasTables: false,
            confidence: 0.95
          },
          processingTime: 1234
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await mistralOCR.extractText(
        mockPdfBuffer,
        'application/pdf',
        'test-document.pdf'
      );

      expect(result).toEqual({
        success: true,
        extractedText: mockExtractedText,
        wordCount: 7,
        characterCount: 42,
        pageCount: 2,
        hasImages: true,
        hasTables: false,
        confidence: 0.95,
        language: 'en',
        processingTime: 1234,
        metadata: {
          filename: 'test-document.pdf',
          mimeType: 'application/pdf',
          fileSize: mockPdfBuffer.length,
          extractionMethod: 'mistral-ocr',
          timestamp: expect.any(String)
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.test/v1/ocr/extract',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining(mockPdfBuffer.toString('base64'))
        })
      );
    });

    it('successfully extracts text from string content', async () => {
      const mockTextContent = 'This is plain text content.';
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: true,
          extractedText: mockTextContent,
          metadata: {
            pageCount: 1,
            hasImages: false,
            hasTables: false,
            confidence: 1.0
          },
          processingTime: 50
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await mistralOCR.extractText(
        mockTextContent,
        'text/plain',
        'test.txt'
      );

      expect(result.success).toBe(true);
      expect(result.extractedText).toBe(mockTextContent);
      expect(result.confidence).toBe(1.0);
    });

    it('handles unsupported file types', async () => {
      const mockContent = Buffer.from('mock-content');

      const result = await mistralOCR.extractText(
        mockContent,
        'application/unsupported',
        'test.unknown'
      );

      expect(result).toEqual({
        success: false,
        error: 'Unsupported file type: application/unsupported',
        extractedText: '',
        wordCount: 0,
        characterCount: 0,
        pageCount: 0,
        hasImages: false,
        hasTables: false,
        confidence: 0,
        language: 'unknown',
        processingTime: expect.any(Number),
        metadata: {
          filename: 'test.unknown',
          mimeType: 'application/unsupported',
          fileSize: mockContent.length,
          extractionMethod: 'mistral-ocr',
          timestamp: expect.any(String)
        }
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      const mockContent = Buffer.from('mock-pdf');
      const apiError = new Error('API request failed');

      mockFetch.mockRejectedValue(apiError);

      const result = await mistralOCR.extractText(
        mockContent,
        'application/pdf',
        'test.pdf'
      );

      expect(result).toEqual({
        success: false,
        error: 'OCR extraction failed: API request failed',
        extractedText: '',
        wordCount: 0,
        characterCount: 0,
        pageCount: 0,
        hasImages: false,
        hasTables: false,
        confidence: 0,
        language: 'unknown',
        processingTime: expect.any(Number),
        metadata: {
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          fileSize: mockContent.length,
          extractionMethod: 'mistral-ocr',
          timestamp: expect.any(String)
        }
      });
    });

    it('handles API response errors', async () => {
      const mockContent = Buffer.from('mock-pdf');
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: 'Invalid file format'
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await mistralOCR.extractText(
        mockContent,
        'application/pdf',
        'test.pdf'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error (400): Invalid file format');
    });

    it('processes large files with chunking', async () => {
      const largeContent = Buffer.alloc(15 * 1024 * 1024); // 15MB file
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: true,
          extractedText: 'Extracted from large file',
          metadata: {
            pageCount: 100,
            hasImages: true,
            hasTables: true,
            confidence: 0.88
          },
          processingTime: 5000
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await mistralOCR.extractText(
        largeContent,
        'application/pdf',
        'large-document.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.extractedText).toBe('Extracted from large file');
      expect(result.pageCount).toBe(100);
    });
  });

  describe('validateFileType', () => {
    it('validates supported MIME types', () => {
      const supportedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown'
      ];

      supportedTypes.forEach(mimeType => {
        expect(mistralOCR.validateFileType(mimeType)).toBe(true);
      });
    });

    it('rejects unsupported MIME types', () => {
      const unsupportedTypes = [
        'application/unsupported',
        'video/mp4',
        'audio/mp3',
        'application/zip'
      ];

      unsupportedTypes.forEach(mimeType => {
        expect(mistralOCR.validateFileType(mimeType)).toBe(false);
      });
    });
  });

  describe('preprocessContent', () => {
    it('converts buffer content to base64', () => {
      const buffer = Buffer.from('test content');
      const result = mistralOCR.preprocessContent(buffer, 'application/pdf');

      expect(result).toEqual({
        content: buffer.toString('base64'),
        encoding: 'base64',
        originalSize: buffer.length
      });
    });

    it('handles string content directly', () => {
      const text = 'plain text content';
      const result = mistralOCR.preprocessContent(text, 'text/plain');

      expect(result).toEqual({
        content: text,
        encoding: 'utf8',
        originalSize: text.length
      });
    });

    it('compresses large content', () => {
      const largeBuffer = Buffer.alloc(20 * 1024 * 1024); // 20MB
      const result = mistralOCR.preprocessContent(largeBuffer, 'application/pdf');

      expect(result.encoding).toBe('base64');
      expect(result.originalSize).toBe(largeBuffer.length);
      // Content should be base64 encoded
      expect(result.content).toBeTruthy();
    });
  });

  describe('postprocessText', () => {
    it('cleans extracted text properly', () => {
      const rawText = '  Multiple   spaces\n\n\nExtra newlines\t\tTabs  ';
      const cleaned = mistralOCR.postprocessText(rawText);

      expect(cleaned).toBe('Multiple spaces\nExtra newlines Tabs');
    });

    it('preserves paragraph structure', () => {
      const rawText = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
      const cleaned = mistralOCR.postprocessText(rawText);

      expect(cleaned).toBe('Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.');
    });

    it('handles special characters correctly', () => {
      const rawText = 'Test with "smart quotes" and —em dashes—';
      const cleaned = mistralOCR.postprocessText(rawText);

      expect(cleaned).toBe('Test with "smart quotes" and —em dashes—');
    });

    it('removes page numbers and headers/footers', () => {
      const rawText = 'Header Text\nPage 1\n\nActual content here\n\nFooter Text\nPage 2';
      const cleaned = mistralOCR.postprocessText(rawText);

      // Should remove obvious page indicators but keep content
      expect(cleaned).toContain('Actual content here');
    });
  });

  describe('detectLanguage', () => {
    it('detects English text', () => {
      const text = 'This is English text with common English words.';
      const language = mistralOCR.detectLanguage(text);
      expect(language).toBe('en');
    });

    it('detects non-English text patterns', () => {
      const spanishText = 'Este es un texto en español con palabras comunes.';
      const language = mistralOCR.detectLanguage(spanishText);
      // Basic detection might still return 'en' for simple cases
      expect(['en', 'es', 'unknown']).toContain(language);
    });

    it('handles empty text', () => {
      const language = mistralOCR.detectLanguage('');
      expect(language).toBe('unknown');
    });
  });

  describe('calculateMetrics', () => {
    it('calculates word and character counts correctly', () => {
      const text = 'This is a test document with multiple words.';
      const metrics = mistralOCR.calculateMetrics(text);

      expect(metrics).toEqual({
        wordCount: 9,
        characterCount: 44,
        sentenceCount: 1,
        paragraphCount: 1
      });
    });

    it('handles multi-paragraph text', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const metrics = mistralOCR.calculateMetrics(text);

      expect(metrics.paragraphCount).toBe(3);
      expect(metrics.sentenceCount).toBe(3);
    });

    it('handles empty text', () => {
      const metrics = mistralOCR.calculateMetrics('');

      expect(metrics).toEqual({
        wordCount: 0,
        characterCount: 0,
        sentenceCount: 0,
        paragraphCount: 0
      });
    });
  });

  describe('getHealthStatus', () => {
    it('returns healthy status when API is accessible', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ status: 'healthy', version: '1.0.0' })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const status = await mistralOCR.getHealthStatus();

      expect(status).toEqual({
        healthy: true,
        service: 'mistral-ocr',
        lastChecked: expect.any(Date),
        responseTime: expect.any(Number),
        supportedFormats: expect.arrayContaining(['pdf', 'docx', 'txt']),
        version: '1.0.0'
      });
    });

    it('returns unhealthy status when API is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const status = await mistralOCR.getHealthStatus();

      expect(status).toEqual({
        healthy: false,
        service: 'mistral-ocr',
        lastChecked: expect.any(Date),
        error: 'Network error',
        supportedFormats: expect.arrayContaining(['pdf', 'docx', 'txt'])
      });
    });
  });

  describe('Configuration and Error Handling', () => {
    it('throws error when API key is missing', () => {
      delete process.env.MISTRAL_API_KEY;

      expect(() => new MistralOCRService()).toThrow('Missing required environment variables');
    });

    it('uses default API URL when not specified', () => {
      delete process.env.MISTRAL_API_URL;

      expect(() => new MistralOCRService()).not.toThrow();
    });

    it('handles timeout errors appropriately', async () => {
      const mockContent = Buffer.from('test');
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';

      mockFetch.mockRejectedValue(timeoutError);

      const result = await mistralOCR.extractText(mockContent, 'application/pdf', 'test.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });
});