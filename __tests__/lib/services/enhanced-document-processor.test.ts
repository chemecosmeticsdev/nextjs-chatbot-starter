// Mock modules before importing
jest.mock('@/lib/services/mistral-ocr');
jest.mock('@/lib/services/metadata-extraction');
jest.mock('@/lib/services/document-chunker');
jest.mock('@/lib/services/vector-storage');
jest.mock('@/lib/services/job-queue');
jest.mock('@/lib/services/analytics');
jest.mock('@/lib/db/connection');

import { EnhancedDocumentProcessor } from '@/lib/services/enhanced-document-processor';
import { mistralOCR } from '@/lib/services/mistral-ocr';
import { enhancedMetadataExtractor } from '@/lib/services/metadata-extraction';
import { documentChunker } from '@/lib/services/document-chunker';
import { vectorStorage } from '@/lib/services/vector-storage';
import { jobQueue } from '@/lib/services/job-queue';
import { analyticsService } from '@/lib/services/analytics';
import { db } from '@/lib/db/connection';

const mockMistralOCR = jest.mocked(mistralOCR);
const mockMetadataExtractor = jest.mocked(enhancedMetadataExtractor);
const mockDocumentChunker = jest.mocked(documentChunker);
const mockVectorStorage = jest.mocked(vectorStorage);
const mockJobQueue = jest.mocked(jobQueue);
const mockAnalyticsService = jest.mocked(analyticsService);
const mockDb = jest.mocked(db);

describe('EnhancedDocumentProcessor', () => {
  let processor: EnhancedDocumentProcessor;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database operations
    mockDb.insert = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue([{ id: 'doc_123' }])
    });

    mockDb.update = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      })
    });

    processor = new EnhancedDocumentProcessor();
  });

  describe('processDocument', () => {
    it('successfully processes a complete document pipeline', async () => {
      const documentData = {
        fileId: 'file_123',
        filename: 'test-document.pdf',
        fileContent: Buffer.from('mock-pdf-content'),
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/- Safety Data Sheets/',
        metadata: {
          supplierName: 'TestCorp',
          ingredientName: 'TestIngredient'
        }
      };

      const options = {
        priority: 'high' as const,
        aiEnhancement: true,
        chunkingStrategy: 'auto' as const
      };

      // Mock OCR extraction
      mockMistralOCR.extractText.mockResolvedValue({
        success: true,
        extractedText: 'SAFETY DATA SHEET\n\nProduct: Test Chemical\nCAS Number: 123-45-6',
        wordCount: 12,
        characterCount: 65,
        pageCount: 1,
        hasImages: false,
        hasTables: true,
        confidence: 0.95,
        language: 'en',
        processingTime: 1500,
        metadata: {
          filename: 'test-document.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          extractionMethod: 'mistral-ocr',
          timestamp: '2024-01-01T10:00:00Z'
        }
      });

      // Mock metadata extraction
      mockMetadataExtractor.extractWithNovaEnhancement.mockResolvedValue({
        success: true,
        enhancedMetadata: {
          documentType: 'sds',
          complianceTypes: ['GHS'],
          casNumbers: ['123-45-6'],
          inciNames: ['Test Chemical'],
          allergens: ['none'],
          chemicalNames: ['Test Chemical'],
          functionCategories: ['active_ingredient'],
          confidenceScore: 0.92,
          normalizedSupplier: 'testcorp',
          normalizedIngredient: 'test chemical',
          aiEnhanced: true,
          extractionMethod: 'nova-micro',
          processingTime: 800,
          keyFindings: ['Contains CAS number', 'SDS format detected']
        },
        baseMetadata: {
          supplierName: 'TestCorp',
          supplierNormalized: 'testcorp',
          ingredientName: 'Test Chemical',
          ingredientNormalized: 'test chemical',
          ragDocumentType: 'sds',
          language: 'en',
          isCurrent: true,
          versionStatus: 'current',
          complianceTypes: ['GHS'],
          versionDate: null,
          versionString: null,
          hasImages: false,
          hasTables: true,
          requiresReview: false,
          validationStatus: 'pending',
          qualityScore: 85,
          qualityDimensions: {
            metadata_completeness: 80,
            content_clarity: 85,
            structural_integrity: 90
          }
        }
      });

      // Mock document chunking
      mockDocumentChunker.chunk.mockResolvedValue({
        success: true,
        chunks: [
          {
            chunkId: 'chunk_1',
            documentId: 'doc_123',
            chunkIndex: 0,
            content: 'SAFETY DATA SHEET\n\nProduct: Test Chemical',
            tokenCount: 8,
            startPosition: 0,
            endPosition: 42,
            metadata: {
              strategy: 'sds_sections',
              chunkType: 'sds_header',
              hasOverlap: false,
              sectionNumber: 1
            }
          },
          {
            chunkId: 'chunk_2',
            documentId: 'doc_123',
            chunkIndex: 1,
            content: 'CAS Number: 123-45-6',
            tokenCount: 5,
            startPosition: 42,
            endPosition: 62,
            metadata: {
              strategy: 'sds_sections',
              chunkType: 'chemical_identifiers',
              hasOverlap: false
            }
          }
        ],
        strategy: 'sds_sections',
        totalChunks: 2,
        totalTokens: 13,
        processingTime: 150,
        metadata: {
          documentType: 'sds',
          averageChunkSize: 6.5,
          overlapTokens: 0,
          chunkSizeVariance: 1.5
        }
      });

      // Mock vector storage
      mockVectorStorage.storeDocumentChunks.mockResolvedValue({
        success: true,
        stored: 2,
        failed: 0,
        totalTokensUsed: 13,
        totalProcessingTime: 220,
        errors: [],
        chunkIds: ['chunk_1', 'chunk_2']
      });

      const result = await processor.processDocument(documentData, options);

      expect(result).toEqual({
        success: true,
        documentId: 'doc_123',
        stages: {
          ocr: {
            completed: true,
            processingTime: 1500,
            wordCount: 12,
            pageCount: 1,
            confidence: 0.95
          },
          metadata: {
            completed: true,
            processingTime: 800,
            documentType: 'sds',
            qualityScore: 85,
            aiEnhanced: true
          },
          chunking: {
            completed: true,
            processingTime: 150,
            totalChunks: 2,
            strategy: 'sds_sections',
            totalTokens: 13
          },
          vectorization: {
            completed: true,
            processingTime: 220,
            storedChunks: 2,
            failedChunks: 0
          }
        },
        totalProcessingTime: expect.any(Number),
        qualityMetrics: {
          overallQuality: expect.any(Number),
          ocrConfidence: 0.95,
          metadataCompleteness: 85,
          chunkingEfficiency: expect.any(Number),
          vectorizationSuccess: 1.0
        },
        metadata: expect.objectContaining({
          filename: 'test-document.pdf',
          documentType: 'sds',
          supplierName: 'TestCorp',
          ingredientName: 'Test Chemical'
        })
      });

      expect(mockMistralOCR.extractText).toHaveBeenCalledWith(
        documentData.fileContent,
        documentData.mimeType,
        documentData.filename
      );

      expect(mockMetadataExtractor.extractWithNovaEnhancement).toHaveBeenCalled();
      expect(mockDocumentChunker.chunk).toHaveBeenCalled();
      expect(mockVectorStorage.storeDocumentChunks).toHaveBeenCalled();
    });

    it('handles OCR failure gracefully', async () => {
      const documentData = {
        fileId: 'file_456',
        filename: 'corrupted.pdf',
        fileContent: Buffer.from('corrupted-content'),
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {}
      };

      mockMistralOCR.extractText.mockResolvedValue({
        success: false,
        error: 'OCR extraction failed: Corrupted file',
        extractedText: '',
        wordCount: 0,
        characterCount: 0,
        pageCount: 0,
        hasImages: false,
        hasTables: false,
        confidence: 0,
        language: 'unknown',
        processingTime: 100,
        metadata: {
          filename: 'corrupted.pdf',
          mimeType: 'application/pdf',
          fileSize: 16,
          extractionMethod: 'mistral-ocr',
          timestamp: '2024-01-01T10:00:00Z'
        }
      });

      const result = await processor.processDocument(documentData, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('OCR extraction failed');
      expect(result.stages.ocr.completed).toBe(false);
      expect(result.stages.metadata.completed).toBe(false);
      expect(result.stages.chunking.completed).toBe(false);
      expect(result.stages.vectorization.completed).toBe(false);
    });

    it('continues processing with fallback when metadata enhancement fails', async () => {
      const documentData = {
        fileId: 'file_789',
        filename: 'simple.txt',
        fileContent: Buffer.from('Simple text content'),
        mimeType: 'text/plain',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {}
      };

      // Mock successful OCR
      mockMistralOCR.extractText.mockResolvedValue({
        success: true,
        extractedText: 'Simple text content for testing',
        wordCount: 6,
        characterCount: 31,
        pageCount: 1,
        hasImages: false,
        hasTables: false,
        confidence: 1.0,
        language: 'en',
        processingTime: 50,
        metadata: {
          filename: 'simple.txt',
          mimeType: 'text/plain',
          fileSize: 19,
          extractionMethod: 'mistral-ocr',
          timestamp: '2024-01-01T10:00:00Z'
        }
      });

      // Mock metadata extraction failure
      mockMetadataExtractor.extractWithNovaEnhancement.mockResolvedValue({
        success: false,
        error: 'Nova enhancement failed: API unavailable',
        enhancedMetadata: null,
        baseMetadata: {
          supplierName: 'TestCorp',
          supplierNormalized: 'testcorp',
          ingredientName: 'TestIngredient',
          ingredientNormalized: 'testingredient',
          ragDocumentType: 'other',
          language: 'en',
          isCurrent: true,
          versionStatus: 'current',
          complianceTypes: [],
          versionDate: null,
          versionString: null,
          hasImages: false,
          hasTables: false,
          requiresReview: true,
          validationStatus: 'pending',
          qualityScore: 40,
          qualityDimensions: {
            metadata_completeness: 30,
            content_clarity: 50,
            structural_integrity: 40
          }
        }
      });

      // Mock successful chunking with fallback metadata
      mockDocumentChunker.chunk.mockResolvedValue({
        success: true,
        chunks: [{
          chunkId: 'chunk_1',
          documentId: 'doc_789',
          chunkIndex: 0,
          content: 'Simple text content for testing',
          tokenCount: 6,
          startPosition: 0,
          endPosition: 31,
          metadata: {
            strategy: 'single_chunk',
            chunkType: 'document',
            hasOverlap: false
          }
        }],
        strategy: 'single_chunk',
        totalChunks: 1,
        totalTokens: 6,
        processingTime: 25,
        metadata: {
          documentType: 'other',
          averageChunkSize: 6,
          overlapTokens: 0,
          chunkSizeVariance: 0
        }
      });

      // Mock successful vector storage
      mockVectorStorage.storeDocumentChunks.mockResolvedValue({
        success: true,
        stored: 1,
        failed: 0,
        totalTokensUsed: 6,
        totalProcessingTime: 80,
        errors: [],
        chunkIds: ['chunk_1']
      });

      const result = await processor.processDocument(documentData, { aiEnhancement: true });

      expect(result.success).toBe(true);
      expect(result.stages.ocr.completed).toBe(true);
      expect(result.stages.metadata.completed).toBe(true); // Should complete with fallback
      expect(result.stages.metadata.aiEnhanced).toBe(false); // But not AI enhanced
      expect(result.stages.chunking.completed).toBe(true);
      expect(result.stages.vectorization.completed).toBe(true);
    });

    it('handles vectorization failure with partial success', async () => {
      const documentData = {
        fileId: 'file_vector_fail',
        filename: 'test.pdf',
        fileContent: Buffer.from('test content'),
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {}
      };

      // Mock successful stages up to vectorization
      mockMistralOCR.extractText.mockResolvedValue({
        success: true,
        extractedText: 'Test document content',
        wordCount: 3,
        characterCount: 21,
        pageCount: 1,
        hasImages: false,
        hasTables: false,
        confidence: 0.9,
        language: 'en',
        processingTime: 100,
        metadata: {
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          fileSize: 12,
          extractionMethod: 'mistral-ocr',
          timestamp: '2024-01-01T10:00:00Z'
        }
      });

      mockMetadataExtractor.extractWithNovaEnhancement.mockResolvedValue({
        success: true,
        enhancedMetadata: {
          documentType: 'other',
          complianceTypes: [],
          casNumbers: [],
          inciNames: [],
          allergens: [],
          chemicalNames: [],
          functionCategories: [],
          confidenceScore: 0.6,
          normalizedSupplier: 'testcorp',
          normalizedIngredient: 'testingredient',
          aiEnhanced: true,
          extractionMethod: 'nova-micro',
          processingTime: 200,
          keyFindings: []
        },
        baseMetadata: {
          supplierName: 'TestCorp',
          supplierNormalized: 'testcorp',
          ingredientName: 'TestIngredient',
          ingredientNormalized: 'testingredient',
          ragDocumentType: 'other',
          language: 'en',
          isCurrent: true,
          versionStatus: 'current',
          complianceTypes: [],
          versionDate: null,
          versionString: null,
          hasImages: false,
          hasTables: false,
          requiresReview: false,
          validationStatus: 'pending',
          qualityScore: 60,
          qualityDimensions: {
            metadata_completeness: 50,
            content_clarity: 60,
            structural_integrity: 70
          }
        }
      });

      mockDocumentChunker.chunk.mockResolvedValue({
        success: true,
        chunks: [{
          chunkId: 'chunk_fail',
          documentId: 'doc_vector_fail',
          chunkIndex: 0,
          content: 'Test document content',
          tokenCount: 3,
          startPosition: 0,
          endPosition: 21,
          metadata: {
            strategy: 'single_chunk',
            chunkType: 'document',
            hasOverlap: false
          }
        }],
        strategy: 'single_chunk',
        totalChunks: 1,
        totalTokens: 3,
        processingTime: 50,
        metadata: {
          documentType: 'other',
          averageChunkSize: 3,
          overlapTokens: 0,
          chunkSizeVariance: 0
        }
      });

      // Mock vector storage failure
      mockVectorStorage.storeDocumentChunks.mockResolvedValue({
        success: false,
        stored: 0,
        failed: 1,
        totalTokensUsed: 0,
        totalProcessingTime: 30,
        errors: ['Embedding generation failed: API unavailable'],
        chunkIds: []
      });

      const result = await processor.processDocument(documentData, {});

      expect(result.success).toBe(false);
      expect(result.stages.vectorization.completed).toBe(false);
      expect(result.stages.vectorization.failedChunks).toBe(1);
      expect(result.error).toContain('Vectorization failed');
    });
  });

  describe('processDocumentFromJob', () => {
    it('successfully processes document from SQS job data', async () => {
      const jobData = {
        operation: 'PROCESS_DOCUMENT' as const,
        documentId: 'doc_job_123',
        fileId: 'file_job_123',
        filename: 'job-document.pdf',
        mimeType: 'application/pdf',
        folderPath: '/PC/JobCorp/JobIngredient/',
        metadata: {
          supplierName: 'JobCorp',
          ingredientName: 'JobIngredient'
        },
        options: {
          priority: 'medium' as const,
          aiEnhancement: true
        }
      };

      const mockFileContent = Buffer.from('mock-job-pdf-content');

      // Mock file retrieval (would normally come from S3 or similar)
      jest.spyOn(processor, 'retrieveFileContent').mockResolvedValue(mockFileContent);

      // Mock successful processing pipeline
      mockMistralOCR.extractText.mockResolvedValue({
        success: true,
        extractedText: 'Job document content',
        wordCount: 3,
        characterCount: 20,
        pageCount: 1,
        hasImages: false,
        hasTables: false,
        confidence: 0.85,
        language: 'en',
        processingTime: 200,
        metadata: {
          filename: 'job-document.pdf',
          mimeType: 'application/pdf',
          fileSize: 21,
          extractionMethod: 'mistral-ocr',
          timestamp: '2024-01-01T10:00:00Z'
        }
      });

      mockMetadataExtractor.extractWithNovaEnhancement.mockResolvedValue({
        success: true,
        enhancedMetadata: {
          documentType: 'specification',
          complianceTypes: ['FDA'],
          casNumbers: [],
          inciNames: [],
          allergens: [],
          chemicalNames: [],
          functionCategories: [],
          confidenceScore: 0.8,
          normalizedSupplier: 'jobcorp',
          normalizedIngredient: 'jobingredient',
          aiEnhanced: true,
          extractionMethod: 'nova-micro',
          processingTime: 300,
          keyFindings: ['FDA compliance mentioned']
        },
        baseMetadata: {
          supplierName: 'JobCorp',
          supplierNormalized: 'jobcorp',
          ingredientName: 'JobIngredient',
          ingredientNormalized: 'jobingredient',
          ragDocumentType: 'specification',
          language: 'en',
          isCurrent: true,
          versionStatus: 'current',
          complianceTypes: ['FDA'],
          versionDate: null,
          versionString: null,
          hasImages: false,
          hasTables: false,
          requiresReview: false,
          validationStatus: 'pending',
          qualityScore: 75,
          qualityDimensions: {
            metadata_completeness: 70,
            content_clarity: 75,
            structural_integrity: 80
          }
        }
      });

      mockDocumentChunker.chunk.mockResolvedValue({
        success: true,
        chunks: [{
          chunkId: 'chunk_job_1',
          documentId: 'doc_job_123',
          chunkIndex: 0,
          content: 'Job document content',
          tokenCount: 3,
          startPosition: 0,
          endPosition: 20,
          metadata: {
            strategy: 'single_chunk',
            chunkType: 'document',
            hasOverlap: false
          }
        }],
        strategy: 'single_chunk',
        totalChunks: 1,
        totalTokens: 3,
        processingTime: 75,
        metadata: {
          documentType: 'specification',
          averageChunkSize: 3,
          overlapTokens: 0,
          chunkSizeVariance: 0
        }
      });

      mockVectorStorage.storeDocumentChunks.mockResolvedValue({
        success: true,
        stored: 1,
        failed: 0,
        totalTokensUsed: 3,
        totalProcessingTime: 120,
        errors: [],
        chunkIds: ['chunk_job_1']
      });

      const result = await processor.processDocumentFromJob(jobData);

      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc_job_123');
      expect(result.stages.ocr.completed).toBe(true);
      expect(result.stages.metadata.completed).toBe(true);
      expect(result.stages.chunking.completed).toBe(true);
      expect(result.stages.vectorization.completed).toBe(true);
    });

    it('handles file retrieval failure', async () => {
      const jobData = {
        operation: 'PROCESS_DOCUMENT' as const,
        documentId: 'doc_no_file',
        fileId: 'file_missing',
        filename: 'missing.pdf',
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {},
        options: {}
      };

      // Mock file retrieval failure
      jest.spyOn(processor, 'retrieveFileContent').mockRejectedValue(
        new Error('File not found in storage')
      );

      const result = await processor.processDocumentFromJob(jobData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found in storage');
    });
  });

  describe('getProcessingStatus', () => {
    it('returns comprehensive processing status', async () => {
      const documentId = 'doc_status_check';

      // Mock database status query
      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{
            id: documentId,
            filename: 'status-test.pdf',
            status: 'processing',
            progress: 75,
            metadata: {
              documentType: 'sds',
              processingStages: {
                ocr: { completed: true, processingTime: 1000 },
                metadata: { completed: true, processingTime: 500 },
                chunking: { completed: true, processingTime: 200 },
                vectorization: { completed: false, processingTime: 0 }
              }
            },
            createdAt: new Date('2024-01-01T10:00:00Z'),
            updatedAt: new Date('2024-01-01T10:05:00Z')
          }])
        })
      });

      // Mock chunk count query
      mockDb.execute.mockResolvedValue([{ count: 5 }]);

      const status = await processor.getProcessingStatus(documentId);

      expect(status).toEqual({
        documentId,
        filename: 'status-test.pdf',
        status: 'processing',
        progress: 75,
        stages: expect.arrayContaining([
          expect.objectContaining({
            name: 'OCR',
            completed: true
          }),
          expect.objectContaining({
            name: 'Metadata',
            completed: true
          }),
          expect.objectContaining({
            name: 'Chunking',
            completed: true
          }),
          expect.objectContaining({
            name: 'Vectorization',
            completed: false
          })
        ]),
        metrics: {
          chunkCount: 5,
          totalProcessingTime: 1700
        },
        metadata: expect.objectContaining({
          documentType: 'sds'
        }),
        timestamps: {
          createdAt: new Date('2024-01-01T10:00:00Z'),
          updatedAt: new Date('2024-01-01T10:05:00Z')
        }
      });
    });

    it('handles non-existent document', async () => {
      const documentId = 'doc_not_found';

      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      const status = await processor.getProcessingStatus(documentId);

      expect(status).toBeNull();
    });
  });

  describe('reprocessDocument', () => {
    it('successfully reprocesses existing document', async () => {
      const documentId = 'doc_reprocess';
      const options = {
        stages: ['chunking', 'vectorization'] as const,
        chunkingStrategy: 'semantic' as const
      };

      // Mock document retrieval
      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{
            id: documentId,
            filename: 'reprocess-test.pdf',
            extractedText: 'Existing extracted text content',
            metadata: {
              documentType: 'sds',
              supplierName: 'TestCorp',
              ingredientName: 'TestIngredient'
            }
          }])
        })
      });

      // Mock chunking for reprocessing
      mockDocumentChunker.chunk.mockResolvedValue({
        success: true,
        chunks: [
          {
            chunkId: 'rechunk_1',
            documentId,
            chunkIndex: 0,
            content: 'Existing extracted text content',
            tokenCount: 5,
            startPosition: 0,
            endPosition: 32,
            metadata: {
              strategy: 'semantic',
              chunkType: 'paragraph',
              hasOverlap: false
            }
          }
        ],
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
      });

      // Mock vector storage for reprocessing
      mockVectorStorage.deleteDocumentChunks.mockResolvedValue({
        success: true,
        deletedChunks: 3,
        documentId
      });

      mockVectorStorage.storeDocumentChunks.mockResolvedValue({
        success: true,
        stored: 1,
        failed: 0,
        totalTokensUsed: 5,
        totalProcessingTime: 150,
        errors: [],
        chunkIds: ['rechunk_1']
      });

      const result = await processor.reprocessDocument(documentId, options);

      expect(result.success).toBe(true);
      expect(result.reprocessedStages).toEqual(['chunking', 'vectorization']);
      expect(result.stages.chunking.completed).toBe(true);
      expect(result.stages.vectorization.completed).toBe(true);
    });

    it('handles reprocessing of non-existent document', async () => {
      const documentId = 'doc_not_exists';

      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      const result = await processor.reprocessDocument(documentId, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Document not found');
    });
  });

  describe('validateDocumentData', () => {
    it('validates correct document data', () => {
      const validData = {
        fileId: 'file_123',
        filename: 'test.pdf',
        fileContent: Buffer.from('content'),
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {
          supplierName: 'TestCorp'
        }
      };

      const result = processor.validateDocumentData(validData);
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid document data', () => {
      const invalidData = {
        fileId: '', // Empty file ID
        filename: 'test.pdf',
        fileContent: null, // Invalid content
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {}
      };

      const result = processor.validateDocumentData(invalidData as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeTruthy();
    });
  });

  describe('calculateQualityMetrics', () => {
    it('calculates comprehensive quality metrics', () => {
      const processingResult = {
        stages: {
          ocr: { completed: true, confidence: 0.95 },
          metadata: { completed: true, qualityScore: 85 },
          chunking: { completed: true, totalChunks: 10, totalTokens: 1000 },
          vectorization: { completed: true, storedChunks: 10, failedChunks: 0 }
        }
      };

      const metrics = processor.calculateQualityMetrics(processingResult as any);

      expect(metrics).toEqual({
        overallQuality: expect.any(Number),
        ocrConfidence: 0.95,
        metadataCompleteness: 85,
        chunkingEfficiency: 100, // 1000 tokens / 10 chunks = 100 avg
        vectorizationSuccess: 1.0 // 10 stored / 10 total = 100%
      });

      expect(metrics.overallQuality).toBeGreaterThan(80);
    });
  });
});