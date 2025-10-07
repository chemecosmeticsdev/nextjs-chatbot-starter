// Mock modules before importing
jest.mock('@/lib/services/knowledge-base');
jest.mock('@/lib/auth');
jest.mock('@/lib/db');

import { GET, POST, PUT } from '@/app/api/v1/knowledge-base/documents/route';
import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData,
  testAssertions
} from '@/lib/test-utils';

const MockKnowledgeBaseService = jest.mocked(require('@/lib/services/knowledge-base').KnowledgeBaseService);
const mockDb = jest.mocked(require('@/lib/db').db);

// Set up the mocked modules
require('@/lib/auth').AuthTokenService = MockAuthService;

describe('/api/v1/knowledge-base/documents', () => {
  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/knowledge-base/documents', () => {
    it('successfully lists documents for authorized admin user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocuments = [
        {
          id: 'doc-123',
          title: 'Machine Learning Guide',
          filename: 'ml-guide.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024000,
          processingStatus: 'completed',
          metadata: { category: 'technical', supplier: 'TechCorp' },
          uploadedBy: user.id,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01')
        },
        {
          id: 'doc-456',
          title: 'Product Specifications',
          filename: 'specs.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 512000,
          processingStatus: 'processing',
          metadata: { category: 'product', supplier: 'SupplierA' },
          uploadedBy: user.id,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02')
        }
      ];

      const mockCount = [{ totalCount: 2 }];
      const mockChunkCounts = [
        { document_id: 'doc-123', chunk_count: '15' },
        { document_id: 'doc-456', chunk_count: '8' }
      ];

      // Mock database calls
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockCount)
        })
      });

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockCount)
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockReturnValue(mockDocuments)
              })
            })
          })
        })
      });

      mockDb.execute.mockResolvedValue(mockChunkCounts);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, {}, new URLSearchParams({ page: '1', limit: '20' }));

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.documents).toHaveLength(2);
      expect(response.data.data.documents[0].chunkCount).toBe(15);
      expect(response.data.data.documents[1].chunkCount).toBe(8);
      expect(response.data.data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1
      });
    });

    it('applies search and filter parameters', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocuments = [];
      const mockCount = [{ totalCount: 0 }];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockCount)
        })
      });

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockCount)
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockReturnValue(mockDocuments)
              })
            })
          })
        })
      });

      mockDb.execute.mockResolvedValue([]);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, {}, new URLSearchParams({
        search: 'machine learning',
        category: 'technical',
        status: 'completed',
        from_date: '2024-01-01',
        to_date: '2024-12-31'
      }));

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/knowledge-base/documents', () => {
    it('successfully uploads and processes a new document', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockNewDocument = {
        id: 'new-doc-123',
        title: 'New Document',
        filename: 'new-doc.txt',
        mimeType: 'text/plain',
        fileSize: 1000,
        processingStatus: 'pending',
        uploadedBy: user.id,
        createdAt: new Date()
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockNewDocument])
        })
      });

      const uploadData = {
        filename: 'test-document.txt',
        content: btoa('This is a test document content.'),
        mimeType: 'text/plain',
        metadata: {
          category: 'test',
          description: 'Test document for unit testing'
        },
        processingOptions: {
          chunkSize: 500,
          chunkOverlap: 50
        }
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: uploadData,
        headers: { 'Content-Type': 'application/json' }
      });

      testAssertions.expectValidResponse(response, 201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.documentId).toBe('new-doc-123');
      expect(response.data.data.status).toBe('processing');
      expect(response.data.data.filename).toBe('test-document.txt');
    });

    it('validates upload data', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const invalidUploadData = {
        filename: '', // Empty filename
        content: '', // Empty content
        mimeType: '', // Empty MIME type
        processingOptions: {
          chunkSize: 50, // Too small
          chunkOverlap: 600 // Too large
        }
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: invalidUploadData
      });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('handles upload errors gracefully', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue(new Error('Database error'))
        })
      });

      const uploadData = {
        filename: 'test.txt',
        content: btoa('test content'),
        mimeType: 'text/plain'
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: uploadData
      });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('UPLOAD_FAILED');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: { filename: 'test.txt', content: 'test', mimeType: 'text/plain' }
      });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /api/v1/knowledge-base/documents', () => {
    it('successfully performs bulk operations for super admin', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      MockKnowledgeBaseService.reprocessDocument
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const bulkData = {
        documentIds: ['doc-123', 'doc-456'],
        action: 'reprocess' as const,
        processingOptions: {
          priority: 'high' as const
        }
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: bulkData,
        headers: { 'Content-Type': 'application/json' }
      });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.summary.total).toBe(2);
      expect(response.data.data.summary.successful).toBe(1);
      expect(response.data.data.summary.failed).toBe(1);

      expect(MockKnowledgeBaseService.reprocessDocument).toHaveBeenCalledTimes(2);
    });

    it('performs bulk delete operations', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ affectedRows: 1 })
      });

      const bulkData = {
        documentIds: ['doc-to-delete'],
        action: 'delete' as const
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: bulkData
      });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.summary.successful).toBe(1);
    });

    it('requires super admin or admin permissions', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const bulkData = {
        documentIds: ['doc-123'],
        action: 'reprocess' as const
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: bulkData
      });

      testAssertions.expectErrorResponse(response, 403);
      expect(response.data.code).toBe('FORBIDDEN');
    });

    it('validates bulk operation data', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const invalidBulkData = {
        documentIds: [], // Empty array
        action: 'invalid_action' as any // Invalid action
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: invalidBulkData
      });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('handles bulk operation errors', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      MockKnowledgeBaseService.reprocessDocument.mockRejectedValue(
        new Error('Processing failed')
      );

      const bulkData = {
        documentIds: ['doc-123'],
        action: 'reprocess' as const
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: bulkData
      });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.summary.failed).toBe(1);
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: { documentIds: ['doc-123'], action: 'reprocess' }
      });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for DELETE requests', async () => {
      const { DELETE } = await import('@/app/api/v1/knowledge-base/documents/route');

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for PATCH requests', async () => {
      const { PATCH } = await import('@/app/api/v1/knowledge-base/documents/route');

      const response = await callApiRoute(PATCH, {
        method: 'PATCH'
      });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});