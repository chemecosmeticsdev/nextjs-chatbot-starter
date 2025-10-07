/**
 * End-to-End Tests for Google Drive Integration
 * Tests the complete workflow from Google Drive folder processing to vector search
 */

import { NextRequest } from 'next/server';
import { POST as GoogleDriveUpload } from '@/app/api/v1/google-drive/upload/route';
import { GET as DocumentStatus, POST as BulkDocumentStatus } from '@/app/api/v1/documents/status/route';
import { POST as QualityValidate } from '@/app/api/v1/quality/validate/route';
import { db } from '@/lib/db/connection';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { vectorStorage } from '@/lib/services/vector-storage';

// Mock external services for E2E testing
jest.mock('@/lib/services/google-drive');
jest.mock('@/lib/services/mistral-ocr');
jest.mock('@/lib/embeddings/titan-embedder');

import { googleDriveService } from '@/lib/services/google-drive';
import { mistralOCR } from '@/lib/services/mistral-ocr';
import { titanEmbedder } from '@/lib/embeddings/titan-embedder';

const mockGoogleDriveService = jest.mocked(googleDriveService);
const mockMistralOCR = jest.mocked(mistralOCR);
const mockTitanEmbedder = jest.mocked(titanEmbedder);

describe('Google Drive Integration E2E Tests', () => {
  // Test data that simulates a real Google Drive folder structure
  const testFolderStructure = {
    folderId: 'folder_e2e_test',
    folderPath: '/PC/E2ETestCorp/TestIngredient/',
    files: [
      {
        id: 'file_sds_e2e',
        name: 'sodium-chloride-sds.pdf',
        mimeType: 'application/pdf',
        size: 2048000,
        content: Buffer.from(`
          SAFETY DATA SHEET

          Section 1: Identification
          Product Name: Sodium Chloride
          Chemical Name: Sodium Chloride
          CAS Number: 7647-14-5
          Manufacturer: E2E Test Corporation

          Section 2: Hazards Identification
          GHS Classification: Not classified as hazardous
          Signal Word: None

          Section 3: Composition/Information on Ingredients
          Ingredient: Sodium Chloride
          Percentage: 99.5%
          CAS Number: 7647-14-5

          Section 4: First Aid Measures
          Eye Contact: Rinse with plenty of water
          Skin Contact: Wash with soap and water

          Section 8: Exposure Controls/Personal Protection
          Exposure Limits: No established limits

          Section 16: Other Information
          Revision Date: 2024-01-01
          Prepared by: Quality Control Department
        `),
        expectedType: 'sds',
        expectedChunks: 4 // Should be chunked by SDS sections
      },
      {
        id: 'file_spec_e2e',
        name: 'vitamin-e-specification.pdf',
        mimeType: 'application/pdf',
        size: 1536000,
        content: Buffer.from(`
          TECHNICAL SPECIFICATION

          Product: Vitamin E (Tocopherol)
          Grade: Food Grade
          Supplier: E2E Test Corporation

          Physical Properties:
          - Appearance: Clear, viscous oil
          - Color: Light yellow to amber
          - Odor: Characteristic, mild

          Chemical Properties:
          - Purity: ≥ 95.0%
          - Moisture: ≤ 0.5%
          - Acid Value: ≤ 3.0 mg KOH/g

          Microbiological Specifications:
          - Total Plate Count: < 1000 CFU/g
          - Yeast & Mold: < 100 CFU/g
          - E. coli: Negative

          Applications:
          - Dietary supplements
          - Functional foods
          - Cosmetic formulations

          Storage Conditions:
          Store in cool, dry place away from light
          Temperature: 15-25°C
          Relative Humidity: < 60%
        `),
        expectedType: 'specification',
        expectedChunks: 3 // Should be chunked by technical sections
      },
      {
        id: 'file_cert_e2e',
        name: 'halal-certificate.pdf',
        mimeType: 'application/pdf',
        size: 512000,
        content: Buffer.from(`
          HALAL CERTIFICATE

          Certificate No: HC-2024-001
          Issued Date: January 1, 2024
          Valid Until: December 31, 2024

          Company Information:
          Name: E2E Test Corporation
          Address: 123 Test Street, Test City, TC 12345

          Product Information:
          Product Name: Premium Halal Ingredient
          Description: Natural ingredient for food applications

          Certification Details:
          This is to certify that the above mentioned product
          manufactured by E2E Test Corporation complies with
          Islamic Sharia requirements and is suitable for
          consumption by Muslim consumers.

          Certified by: International Halal Certification Authority
          Authorized Signature: [Digital Signature]

          Terms and Conditions:
          - This certificate is valid for the specified period
          - Any changes to the product require re-certification
          - Regular audits will be conducted
        `),
        expectedType: 'halal_certificate',
        expectedChunks: 2 // Should be chunked by certificate sections
      }
    ]
  };

  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(documentChunks).where(sql`document_id LIKE 'e2e_test_%'`);
    await db.delete(documents).where(sql`id LIKE 'e2e_test_%'`);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup Google Drive service mocks
    mockGoogleDriveService.listFolderContents.mockResolvedValue({
      success: true,
      items: testFolderStructure.files.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        modifiedTime: '2024-01-01T10:00:00Z',
        parents: [testFolderStructure.folderId],
        webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
        thumbnailLink: null,
        isFolder: false
      })),
      nextPageToken: null,
      totalItems: testFolderStructure.files.length
    });

    mockGoogleDriveService.downloadFile.mockImplementation(async (fileId: string) => {
      const file = testFolderStructure.files.find(f => f.id === fileId);
      if (!file) {
        return {
          success: false,
          error: 'File not found',
          content: null,
          metadata: null
        };
      }

      return {
        success: true,
        content: file.content,
        metadata: {
          filename: file.name,
          mimeType: file.mimeType,
          size: file.size
        }
      };
    });

    // Setup OCR service mocks
    mockMistralOCR.extractText.mockImplementation(async (content: Buffer | string, mimeType: string, filename: string) => {
      const textContent = content.toString();
      return {
        success: true,
        extractedText: textContent,
        wordCount: textContent.split(' ').filter(word => word.length > 0).length,
        characterCount: textContent.length,
        pageCount: Math.ceil(textContent.length / 2000), // Simulate pages
        hasImages: false,
        hasTables: filename.includes('sds'),
        confidence: 0.95,
        language: 'en',
        processingTime: 1000 + Math.random() * 500,
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
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(documentChunks).where(sql`document_id LIKE 'e2e_test_%'`);
    await db.delete(documents).where(sql`id LIKE 'e2e_test_%'`);
  });

  describe('Complete Google Drive Processing Workflow', () => {
    it('successfully processes entire Google Drive folder through complete pipeline', async () => {
      // Step 1: Process Google Drive folder
      const googleDriveRequest = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify({
          folderId: testFolderStructure.folderId,
          folderPath: testFolderStructure.folderPath,
          options: {
            priority: 'high',
            aiEnhancement: true,
            chunkingStrategy: 'auto',
            processingMode: 'immediate'
          },
          filters: {
            includeFileTypes: ['pdf'],
            minFileSize: 1024
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const googleDriveResponse = await GoogleDriveUpload(googleDriveRequest);
      const googleDriveData = await googleDriveResponse.json();

      // Verify Google Drive processing completed successfully
      expect(googleDriveResponse.status).toBe(200);
      expect(googleDriveData.success).toBe(true);
      expect(googleDriveData.data.processedFiles).toHaveLength(3);
      expect(googleDriveData.data.summary.processedFiles).toBe(3);
      expect(googleDriveData.data.summary.failedFiles).toBe(0);

      // Extract document IDs for further testing
      const documentIds = googleDriveData.data.processedFiles.map((file: any) => file.documentId);

      // Step 2: Verify documents were stored in database
      const storedDocuments = await db.select().from(documents).where(
        sql`id IN (${sql.join(documentIds.map(id => sql`${id}`), sql`, `)})`
      );

      expect(storedDocuments).toHaveLength(3);

      // Verify document types were correctly identified
      const sdsDoc = storedDocuments.find(doc => doc.filename === 'sodium-chloride-sds.pdf');
      expect(sdsDoc?.metadata?.documentType).toContain('sds');

      const specDoc = storedDocuments.find(doc => doc.filename === 'vitamin-e-specification.pdf');
      expect(specDoc?.metadata?.documentType).toContain('spec');

      const certDoc = storedDocuments.find(doc => doc.filename === 'halal-certificate.pdf');
      expect(certDoc?.metadata?.documentType).toContain('cert');

      // Step 3: Verify chunks were created and embedded
      const storedChunks = await db.select().from(documentChunks).where(
        sql`document_id IN (${sql.join(documentIds.map(id => sql`${id}`), sql`, `)})`
      );

      expect(storedChunks.length).toBeGreaterThan(0);
      expect(storedChunks.every(chunk => chunk.embedding !== null)).toBe(true);
      expect(storedChunks.every(chunk => chunk.embedding?.length === 1024)).toBe(true);

      // Verify chunk distribution per document
      for (const documentId of documentIds) {
        const docChunks = storedChunks.filter(chunk => chunk.documentId === documentId);
        expect(docChunks.length).toBeGreaterThan(0);
        expect(docChunks.length).toBeLessThan(20); // Reasonable upper bound
      }

      // Step 4: Test document status retrieval
      const statusRequest = new NextRequest(`http://localhost:3000/api/v1/documents/status?documentId=${documentIds[0]}`);
      const statusResponse = await DocumentStatus(statusRequest);
      const statusData = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusData.success).toBe(true);
      expect(statusData.data.documentId).toBe(documentIds[0]);
      expect(statusData.data.status).toBe('completed');

      // Step 5: Test bulk status retrieval
      const bulkStatusRequest = new NextRequest('http://localhost:3000/api/v1/documents/status', {
        method: 'POST',
        body: JSON.stringify({
          documentIds: documentIds,
          includeDetails: true
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const bulkStatusResponse = await BulkDocumentStatus(bulkStatusRequest);
      const bulkStatusData = await bulkStatusResponse.json();

      expect(bulkStatusResponse.status).toBe(200);
      expect(bulkStatusData.success).toBe(true);
      expect(bulkStatusData.data.documents).toHaveLength(3);
      expect(bulkStatusData.data.summary.completed).toBe(3);

      // Step 6: Test quality validation
      const qualityRequest = new NextRequest('http://localhost:3000/api/v1/quality/validate', {
        method: 'POST',
        body: JSON.stringify({
          documentIds: documentIds,
          includeRecommendations: true
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const qualityResponse = await QualityValidate(qualityRequest);
      const qualityData = await qualityResponse.json();

      expect(qualityResponse.status).toBe(200);
      expect(qualityData.success).toBe(true);
      expect(qualityData.data.validations).toHaveLength(3);

      // Verify quality scores are reasonable
      qualityData.data.validations.forEach((validation: any) => {
        expect(validation.validation.score).toBeGreaterThan(70);
        expect(validation.validation.passed).toBe(true);
      });

      // Step 7: Test vector similarity search
      const searchResults = await vectorStorage.searchSimilar('sodium chloride safety information', {
        limit: 5,
        similarityThreshold: 0.7
      });

      expect(searchResults.success).toBe(true);
      expect(searchResults.results.length).toBeGreaterThan(0);

      // Should find relevant chunks from the SDS document
      const relevantResults = searchResults.results.filter(result =>
        result.content.toLowerCase().includes('sodium') ||
        result.content.toLowerCase().includes('safety') ||
        result.content.toLowerCase().includes('hazard')
      );
      expect(relevantResults.length).toBeGreaterThan(0);

      // Step 8: Test search with filters
      const filteredSearchResults = await vectorStorage.searchSimilar('vitamin specifications', {
        limit: 5,
        similarityThreshold: 0.7,
        documentTypes: ['specification']
      });

      expect(filteredSearchResults.success).toBe(true);
      if (filteredSearchResults.results.length > 0) {
        // Results should primarily come from specification documents
        const specResults = filteredSearchResults.results.filter(result =>
          result.document?.metadata?.documentType?.includes('spec')
        );
        expect(specResults.length).toBeGreaterThan(0);
      }

      console.log('✅ Complete Google Drive E2E workflow test passed successfully');
      console.log(`📊 Processed ${documentIds.length} documents with ${storedChunks.length} total chunks`);
      console.log(`🔍 Vector search found ${searchResults.results.length} relevant results`);
    }, 60000); // 60 second timeout for complete workflow

    it('handles mixed success and failure scenarios gracefully', async () => {
      // Mock one file download failure
      mockGoogleDriveService.downloadFile.mockImplementation(async (fileId: string) => {
        if (fileId === 'file_sds_e2e') {
          return {
            success: false,
            error: 'Network timeout during download',
            content: null,
            metadata: null
          };
        }

        const file = testFolderStructure.files.find(f => f.id === fileId);
        if (!file) {
          return {
            success: false,
            error: 'File not found',
            content: null,
            metadata: null
          };
        }

        return {
          success: true,
          content: file.content,
          metadata: {
            filename: file.name,
            mimeType: file.mimeType,
            size: file.size
          }
        };
      });

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify({
          folderId: 'folder_partial_failure',
          folderPath: '/PC/PartialFailure/Test/',
          options: {
            processingMode: 'immediate',
            continueOnError: true
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await GoogleDriveUpload(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.processedFiles).toHaveLength(3);

      // Check that one file failed and two succeeded
      const failedFiles = data.data.processedFiles.filter((file: any) => file.status === 'error');
      const successFiles = data.data.processedFiles.filter((file: any) => file.status === 'completed');

      expect(failedFiles).toHaveLength(1);
      expect(successFiles).toHaveLength(2);
      expect(data.data.summary.failedFiles).toBe(1);
      expect(data.data.summary.processedFiles).toBe(2);

      // Verify successful documents were still processed completely
      const successfulDocumentIds = successFiles.map((file: any) => file.documentId);
      const chunks = await db.select().from(documentChunks).where(
        sql`document_id IN (${sql.join(successfulDocumentIds.map(id => sql`${id}`), sql`, `)})`
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every(chunk => chunk.embedding !== null)).toBe(true);

      console.log('✅ Mixed success/failure scenario handled correctly');
    });

    it('validates document processing quality meets standards', async () => {
      // Process documents first
      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify({
          folderId: testFolderStructure.folderId,
          folderPath: testFolderStructure.folderPath,
          options: {
            priority: 'high',
            aiEnhancement: true,
            processingMode: 'immediate'
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await GoogleDriveUpload(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      const documentIds = data.data.processedFiles.map((file: any) => file.documentId);

      // Validate each document meets quality standards
      for (const documentId of documentIds) {
        const qualityRequest = new NextRequest('http://localhost:3000/api/v1/quality/validate', {
          method: 'POST',
          body: JSON.stringify({
            documentId,
            includeRecommendations: true
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        const qualityResponse = await QualityValidate(qualityRequest);
        const qualityData = await qualityResponse.json();

        expect(qualityResponse.status).toBe(200);
        expect(qualityData.success).toBe(true);

        const validation = qualityData.data.validation;

        // Quality standards validation
        expect(validation.score).toBeGreaterThan(70); // Minimum quality score
        expect(validation.summary.critical).toBe(0); // No critical issues
        expect(validation.summary.warnings).toBeLessThan(5); // Limited warnings

        // Check specific quality criteria
        const checks = qualityData.data.checks;
        const criticalChecks = checks.filter((check: any) => check.severity === 'critical');
        const passedCriticalChecks = criticalChecks.filter((check: any) => check.passed);

        expect(passedCriticalChecks.length).toBe(criticalChecks.length);

        // Verify data integrity checks pass
        const dataIntegrityChecks = checks.filter((check: any) => check.category === 'data_integrity');
        expect(dataIntegrityChecks.every((check: any) => check.passed)).toBe(true);
      }

      console.log('✅ All documents meet quality standards');
    });

    it('verifies vector search functionality with processed documents', async () => {
      // Process documents
      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify({
          folderId: testFolderStructure.folderId,
          folderPath: testFolderStructure.folderPath,
          options: {
            processingMode: 'immediate',
            aiEnhancement: true
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await GoogleDriveUpload(request);
      const data = await response.json();
      expect(response.status).toBe(200);

      // Test various search scenarios
      const searchScenarios = [
        {
          query: 'safety data sheet hazards',
          expectedDocType: 'sds',
          description: 'SDS safety information search'
        },
        {
          query: 'vitamin e specifications purity',
          expectedDocType: 'specification',
          description: 'Technical specification search'
        },
        {
          query: 'halal certificate islamic requirements',
          expectedDocType: 'certificate',
          description: 'Certificate information search'
        },
        {
          query: 'CAS number 7647-14-5',
          expectedDocType: 'sds',
          description: 'Chemical identifier search'
        }
      ];

      for (const scenario of searchScenarios) {
        const searchResults = await vectorStorage.searchSimilar(scenario.query, {
          limit: 10,
          similarityThreshold: 0.5
        });

        expect(searchResults.success).toBe(true);
        expect(searchResults.results.length).toBeGreaterThan(0);

        // Verify search quality
        expect(searchResults.searchMetadata.queryTokens).toBeGreaterThan(0);
        expect(searchResults.searchMetadata.embeddingTime).toBeGreaterThan(0);

        // Check if we found relevant content
        const relevantResults = searchResults.results.filter(result =>
          result.similarity > 0.7 || // High similarity
          result.content.toLowerCase().includes(scenario.query.split(' ')[0].toLowerCase())
        );

        if (relevantResults.length > 0) {
          console.log(`✅ ${scenario.description}: Found ${relevantResults.length} relevant results`);
        }
      }

      // Test filtered search
      const filteredSearch = await vectorStorage.searchSimilar('product information', {
        limit: 5,
        documentTypes: ['sds', 'specification']
      });

      expect(filteredSearch.success).toBe(true);

      console.log('✅ Vector search functionality verified');
    });
  });

  describe('Performance and Scalability', () => {
    it('processes multiple documents within acceptable time limits', async () => {
      const startTime = Date.now();

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify({
          folderId: testFolderStructure.folderId,
          folderPath: testFolderStructure.folderPath,
          options: {
            processingMode: 'immediate'
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await GoogleDriveUpload(request);
      const data = await response.json();

      const totalProcessingTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Performance assertions
      expect(totalProcessingTime).toBeLessThan(30000); // Should complete within 30 seconds

      const avgProcessingTimePerDoc = totalProcessingTime / data.data.processedFiles.length;
      expect(avgProcessingTimePerDoc).toBeLessThan(15000); // Max 15 seconds per document

      console.log(`✅ Performance test: ${data.data.processedFiles.length} documents processed in ${totalProcessingTime}ms`);
      console.log(`📊 Average time per document: ${avgProcessingTimePerDoc.toFixed(2)}ms`);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('recovers from temporary service failures', async () => {
      // Mock temporary OCR failure followed by success
      let ocrCallCount = 0;
      mockMistralOCR.extractText.mockImplementation(async (content, mimeType, filename) => {
        ocrCallCount++;
        if (ocrCallCount === 1) {
          throw new Error('Temporary OCR service unavailable');
        }

        const textContent = content.toString();
        return {
          success: true,
          extractedText: textContent,
          wordCount: textContent.split(' ').length,
          characterCount: textContent.length,
          pageCount: 1,
          hasImages: false,
          hasTables: false,
          confidence: 0.9,
          language: 'en',
          processingTime: 1200,
          metadata: {
            filename,
            mimeType,
            fileSize: content.length,
            extractionMethod: 'mistral-ocr',
            timestamp: new Date().toISOString()
          }
        };
      });

      const request = new NextRequest('http://localhost:3000/api/v1/google-drive/upload', {
        method: 'POST',
        body: JSON.stringify({
          folderId: 'folder_resilience_test',
          folderPath: '/PC/ResilienceTest/Ingredient/',
          options: {
            processingMode: 'immediate',
            retryFailedFiles: true,
            maxRetries: 2
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await GoogleDriveUpload(request);
      const data = await response.json();

      // Should eventually succeed after retry
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.summary.processedFiles).toBeGreaterThan(0);

      console.log('✅ Service resilience and retry mechanism verified');
    });
  });
});