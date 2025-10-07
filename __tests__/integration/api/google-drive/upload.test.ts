/**
 * Integration tests for Google Drive folder processing with enhanced document pipeline
 * Tests the complete flow from Google Drive folder upload to document processing
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/google-drive/upload/route';
import { db } from '@/lib/db/connection';
import { documents, documentChunks } from '@/lib/db/schema';

// Mock external services
jest.mock('@/lib/services/google-drive');
jest.mock('@/lib/services/mistral-ocr');
jest.mock('@/lib/embeddings/titan-embedder');
jest.mock('@/lib/services/job-queue');

import { googleDriveService } from '@/lib/services/google-drive';
import { mistralOCR } from '@/lib/services/mistral-ocr';
import { titanEmbedder } from '@/lib/embeddings/titan-embedder';
import { jobQueue } from '@/lib/services/job-queue';

const mockGoogleDriveService = jest.mocked(googleDriveService);
const mockMistralOCR = jest.mocked(mistralOCR);
const mockTitanEmbedder = jest.mocked(titanEmbedder);
const mockJobQueue = jest.mocked(jobQueue);

describe('Google Drive Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    // Clean up test data
    await db.delete(documentChunks);
    await db.delete(documents);

    // Setup Google Drive service mocks
    mockGoogleDriveService.listFolderContents.mockResolvedValue({
      success: true,
      items: [
        {
          id: 'file_sds_1',
          name: 'sodium-chloride-sds.pdf',
          mimeType: 'application/pdf',
          size: 2048000,
          modifiedTime: '2024-01-01T10:00:00Z',
          parents: ['folder_sds'],
          webViewLink: 'https://drive.google.com/file/d/file_sds_1/view',
          thumbnailLink: 'https://drive.google.com/thumbnail?id=file_sds_1',
          isFolder: false
        },
        {
          id: 'file_spec_1',
          name: 'vitamin-e-specification.pdf',
          mimeType: 'application/pdf',
          size: 1536000,
          modifiedTime: '2024-01-02T11:00:00Z',
          parents: ['folder_spec'],
          webViewLink: 'https://drive.google.com/file/d/file_spec_1/view',
          thumbnailLink: 'https://drive.google.com/thumbnail?id=file_spec_1',
          isFolder: false
        },
        {
          id: 'file_cert_1',
          name: 'halal-certificate.pdf',
          mimeType: 'application/pdf',
          size: 512000,
          modifiedTime: '2024-01-03T12:00:00Z',
          parents: ['folder_cert'],
          webViewLink: 'https://drive.google.com/file/d/file_cert_1/view',
          thumbnailLink: 'https://drive.google.com/thumbnail?id=file_cert_1',
          isFolder: false
        }
      ],
      nextPageToken: null,
      totalItems: 3
    });

    mockGoogleDriveService.downloadFile.mockImplementation(async (fileId: string) => {
      const fileContents = {
        'file_sds_1': Buffer.from('SAFETY DATA SHEET\nProduct: Sodium Chloride\nCAS Number: 7647-14-5'),
        'file_spec_1': Buffer.from('TECHNICAL SPECIFICATION\nProduct: Vitamin E\nPurity: 99.5%'),
        'file_cert_1': Buffer.from('HALAL CERTIFICATE\nProduct: Halal Ingredient\nCertified by: Halal Authority')
      };

      return {
        success: true,
        content: fileContents[fileId as keyof typeof fileContents] || Buffer.from('Unknown file'),
        metadata: {
          filename: fileId === 'file_sds_1' ? 'sodium-chloride-sds.pdf' :
                   fileId === 'file_spec_1' ? 'vitamin-e-specification.pdf' :
                   'halal-certificate.pdf',
          mimeType: 'application/pdf',
          size: fileId === 'file_sds_1' ? 2048000 :
                fileId === 'file_spec_1' ? 1536000 :
                512000
        }
      };
    });

    // Setup OCR service mocks
    mockMistralOCR.extractText.mockImplementation(async (content: Buffer | string, mimeType: string, filename: string) => {
      const textContent = content.toString();
      return {
        success: true,
        extractedText: textContent,
        wordCount: textContent.split(' ').length,
        characterCount: textContent.length,
        pageCount: 1,
        hasImages: false,
        hasTables: filename.includes('sds'),
        confidence: 0.95,
        language: 'en',
        processingTime: 1000,
        metadata: {
          filename,
          mimeType,
          fileSize: content.length,
          extractionMethod: 'mistral-ocr',
          timestamp: new Date().toISOString()
        }
      };
    });

    // Setup embedding service mocks
    mockTitanEmbedder.generateEmbeddingsBatch.mockImplementation(async (texts: string[]) => {
      return texts.map((text, index) => ({
        success: true,
        embedding: Array(1024).fill(0).map(() => Math.random()),
        dimensions: 1024,
        inputText: text,
        inputTokens: text.split(' ').length,
        processingTime: 100 + index * 10,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      }));
    });

    // Setup job queue mocks
    mockJobQueue.enqueue.mockResolvedValue({
      success: true,
      jobId: 'job_google_drive_test',
      priority: 'medium',
      estimatedProcessingTime: 60000
    });
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(documentChunks);
    await db.delete(documents);
  });

  describe('POST /api/v1/google-drive/upload', () => {
    it('successfully processes complete Google Drive folder with mixed document types', async () => {
      const requestBody = {
        folderId: 'folder_mixed_docs',
        folderPath: '/PC/TestSupplier/TestIngredient/',
        options: {
          priority: 'high',
          aiEnhancement: true,
          chunkingStrategy: 'auto',
          processingMode: 'immediate'
        },
        filters: {
          includeFileTypes: ['pdf'],
          excludePatterns: ['~$', '.tmp'],
          minFileSize: 1024,
          maxFileSize: 10485760
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({
        processedFiles: expect.arrayContaining([
          expect.objectContaining({
            fileId: 'file_sds_1',
            documentId: expect.any(String),
            filename: 'sodium-chloride-sds.pdf',
            status: 'completed'
          }),
          expect.objectContaining({
            fileId: 'file_spec_1',
            documentId: expect.any(String),
            filename: 'vitamin-e-specification.pdf',
            status: 'completed'
          }),
          expect.objectContaining({
            fileId: 'file_cert_1',
            documentId: expect.any(String),
            filename: 'halal-certificate.pdf',
            status: 'completed'
          })
        ]),
        summary: {
          totalFiles: 3,
          processedFiles: 3,
          failedFiles: 0,
          skippedFiles: 0,
          totalProcessingTime: expect.any(Number)
        },
        qualityMetrics: {
          averageOcrConfidence: 0.95,
          averageQualityScore: expect.any(Number),
          documentTypeDistribution: expect.objectContaining({
            sds: expect.any(Number),
            specification: expect.any(Number),
            certificate: expect.any(Number)
          })
        }
      });

      // Verify all documents were stored in database
      const storedDocuments = await db.select().from(documents);
      expect(storedDocuments).toHaveLength(3);

      // Verify document types were correctly identified
      const sdsDoc = storedDocuments.find(doc => doc.filename === 'sodium-chloride-sds.pdf');
      expect(sdsDoc?.metadata?.documentType).toContain('sds');

      const specDoc = storedDocuments.find(doc => doc.filename === 'vitamin-e-specification.pdf');
      expect(specDoc?.metadata?.documentType).toContain('spec');

      const certDoc = storedDocuments.find(doc => doc.filename === 'halal-certificate.pdf');
      expect(certDoc?.metadata?.documentType).toContain('cert');

      // Verify chunks were created and embedded
      const storedChunks = await db.select().from(documentChunks);
      expect(storedChunks.length).toBeGreaterThan(0);
      expect(storedChunks.every(chunk => chunk.embedding !== null)).toBe(true);
    });

    it('processes Google Drive folder asynchronously with job queue', async () => {
      const requestBody = {
        folderId: 'folder_async_processing',
        folderPath: '/PC/AsyncSupplier/AsyncIngredient/',
        options: {
          priority: 'low',
          processingMode: 'async',
          aiEnhancement: true
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
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
      expect(data.data.jobId).toBe('job_google_drive_test');
      expect(data.data.processedFiles).toHaveLength(3);
      expect(data.data.estimatedProcessingTime).toBe(60000);

      // Verify job was enqueued for each file
      expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(3);
      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'PROCESS_DOCUMENT',
          fileId: expect.any(String),
          filename: expect.any(String)
        }),
        { priority: 'low' }
      );
    });

    it('handles Google Drive API errors gracefully', async () => {
      mockGoogleDriveService.listFolderContents.mockResolvedValue({
        success: false,
        error: 'Google Drive API error: Folder not found',
        items: [],
        nextPageToken: null,
        totalItems: 0
      });

      const requestBody = {
        folderId: 'folder_not_found',
        folderPath: '/PC/NonExistent/Folder/',
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
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
      expect(data.error).toContain('Google Drive API error');
    });

    it('applies file filters correctly', async () => {
      // Mock folder with mixed file types
      mockGoogleDriveService.listFolderContents.mockResolvedValue({
        success: true,
        items: [
          {
            id: 'file_pdf_valid',
            name: 'valid-document.pdf',
            mimeType: 'application/pdf',
            size: 2048000, // 2MB - within limits
            modifiedTime: '2024-01-01T10:00:00Z',
            parents: ['folder_test'],
            webViewLink: 'https://drive.google.com/file/d/file_pdf_valid/view',
            thumbnailLink: null,
            isFolder: false
          },
          {
            id: 'file_docx_excluded',
            name: 'excluded-document.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: 1024000,
            modifiedTime: '2024-01-01T10:00:00Z',
            parents: ['folder_test'],
            webViewLink: 'https://drive.google.com/file/d/file_docx_excluded/view',
            thumbnailLink: null,
            isFolder: false
          },
          {
            id: 'file_too_small',
            name: 'tiny-file.pdf',
            mimeType: 'application/pdf',
            size: 512, // Too small
            modifiedTime: '2024-01-01T10:00:00Z',
            parents: ['folder_test'],
            webViewLink: 'https://drive.google.com/file/d/file_too_small/view',
            thumbnailLink: null,
            isFolder: false
          },
          {
            id: 'file_temp_excluded',
            name: '~$temp-file.pdf',
            mimeType: 'application/pdf',
            size: 2048000,
            modifiedTime: '2024-01-01T10:00:00Z',
            parents: ['folder_test'],
            webViewLink: 'https://drive.google.com/file/d/file_temp_excluded/view',
            thumbnailLink: null,
            isFolder: false
          }
        ],
        nextPageToken: null,
        totalItems: 4
      });

      const requestBody = {
        folderId: 'folder_filtered',
        folderPath: '/PC/FilterTest/Ingredient/',
        options: {
          processingMode: 'immediate'
        },
        filters: {
          includeFileTypes: ['pdf'],
          excludePatterns: ['~$', '.tmp'],
          minFileSize: 1024,
          maxFileSize: 10485760
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.processedFiles).toHaveLength(1); // Only the valid PDF
      expect(data.data.processedFiles[0].fileId).toBe('file_pdf_valid');
      expect(data.data.summary.skippedFiles).toBe(3); // 3 files filtered out
    });

    it('handles partial processing failures', async () => {
      // Mock one file download failure
      mockGoogleDriveService.downloadFile.mockImplementation(async (fileId: string) => {
        if (fileId === 'file_sds_1') {
          return {
            success: false,
            error: 'File download failed: Network error',
            content: null,
            metadata: null
          };
        }

        return {
          success: true,
          content: Buffer.from('Valid file content'),
          metadata: {
            filename: 'valid-file.pdf',
            mimeType: 'application/pdf',
            size: 1024
          }
        };
      });

      const requestBody = {
        folderId: 'folder_partial_failure',
        folderPath: '/PC/PartialFailure/Ingredient/',
        options: {
          processingMode: 'immediate',
          continueOnError: true
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.processedFiles).toHaveLength(3);

      // Check that one file failed
      const failedFile = data.data.processedFiles.find(
        (file: any) => file.fileId === 'file_sds_1'
      );
      expect(failedFile.status).toBe('error');
      expect(failedFile.error).toContain('File download failed');

      // Check that other files succeeded
      const successfulFiles = data.data.processedFiles.filter(
        (file: any) => file.status === 'completed'
      );
      expect(successfulFiles).toHaveLength(2);

      expect(data.data.summary.processedFiles).toBe(2);
      expect(data.data.summary.failedFiles).toBe(1);
    });

    it('validates folder permissions and access', async () => {
      mockGoogleDriveService.listFolderContents.mockResolvedValue({
        success: false,
        error: 'Google Drive API error: Insufficient permissions',
        items: [],
        nextPageToken: null,
        totalItems: 0
      });

      const requestBody = {
        folderId: 'folder_no_permissions',
        folderPath: '/PC/NoAccess/Folder/',
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient permissions');
    });

    it('handles empty folder gracefully', async () => {
      mockGoogleDriveService.listFolderContents.mockResolvedValue({
        success: true,
        items: [],
        nextPageToken: null,
        totalItems: 0
      });

      const requestBody = {
        folderId: 'folder_empty',
        folderPath: '/PC/Empty/Folder/',
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.processedFiles).toEqual([]);
      expect(data.data.summary.totalFiles).toBe(0);
    });

    it('processes large folder with pagination', async () => {
      // Mock paginated response
      mockGoogleDriveService.listFolderContents
        .mockResolvedValueOnce({
          success: true,
          items: Array.from({ length: 50 }, (_, i) => ({
            id: `file_page1_${i}`,
            name: `document-${i}.pdf`,
            mimeType: 'application/pdf',
            size: 1024000,
            modifiedTime: '2024-01-01T10:00:00Z',
            parents: ['folder_large'],
            webViewLink: `https://drive.google.com/file/d/file_page1_${i}/view`,
            thumbnailLink: null,
            isFolder: false
          })),
          nextPageToken: 'page2_token',
          totalItems: 100
        })
        .mockResolvedValueOnce({
          success: true,
          items: Array.from({ length: 50 }, (_, i) => ({
            id: `file_page2_${i}`,
            name: `document-${i + 50}.pdf`,
            mimeType: 'application/pdf',
            size: 1024000,
            modifiedTime: '2024-01-01T10:00:00Z',
            parents: ['folder_large'],
            webViewLink: `https://drive.google.com/file/d/file_page2_${i}/view`,
            thumbnailLink: null,
            isFolder: false
          })),
          nextPageToken: null,
          totalItems: 100
        });

      const requestBody = {
        folderId: 'folder_large',
        folderPath: '/PC/LargeFolder/Ingredient/',
        options: {
          processingMode: 'async', // Use async for large folders
          batchSize: 25
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(202);
      expect(data.success).toBe(true);
      expect(data.data.processedFiles).toHaveLength(100);
      expect(data.data.summary.totalFiles).toBe(100);

      // Verify pagination was handled correctly
      expect(mockGoogleDriveService.listFolderContents).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('retries failed operations with exponential backoff', async () => {
      // Mock temporary failure followed by success
      mockGoogleDriveService.downloadFile
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce({
          success: true,
          content: Buffer.from('Retry successful content'),
          metadata: {
            filename: 'retry-test.pdf',
            mimeType: 'application/pdf',
            size: 1024
          }
        });

      const requestBody = {
        folderId: 'folder_retry_test',
        folderPath: '/PC/RetryTest/Ingredient/',
        options: {
          processingMode: 'immediate',
          retryFailedFiles: true,
          maxRetries: 3
        }
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify retry occurred
      expect(mockGoogleDriveService.downloadFile).toHaveBeenCalledTimes(4); // 1 retry for first file, normal calls for others
    });

    it('handles API rate limiting gracefully', async () => {
      // Mock rate limit error
      mockGoogleDriveService.listFolderContents.mockResolvedValue({
        success: false,
        error: 'Google Drive API error: Rate limit exceeded',
        items: [],
        nextPageToken: null,
        totalItems: 0
      });

      const requestBody = {
        folderId: 'folder_rate_limited',
        folderPath: '/PC/RateLimit/Test/',
        options: {}
      };

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429); // Too Many Requests
      expect(data.success).toBe(false);
      expect(data.error).toContain('Rate limit exceeded');
    });
  });
});