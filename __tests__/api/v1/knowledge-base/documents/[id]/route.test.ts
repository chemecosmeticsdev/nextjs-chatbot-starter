// Mock modules before importing
jest.mock('@/lib/services/knowledge-base');
jest.mock('@/lib/auth');
jest.mock('@/lib/db');

import { GET, PUT, DELETE } from '@/app/api/v1/knowledge-base/documents/[id]/route';
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

describe('/api/v1/knowledge-base/documents/[id]', () => {
  const documentId = 'doc-123';
  const params = { id: documentId };

  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/knowledge-base/documents/[id]', () => {
    it('successfully gets document details for authorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        title: 'Test Document',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
        processingStatus: 'completed',
        metadata: { category: 'technical', supplier: 'TechCorp' },
        uploadedBy: user.id,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        content: 'base64-encoded-content',
        extractedText: 'This is the extracted text content.'
      };

      const mockChunkCount = [{ count: 15 }];

      const mockProcessingStatus = {
        documentId,
        status: 'completed' as const,
        chunksCreated: 15,
        startedAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-01')
      };

      // Mock database calls
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockChunkCount)
        })
      });

      MockKnowledgeBaseService.getDocumentProcessingStatus.mockResolvedValue(mockProcessingStatus);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(documentId);
      expect(response.data.data.title).toBe('Test Document');
      expect(response.data.data.chunkCount).toBe(15);
      expect(response.data.data.processingDetails).toEqual(mockProcessingStatus);

      // Should not include content by default
      expect(response.data.data.content).toBeUndefined();
      expect(response.data.data.chunks).toBeUndefined();
    });

    it('includes content and chunks when requested', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        title: 'Test Document',
        filename: 'test.pdf',
        content: 'base64-content',
        extractedText: 'extracted text',
        processingStatus: 'completed',
        metadata: {},
        uploadedBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockChunks = [
        {
          id: 'chunk-1',
          chunkIndex: 0,
          content: 'First chunk content',
          metadata: {},
          createdAt: new Date()
        },
        {
          id: 'chunk-2',
          chunkIndex: 1,
          content: 'Second chunk content',
          metadata: {},
          createdAt: new Date()
        }
      ];

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue([{ count: 2 }])
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue(mockChunks)
          })
        })
      });

      MockKnowledgeBaseService.getDocumentProcessingStatus.mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params }, new URLSearchParams({ include_content: 'true', include_chunks: 'true' }));

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.content).toBe('base64-content');
      expect(response.data.data.extractedText).toBe('extracted text');
      expect(response.data.data.chunks).toHaveLength(2);
      expect(response.data.data.chunks[0].chunkIndex).toBe(0);
    });

    it('returns 404 for non-existent document', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /api/v1/knowledge-base/documents/[id]', () => {
    it('successfully reprocesses document for authorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        uploadedBy: user.id,
        title: 'Test Document',
        processingStatus: 'completed'
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      });

      MockKnowledgeBaseService.reprocessDocument.mockResolvedValue(true);

      const updateData = {
        action: 'reprocess'
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData,
        headers: { 'Content-Type': 'application/json' }
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.action).toBe('reprocess');
      expect(response.data.data.success).toBe(true);

      expect(MockKnowledgeBaseService.reprocessDocument).toHaveBeenCalledWith(documentId);
    });

    it('successfully updates document metadata', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        uploadedBy: user.id,
        metadata: { category: 'old-category' }
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue({ affectedRows: 1 })
        })
      });

      const updateData = {
        action: 'update_metadata',
        metadata: {
          category: 'new-category',
          priority: 'high'
        }
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.action).toBe('update_metadata');
      expect(response.data.data.success).toBe(true);
      expect(response.data.data.updatedMetadata).toEqual({
        category: 'new-category',
        priority: 'high'
      });
    });

    it('successfully deletes document', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        uploadedBy: user.id
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      });

      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ affectedRows: 1 })
      });

      const updateData = {
        action: 'delete'
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.action).toBe('delete');
      expect(response.data.data.success).toBe(true);
    });

    it('requires permissions for reprocessing non-owned documents', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        uploadedBy: 'different-user-id'
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      });

      const updateData = {
        action: 'reprocess'
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectErrorResponse(response, 403);
      expect(response.data.code).toBe('FORBIDDEN');
    });

    it('validates update data', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const invalidUpdateData = {
        action: 'invalid_action'
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: invalidUpdateData
      }, { params });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for non-existent document', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      const updateData = {
        action: 'reprocess'
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: { action: 'reprocess' }
      }, { params });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /api/v1/knowledge-base/documents/[id]', () => {
    it('successfully deletes document for authorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        uploadedBy: user.id,
        filename: 'test.pdf'
      };

      const mockChunkCount = [{ count: 10 }];

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockChunkCount)
        })
      });

      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ affectedRows: 1 })
      });

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.documentId).toBe(documentId);
      expect(response.data.data.filename).toBe('test.pdf');
      expect(response.data.data.chunksDeleted).toBe(10);
    });

    it('allows super admin to delete any document', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        uploadedBy: 'different-user-id',
        filename: 'test.pdf'
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue([{ count: 5 }])
        })
      });

      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ affectedRows: 1 })
      });

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
    });

    it('requires permissions to delete non-owned documents', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockDocument = {
        id: documentId,
        uploadedBy: 'different-user-id',
        filename: 'test.pdf'
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      });

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectErrorResponse(response, 403);
      expect(response.data.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent document', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for POST requests', async () => {
      const { POST } = await import('@/app/api/v1/knowledge-base/documents/[id]/route');

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for PATCH requests', async () => {
      const { PATCH } = await import('@/app/api/v1/knowledge-base/documents/[id]/route');

      const response = await callApiRoute(PATCH, {
        method: 'PATCH'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});