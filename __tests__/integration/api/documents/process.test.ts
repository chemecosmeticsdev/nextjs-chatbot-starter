/**
 * Integration tests for document processing API endpoints
 * Tests the complete pipeline from API request to database storage
 */

import { NextRequest } from 'next/server';
import { POST, PUT, PATCH } from '@/app/api/v1/documents/process/route';
import { GET, POST as STATUS_POST } from '@/app/api/v1/documents/status/route';
import { db } from '@/lib/db/connection';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Mock external services for integration testing
jest.mock('@/lib/services/mistral-ocr');
jest.mock('@/lib/embeddings/titan-embedder');
jest.mock('@/lib/services/job-queue');

import { mistralOCR } from '@/lib/services/mistral-ocr';
import { titanEmbedder } from '@/lib/embeddings/titan-embedder';
import { jobQueue } from '@/lib/services/job-queue';

const mockMistralOCR = jest.mocked(mistralOCR);
const mockTitanEmbedder = jest.mocked(titanEmbedder);
const mockJobQueue = jest.mocked(jobQueue);

describe('Document Processing API Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    // Clean up test data
    await db.delete(documentChunks);
    await db.delete(documents);

    // Setup mock responses for successful processing
    mockMistralOCR.extractText.mockResolvedValue({
      success: true,
      extractedText: 'SAFETY DATA SHEET\n\nProduct: Test Chemical\nCAS Number: 123-45-6\nManufacturer: Test Corp',
      wordCount: 12,
      characterCount: 85,
      pageCount: 2,
      hasImages: false,
      hasTables: true,
      confidence: 0.92,
      language: 'en',
      processingTime: 1200,
      metadata: {
        filename: 'test-sds.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        extractionMethod: 'mistral-ocr',
        timestamp: new Date().toISOString()
      }
    });

    mockTitanEmbedder.generateEmbeddingsBatch.mockResolvedValue([
      {
        success: true,
        embedding: Array(1024).fill(0).map(() => Math.random()),
        dimensions: 1024,
        inputText: 'SAFETY DATA SHEET Product: Test Chemical',
        inputTokens: 8,
        processingTime: 150,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      },
      {
        success: true,
        embedding: Array(1024).fill(0).map(() => Math.random()),
        dimensions: 1024,
        inputText: 'CAS Number: 123-45-6 Manufacturer: Test Corp',
        inputTokens: 9,
        processingTime: 160,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      }
    ]);

    mockJobQueue.enqueue.mockResolvedValue({
      success: true,
      jobId: 'job_test_123',
      priority: 'medium',
      estimatedProcessingTime: 30000
    });
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(documentChunks);
    await db.delete(documents);
  });

  describe('POST /api/v1/documents/process', () => {
    it('successfully processes a complete document pipeline', async () => {
      const requestBody = {
        fileId: 'file_integration_test',
        filename: 'integration-test-sds.pdf',
        fileContent: Buffer.from('mock-pdf-content').toString('base64'),
        mimeType: 'application/pdf',
        folderPath: '/PC/IntegrationCorp/TestChemical/- Safety Data Sheets/',
        metadata: {
          supplierName: 'IntegrationCorp',
          ingredientName: 'TestChemical'
        },
        options: {
          priority: 'high',
          aiEnhancement: true,
          chunkingStrategy: 'auto'
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        documentId: expect.any(String),
        stages: {
          ocr: {
            completed: true,
            processingTime: 1200,
            wordCount: 12,
            pageCount: 2,
            confidence: 0.92
          },
          metadata: {
            completed: true,
            processingTime: expect.any(Number),
            documentType: expect.any(String),
            qualityScore: expect.any(Number),
            aiEnhanced: expect.any(Boolean)
          },
          chunking: {
            completed: true,
            processingTime: expect.any(Number),
            totalChunks: expect.any(Number),
            strategy: expect.any(String),
            totalTokens: expect.any(Number)
          },
          vectorization: {
            completed: true,
            processingTime: expect.any(Number),
            storedChunks: expect.any(Number),
            failedChunks: 0
          }
        },
        totalProcessingTime: expect.any(Number),
        qualityMetrics: {
          overallQuality: expect.any(Number),
          ocrConfidence: 0.92,
          metadataCompleteness: expect.any(Number),
          chunkingEfficiency: expect.any(Number),
          vectorizationSuccess: 1.0
        },
        metadata: expect.objectContaining({
          filename: 'integration-test-sds.pdf',
          supplierName: 'IntegrationCorp',
          ingredientName: 'TestChemical'
        })
      });

      // Verify document was stored in database
      const storedDocuments = await db.select().from(documents).where(eq(documents.id, data.documentId));
      expect(storedDocuments).toHaveLength(1);
      expect(storedDocuments[0].filename).toBe('integration-test-sds.pdf');

      // Verify chunks were stored in database
      const storedChunks = await db.select().from(documentChunks).where(eq(documentChunks.documentId, data.documentId));
      expect(storedChunks.length).toBeGreaterThan(0);
      expect(storedChunks.every(chunk => chunk.embedding !== null)).toBe(true);
    });

    it('handles validation errors for invalid input', async () => {
      const invalidRequestBody = {
        fileId: '', // Invalid: empty fileId
        filename: 'test.pdf',
        fileContent: 'invalid-base64', // Invalid base64
        mimeType: 'application/unsupported', // Unsupported type
        folderPath: '/invalid/path',
        metadata: {},
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'POST',
        body: JSON.stringify(invalidRequestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('validation');
    });

    it('handles OCR failures gracefully', async () => {
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
          fileSize: 1024,
          extractionMethod: 'mistral-ocr',
          timestamp: new Date().toISOString()
        }
      });

      const requestBody = {
        fileId: 'file_corrupted_test',
        filename: 'corrupted.pdf',
        fileContent: Buffer.from('corrupted-content').toString('base64'),
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {},
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('OCR extraction failed');
      expect(data.stages.ocr.completed).toBe(false);
    });

    it('processes document asynchronously when async mode is enabled', async () => {
      const requestBody = {
        fileId: 'file_async_test',
        filename: 'async-test.pdf',
        fileContent: Buffer.from('async-content').toString('base64'),
        mimeType: 'application/pdf',
        folderPath: '/PC/AsyncCorp/AsyncIngredient/',
        metadata: {
          supplierName: 'AsyncCorp',
          ingredientName: 'AsyncIngredient'
        },
        options: {
          priority: 'low',
          async: true
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(202); // Accepted for async processing
      expect(data.success).toBe(true);
      expect(data.jobId).toBe('job_test_123');
      expect(data.documentId).toBeTruthy();
      expect(data.estimatedProcessingTime).toBe(30000);

      // Verify job was enqueued
      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'PROCESS_DOCUMENT',
          documentId: data.documentId,
          fileId: 'file_async_test'
        }),
        { priority: 'low' }
      );
    });
  });

  describe('PUT /api/v1/documents/process', () => {
    it('successfully reprocesses existing document', async () => {
      // First, create a document to reprocess
      const initialDoc = await db.insert(documents).values({
        id: 'doc_reprocess_test',
        filename: 'reprocess-test.pdf',
        status: 'completed',
        fileId: 'file_reprocess_test',
        mimeType: 'application/pdf',
        extractedText: 'Original extracted text content',
        metadata: {
          documentType: 'sds',
          supplierName: 'ReprocessCorp',
          ingredientName: 'ReprocessIngredient'
        }
      }).returning();

      const requestBody = {
        documentId: 'doc_reprocess_test',
        options: {
          stages: ['chunking', 'vectorization'],
          chunkingStrategy: 'semantic'
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.documentId).toBe('doc_reprocess_test');
      expect(data.reprocessedStages).toEqual(['chunking', 'vectorization']);
      expect(data.stages.chunking.completed).toBe(true);
      expect(data.stages.vectorization.completed).toBe(true);
    });

    it('handles reprocessing of non-existent document', async () => {
      const requestBody = {
        documentId: 'doc_nonexistent',
        options: {
          stages: ['chunking']
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Document not found');
    });
  });

  describe('PATCH /api/v1/documents/process', () => {
    it('successfully processes individual stage', async () => {
      // Create a document with completed OCR
      await db.insert(documents).values({
        id: 'doc_stage_test',
        filename: 'stage-test.pdf',
        status: 'processing',
        fileId: 'file_stage_test',
        mimeType: 'application/pdf',
        extractedText: 'Stage processing test content',
        metadata: {
          documentType: 'specification',
          supplierName: 'StageCorp',
          ingredientName: 'StageIngredient'
        }
      });

      const requestBody = {
        documentId: 'doc_stage_test',
        stage: 'chunking',
        options: {
          chunkingStrategy: 'technical_sections'
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.documentId).toBe('doc_stage_test');
      expect(data.completedStage).toBe('chunking');
      expect(data.stage.completed).toBe(true);
      expect(data.stage.strategy).toBe('technical_sections');
    });

    it('handles invalid stage processing', async () => {
      const requestBody = {
        documentId: 'doc_stage_test',
        stage: 'invalid_stage',
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid stage');
    });
  });

  describe('GET /api/v1/documents/status', () => {
    it('returns detailed status for existing document', async () => {
      // Create a test document with processing stages
      const testDoc = await db.insert(documents).values({
        id: 'doc_status_test',
        filename: 'status-test.pdf',
        status: 'processing',
        progress: 75,
        fileId: 'file_status_test',
        mimeType: 'application/pdf',
        extractedText: 'Status test content',
        metadata: {
          documentType: 'sds',
          supplierName: 'StatusCorp',
          ingredientName: 'StatusIngredient',
          processingStages: {
            ocr: { completed: true, processingTime: 1000 },
            metadata: { completed: true, processingTime: 500 },
            chunking: { completed: true, processingTime: 200 },
            vectorization: { completed: false, processingTime: 0 }
          }
        }
      }).returning();

      // Add some chunks for the document
      await db.insert(documentChunks).values([
        {
          id: 'chunk_1',
          documentId: 'doc_status_test',
          chunkIndex: 0,
          content: 'First chunk content',
          tokenCount: 5,
          embedding: Array(1024).fill(0.1),
          metadata: { strategy: 'sds_sections', chunkType: 'header' }
        },
        {
          id: 'chunk_2',
          documentId: 'doc_status_test',
          chunkIndex: 1,
          content: 'Second chunk content',
          tokenCount: 6,
          embedding: Array(1024).fill(0.2),
          metadata: { strategy: 'sds_sections', chunkType: 'section' }
        }
      ]);

      const request = new NextRequest('http://localhost:3000/api/v1/documents/status?documentId=doc_status_test');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({
        documentId: 'doc_status_test',
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
          chunkCount: 2,
          totalProcessingTime: 1700
        },
        metadata: expect.objectContaining({
          documentType: 'sds',
          supplierName: 'StatusCorp',
          ingredientName: 'StatusIngredient'
        }),
        timestamps: expect.objectContaining({
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        })
      });
    });

    it('returns 404 for non-existent document', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/documents/status?documentId=doc_not_found');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Document not found');
    });
  });

  describe('POST /api/v1/documents/status (bulk)', () => {
    it('returns status for multiple documents', async () => {
      // Create multiple test documents
      await db.insert(documents).values([
        {
          id: 'doc_bulk_1',
          filename: 'bulk-test-1.pdf',
          status: 'completed',
          progress: 100,
          fileId: 'file_bulk_1',
          mimeType: 'application/pdf',
          extractedText: 'Bulk test content 1',
          metadata: { documentType: 'sds' }
        },
        {
          id: 'doc_bulk_2',
          filename: 'bulk-test-2.pdf',
          status: 'processing',
          progress: 50,
          fileId: 'file_bulk_2',
          mimeType: 'application/pdf',
          extractedText: 'Bulk test content 2',
          metadata: { documentType: 'specification' }
        },
        {
          id: 'doc_bulk_3',
          filename: 'bulk-test-3.pdf',
          status: 'failed',
          progress: 0,
          fileId: 'file_bulk_3',
          mimeType: 'application/pdf',
          extractedText: '',
          metadata: { documentType: 'certificate' }
        }
      ]);

      const requestBody = {
        documentIds: ['doc_bulk_1', 'doc_bulk_2', 'doc_bulk_3'],
        includeDetails: true
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/status', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await STATUS_POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.documents).toHaveLength(3);
      expect(data.data.summary).toEqual({
        total: 3,
        completed: 1,
        processing: 1,
        failed: 1,
        queued: 0
      });

      // Check individual document statuses
      const completedDoc = data.data.documents.find((doc: any) => doc.documentId === 'doc_bulk_1');
      expect(completedDoc.status).toBe('completed');
      expect(completedDoc.progress).toBe(100);

      const processingDoc = data.data.documents.find((doc: any) => doc.documentId === 'doc_bulk_2');
      expect(processingDoc.status).toBe('processing');
      expect(processingDoc.progress).toBe(50);

      const failedDoc = data.data.documents.find((doc: any) => doc.documentId === 'doc_bulk_3');
      expect(failedDoc.status).toBe('failed');
      expect(failedDoc.progress).toBe(0);
    });

    it('handles empty document list', async () => {
      const requestBody = {
        documentIds: [],
        includeDetails: false
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/status', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await STATUS_POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.documents).toEqual([]);
      expect(data.data.summary).toEqual({
        total: 0,
        completed: 0,
        processing: 0,
        failed: 0,
        queued: 0
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles database connection errors gracefully', async () => {
      // Mock database error
      jest.spyOn(db, 'insert').mockRejectedValue(new Error('Database connection failed'));

      const requestBody = {
        fileId: 'file_db_error_test',
        filename: 'db-error-test.pdf',
        fileContent: Buffer.from('test-content').toString('base64'),
        mimeType: 'application/pdf',
        folderPath: '/PC/TestCorp/TestIngredient/',
        metadata: {},
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Database');
    });

    it('handles malformed JSON requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'POST',
        body: '{ invalid json }',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid JSON');
    });

    it('handles missing required headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/documents/process', {
        method: 'POST',
        body: JSON.stringify({
          fileId: 'test',
          filename: 'test.pdf',
          fileContent: 'dGVzdA==',
          mimeType: 'application/pdf',
          folderPath: '/test/',
          metadata: {},
          options: {}
        })
        // Missing Content-Type header
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});