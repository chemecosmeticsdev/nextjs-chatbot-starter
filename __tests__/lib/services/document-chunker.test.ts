// Mock modules before importing
jest.mock('@/lib/db/connection');
jest.mock('@/lib/services/analytics');

import { DocumentChunker } from '@/lib/services/document-chunker';
import { db } from '@/lib/db/connection';
import { analyticsService } from '@/lib/services/analytics';

const mockDb = jest.mocked(db);
const mockAnalyticsService = jest.mocked(analyticsService);

describe('DocumentChunker', () => {
  let documentChunker: DocumentChunker;

  beforeEach(() => {
    jest.clearAllMocks();
    documentChunker = new DocumentChunker();
  });

  describe('chunk', () => {
    it('successfully chunks document using single chunk strategy for short documents', async () => {
      const documentId = 'doc-123';
      const text = 'This is a short document for testing purposes.';
      const documentType = 'sds';
      const tokenCount = 10;

      const result = await documentChunker.chunk(documentId, text, documentType, tokenCount);

      expect(result).toEqual({
        success: true,
        chunks: [{
          chunkId: expect.any(String),
          documentId,
          chunkIndex: 0,
          content: text,
          tokenCount: 10,
          startPosition: 0,
          endPosition: text.length,
          metadata: {
            strategy: 'single_chunk',
            chunkType: 'document',
            hasOverlap: false
          }
        }],
        strategy: 'single_chunk',
        totalChunks: 1,
        totalTokens: 10,
        processingTime: expect.any(Number),
        metadata: {
          documentType,
          averageChunkSize: 10,
          overlapTokens: 0,
          chunkSizeVariance: 0
        }
      });
    });

    it('uses semantic chunking strategy for medium documents', async () => {
      const documentId = 'doc-456';
      const longText = 'Chapter 1: Introduction\n\nThis is the first chapter with detailed information about the topic. It contains multiple paragraphs and sections.\n\nSection 1.1: Overview\n\nHere we provide an overview of the concepts that will be discussed.\n\nChapter 2: Technical Details\n\nThis chapter covers the technical aspects in detail.';
      const documentType = 'technical_data_sheet';
      const tokenCount = 800;

      const result = await documentChunker.chunk(documentId, longText, documentType, tokenCount);

      expect(result).toEqual({
        success: true,
        chunks: expect.arrayContaining([
          expect.objectContaining({
            chunkId: expect.any(String),
            documentId,
            chunkIndex: expect.any(Number),
            content: expect.any(String),
            tokenCount: expect.any(Number),
            startPosition: expect.any(Number),
            endPosition: expect.any(Number),
            metadata: expect.objectContaining({
              strategy: 'semantic',
              chunkType: expect.any(String)
            })
          })
        ]),
        strategy: 'semantic',
        totalChunks: expect.any(Number),
        totalTokens: expect.any(Number),
        processingTime: expect.any(Number),
        metadata: expect.objectContaining({
          documentType,
          averageChunkSize: expect.any(Number)
        })
      });

      expect(result.chunks.length).toBeGreaterThan(1);
    });

    it('uses SDS-specific chunking for safety data sheets', async () => {
      const documentId = 'sds-789';
      const sdsText = 'SAFETY DATA SHEET\n\nSection 1: Identification\nProduct Name: Test Chemical\nManufacturer: Test Corp\n\nSection 2: Hazards Identification\nGHS Classification: Flammable\n\nSection 3: Composition\nIngredients: Water 90%, Chemical A 10%\n\nSection 4: First Aid Measures\nEye contact: Rinse with water\n\nSection 16: Other Information\nRevision date: 2024-01-01';
      const documentType = 'sds';
      const tokenCount = 1200;

      const result = await documentChunker.chunk(documentId, sdsText, documentType, tokenCount);

      expect(result.strategy).toBe('sds_sections');
      expect(result.chunks.length).toBeGreaterThan(1);

      // Check that sections are properly identified
      const sectionChunks = result.chunks.filter(chunk =>
        chunk.metadata.chunkType === 'sds_section'
      );
      expect(sectionChunks.length).toBeGreaterThan(0);
    });

    it('handles certificate documents with certificate-specific chunking', async () => {
      const documentId = 'cert-101';
      const certText = 'CERTIFICATE OF ANALYSIS\n\nProduct: Test Ingredient\nBatch Number: TI-2024-001\n\nTEST RESULTS:\nAppearance: White powder\nPurity: 99.5%\nMoisture: 0.2%\n\nCONCLUSION:\nThis product meets all specifications.\n\nIssued by: Quality Control\nDate: 2024-01-01';
      const documentType = 'certificate_of_analysis';
      const tokenCount = 600;

      const result = await documentChunker.chunk(documentId, certText, documentType, tokenCount);

      expect(result.strategy).toBe('certificate');
      expect(result.chunks.some(chunk =>
        chunk.metadata.chunkType === 'certificate_header'
      )).toBe(true);
    });

    it('uses large document strategy for very large documents', async () => {
      const documentId = 'large-doc';
      const largeText = 'Chapter 1\n' + 'This is content. '.repeat(1000) + '\n\nChapter 2\n' + 'More content here. '.repeat(1000);
      const documentType = 'technical_manual';
      const tokenCount = 3000;

      const result = await documentChunker.chunk(documentId, largeText, documentType, tokenCount);

      expect(result.strategy).toBe('large_document');
      expect(result.chunks.length).toBeGreaterThan(2);
      expect(result.totalTokens).toBeGreaterThan(2000);
    });

    it('handles empty text input', async () => {
      const result = await documentChunker.chunk('doc-empty', '', 'sds', 0);

      expect(result).toEqual({
        success: false,
        error: 'Text content is empty',
        chunks: [],
        strategy: 'fallback',
        totalChunks: 0,
        totalTokens: 0,
        processingTime: expect.any(Number),
        metadata: {
          documentType: 'sds',
          averageChunkSize: 0,
          overlapTokens: 0,
          chunkSizeVariance: 0
        }
      });
    });

    it('handles chunking errors gracefully', async () => {
      // Mock an error in strategy selection
      const invalidText = '\x00\x01\x02'; // Invalid characters that might cause issues

      const result = await documentChunker.chunk('doc-error', invalidText, 'unknown', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.chunks).toEqual([]);
    });
  });

  describe('chunkBySingleChunk', () => {
    it('creates single chunk for entire document', () => {
      const text = 'This is the complete document content.';
      const documentId = 'doc-single';
      const tokenCount = 8;

      const result = documentChunker.chunkBySingleChunk(text, documentId, tokenCount);

      expect(result).toEqual([{
        chunkId: expect.any(String),
        documentId,
        chunkIndex: 0,
        content: text,
        tokenCount: 8,
        startPosition: 0,
        endPosition: text.length,
        metadata: {
          strategy: 'single_chunk',
          chunkType: 'document',
          hasOverlap: false
        }
      }]);
    });
  });

  describe('chunkSemantically', () => {
    it('splits text into semantic chunks based on paragraphs', () => {
      const text = 'First paragraph with important information.\n\nSecond paragraph with different content.\n\nThird paragraph concluding the document.';
      const documentId = 'doc-semantic';
      const tokenCount = 50;

      const result = documentChunker.chunkSemantically(text, documentId, tokenCount);

      expect(result.length).toBeGreaterThan(1);
      expect(result.every(chunk => chunk.content.trim().length > 0)).toBe(true);
      expect(result.every(chunk => chunk.metadata.strategy === 'semantic')).toBe(true);
    });

    it('handles text without clear paragraph breaks', () => {
      const text = 'This is continuous text without paragraph breaks that should still be chunked appropriately based on sentence boundaries and content.';
      const documentId = 'doc-continuous';
      const tokenCount = 25;

      const result = documentChunker.chunkSemantically(text, documentId, tokenCount);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).toBeTruthy();
    });
  });

  describe('chunkBySDSSections', () => {
    it('identifies and chunks SDS sections correctly', () => {
      const sdsText = 'Section 1: Identification\nProduct details here\n\nSection 2: Hazards\nHazard information\n\nSection 8: Exposure Controls\nExposure limits';
      const documentId = 'sds-sections';
      const tokenCount = 40;

      const result = documentChunker.chunkBySDSSections(sdsText, documentId, tokenCount);

      expect(result.length).toBeGreaterThan(1);

      const sectionChunks = result.filter(chunk =>
        chunk.metadata.chunkType === 'sds_section'
      );
      expect(sectionChunks.length).toBeGreaterThan(0);

      // Check that section numbers are identified
      expect(result.some(chunk =>
        chunk.metadata.sectionNumber !== undefined
      )).toBe(true);
    });

    it('handles malformed SDS sections', () => {
      const malformedSDS = 'Random text without proper sections\nSome content here\nMore content';
      const documentId = 'sds-malformed';
      const tokenCount = 20;

      const result = documentChunker.chunkBySDSSections(malformedSDS, documentId, tokenCount);

      expect(result.length).toBeGreaterThan(0);
      // Should fall back to general chunking
      expect(result[0].metadata.chunkType).toBeDefined();
    });
  });

  describe('chunkByCertificateSections', () => {
    it('identifies certificate components correctly', () => {
      const certText = 'CERTIFICATE OF ANALYSIS\n\nBatch: 123\nProduct: Test\n\nTEST RESULTS:\nPurity: 99%\nMoisture: 0.1%\n\nCONCLUSION:\nPassed all tests';
      const documentId = 'cert-analysis';
      const tokenCount = 35;

      const result = documentChunker.chunkByCertificateSections(certText, documentId, tokenCount);

      expect(result.length).toBeGreaterThan(1);

      const headerChunk = result.find(chunk =>
        chunk.metadata.chunkType === 'certificate_header'
      );
      expect(headerChunk).toBeTruthy();

      const resultsChunk = result.find(chunk =>
        chunk.metadata.chunkType === 'test_results'
      );
      expect(resultsChunk).toBeTruthy();
    });
  });

  describe('chunkByTechnicalSections', () => {
    it('identifies technical document sections', () => {
      const techText = 'TECHNICAL SPECIFICATION\n\nIntroduction\nThis document describes...\n\nSpecifications\nParameter 1: Value\nParameter 2: Value\n\nApplications\nUse case descriptions';
      const documentId = 'tech-spec';
      const tokenCount = 45;

      const result = documentChunker.chunkByTechnicalSections(techText, documentId, tokenCount);

      expect(result.length).toBeGreaterThan(1);
      expect(result.every(chunk => chunk.metadata.strategy === 'technical_sections')).toBe(true);
    });
  });

  describe('chunkLargeDocument', () => {
    it('chunks large documents with overlapping content', () => {
      const largeText = 'Chapter 1: Introduction\n' + 'Content here. '.repeat(200) + '\n\nChapter 2: Details\n' + 'More content. '.repeat(200);
      const documentId = 'large-document';
      const tokenCount = 800;

      const result = documentChunker.chunkLargeDocument(largeText, documentId, tokenCount);

      expect(result.length).toBeGreaterThan(1);
      expect(result.every(chunk => chunk.metadata.strategy === 'large_document')).toBe(true);

      // Check for overlap in adjacent chunks
      if (result.length > 1) {
        const firstChunk = result[0];
        const secondChunk = result[1];
        expect(firstChunk.endPosition).toBeGreaterThan(secondChunk.startPosition);
      }
    });
  });

  describe('selectChunkingStrategy', () => {
    it('selects single_chunk for very small documents', () => {
      const strategy = documentChunker.selectChunkingStrategy('Short text', 'sds', 10);
      expect(strategy).toBe('single_chunk');
    });

    it('selects sds_sections for SDS documents', () => {
      const strategy = documentChunker.selectChunkingStrategy('Medium length text', 'sds', 500);
      expect(strategy).toBe('sds_sections');
    });

    it('selects certificate for certificate documents', () => {
      const strategy = documentChunker.selectChunkingStrategy('Medium text', 'certificate_of_analysis', 400);
      expect(strategy).toBe('certificate');
    });

    it('selects large_document for very large documents', () => {
      const strategy = documentChunker.selectChunkingStrategy('Very long text content', 'technical_manual', 3000);
      expect(strategy).toBe('large_document');
    });

    it('defaults to semantic for medium-sized documents', () => {
      const strategy = documentChunker.selectChunkingStrategy('Medium length content', 'specification', 800);
      expect(strategy).toBe('semantic');
    });
  });

  describe('estimateTokenCount', () => {
    it('estimates token count for typical text', () => {
      const text = 'This is a test document with multiple words and sentences.';
      const tokenCount = documentChunker.estimateTokenCount(text);

      expect(tokenCount).toBeGreaterThan(0);
      expect(tokenCount).toBeLessThan(text.length);
    });

    it('returns 0 for empty text', () => {
      const tokenCount = documentChunker.estimateTokenCount('');
      expect(tokenCount).toBe(0);
    });
  });

  describe('generateChunkId', () => {
    it('generates unique chunk IDs', () => {
      const id1 = documentChunker.generateChunkId();
      const id2 = documentChunker.generateChunkId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^chunk_/);
    });
  });

  describe('validateChunkingResult', () => {
    it('validates successful chunking result', () => {
      const validResult = {
        success: true,
        chunks: [{
          chunkId: 'chunk_123',
          documentId: 'doc_456',
          chunkIndex: 0,
          content: 'Test content',
          tokenCount: 5,
          startPosition: 0,
          endPosition: 12,
          metadata: {
            strategy: 'semantic',
            chunkType: 'paragraph',
            hasOverlap: false
          }
        }],
        strategy: 'semantic',
        totalChunks: 1,
        totalTokens: 5,
        processingTime: 100,
        metadata: {
          documentType: 'sds',
          averageChunkSize: 5,
          overlapTokens: 0,
          chunkSizeVariance: 0
        }
      };

      const isValid = documentChunker.validateChunkingResult(validResult);
      expect(isValid).toBe(true);
    });

    it('validates failed chunking result', () => {
      const failedResult = {
        success: false,
        error: 'Chunking failed',
        chunks: [],
        strategy: 'fallback',
        totalChunks: 0,
        totalTokens: 0,
        processingTime: 50,
        metadata: {
          documentType: 'sds',
          averageChunkSize: 0,
          overlapTokens: 0,
          chunkSizeVariance: 0
        }
      };

      const isValid = documentChunker.validateChunkingResult(failedResult);
      expect(isValid).toBe(true);
    });

    it('invalidates malformed chunking result', () => {
      const invalidResult = {
        success: true,
        chunks: null, // Invalid chunks
        strategy: 'semantic'
        // Missing required fields
      };

      const isValid = documentChunker.validateChunkingResult(invalidResult as any);
      expect(isValid).toBe(false);
    });
  });
});