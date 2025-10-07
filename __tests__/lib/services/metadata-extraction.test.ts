// Mock modules before importing
jest.mock('@aws-sdk/client-bedrock-runtime');

import { MetadataExtractionService, enhancedMetadataExtractor } from '@/lib/services/metadata-extraction';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const MockBedrockRuntimeClient = jest.mocked(BedrockRuntimeClient);
const MockInvokeModelCommand = jest.mocked(InvokeModelCommand);

describe('MetadataExtractionService', () => {
  let metadataExtractor: MetadataExtractionService;
  let mockClient: jest.Mocked<BedrockRuntimeClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the BedrockRuntimeClient instance
    mockClient = {
      send: jest.fn(),
    } as any;

    MockBedrockRuntimeClient.mockImplementation(() => mockClient);

    metadataExtractor = new MetadataExtractionService();
  });

  describe('extractWithNovaEnhancement', () => {
    it('successfully extracts enhanced metadata with Nova Micro', async () => {
      const extractedText = 'This is a safety data sheet for Sodium Chloride. CAS Number: 7647-14-5. Contains allergen information.';
      const filename = 'sodium-chloride-sds.pdf';
      const folderPath = '/PC/ChemCorp/Sodium Chloride/- Safety Data Sheets/';

      const mockNovaResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: JSON.stringify({
            documentType: 'sds',
            complianceTypes: ['REACH', 'GHS'],
            casNumbers: ['7647-14-5'],
            inciNames: ['Sodium Chloride'],
            allergens: ['none'],
            chemicalNames: ['Sodium Chloride', 'Table Salt'],
            functionCategories: ['preservative'],
            confidenceScore: 0.95,
            keyFindings: ['Contains CAS number', 'Safety data sheet format', 'Chemical identification present']
          })
        }))
      };

      mockClient.send.mockResolvedValue(mockNovaResponse);

      const result = await metadataExtractor.extractWithNovaEnhancement(
        extractedText,
        filename,
        folderPath
      );

      expect(result).toEqual({
        success: true,
        enhancedMetadata: {
          documentType: 'sds',
          complianceTypes: ['REACH', 'GHS'],
          casNumbers: ['7647-14-5'],
          inciNames: ['Sodium Chloride'],
          allergens: ['none'],
          chemicalNames: ['Sodium Chloride', 'Table Salt'],
          functionCategories: ['preservative'],
          confidenceScore: 0.95,
          normalizedSupplier: expect.any(String),
          normalizedIngredient: expect.any(String),
          aiEnhanced: true,
          extractionMethod: 'nova-micro',
          processingTime: expect.any(Number),
          keyFindings: expect.arrayContaining(['Contains CAS number'])
        },
        baseMetadata: expect.objectContaining({
          supplierName: 'ChemCorp',
          ingredientName: 'Sodium Chloride',
          ragDocumentType: 'sds'
        })
      });

      expect(mockClient.send).toHaveBeenCalledWith(expect.any(MockInvokeModelCommand));
    });

    it('handles Nova Micro API failures gracefully', async () => {
      const extractedText = 'Sample document text';
      const filename = 'test.pdf';
      const folderPath = '/PC/TestCorp/TestIngredient/';

      const apiError = new Error('Nova Micro API error');
      mockClient.send.mockRejectedValue(apiError);

      const result = await metadataExtractor.extractWithNovaEnhancement(
        extractedText,
        filename,
        folderPath
      );

      expect(result).toEqual({
        success: false,
        error: 'Nova Micro enhancement failed: Nova Micro API error',
        enhancedMetadata: null,
        baseMetadata: expect.objectContaining({
          supplierName: 'TestCorp',
          ingredientName: 'TestIngredient'
        })
      });
    });

    it('handles malformed Nova Micro responses', async () => {
      const extractedText = 'Sample document';
      const filename = 'test.pdf';

      const malformedResponse = {
        body: new TextEncoder().encode('Invalid JSON response')
      };

      mockClient.send.mockResolvedValue(malformedResponse);

      const result = await metadataExtractor.extractWithNovaEnhancement(
        extractedText,
        filename
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('parsing');
    });
  });

  describe('analyzeWithNovaMicro', () => {
    it('creates proper Nova Micro prompt and processes response', async () => {
      const text = 'Certificate of Analysis for Vitamin C. INCI: Ascorbic Acid. Allergen-free.';
      const context = { documentType: 'certificate_of_analysis', supplier: 'VitaCorp' };

      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: JSON.stringify({
            documentType: 'certificate_of_analysis',
            inciNames: ['Ascorbic Acid'],
            allergens: ['none'],
            complianceTypes: ['Allergen-Free'],
            confidenceScore: 0.92
          })
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await metadataExtractor.analyzeWithNovaMicro(text, context);

      expect(result).toEqual({
        documentType: 'certificate_of_analysis',
        inciNames: ['Ascorbic Acid'],
        allergens: ['none'],
        complianceTypes: ['Allergen-Free'],
        confidenceScore: 0.92,
        aiEnhanced: true,
        extractionMethod: 'nova-micro',
        processingTime: expect.any(Number)
      });

      // Verify the prompt was properly constructed
      const call = mockClient.send.mock.calls[0][0];
      expect(call.input.body).toContain('Certificate of Analysis for Vitamin C');
      expect(call.input.body).toContain('VitaCorp');
    });

    it('handles empty text input', async () => {
      const result = await metadataExtractor.analyzeWithNovaMicro('', {});

      expect(result).toEqual({
        documentType: 'other',
        confidenceScore: 0,
        aiEnhanced: false,
        extractionMethod: 'fallback',
        processingTime: expect.any(Number),
        error: 'No text provided for analysis'
      });

      expect(mockClient.send).not.toHaveBeenCalled();
    });
  });

  describe('extractBasicMetadata', () => {
    it('extracts metadata from folder path structure', () => {
      const folderPath = '/PC/ChemicalSupplier/Vitamin E/- Certificates/';
      const filename = 'vitamin-e-halal-cert.pdf';

      const result = metadataExtractor.extractBasicMetadata(filename, folderPath);

      expect(result).toEqual({
        supplierName: 'ChemicalSupplier',
        supplierNormalized: 'chemicalsupplier',
        ingredientName: 'Vitamin E',
        ingredientNormalized: 'vitamin e',
        ragDocumentType: 'halal_certificate',
        language: 'en',
        isCurrent: true,
        versionStatus: 'current',
        complianceTypes: ['Halal'],
        versionDate: null,
        versionString: null,
        hasImages: false,
        hasTables: false,
        requiresReview: false,
        validationStatus: 'pending',
        qualityScore: 70,
        qualityDimensions: {
          metadata_completeness: 50,
          content_clarity: 70,
          structural_integrity: 70
        }
      });
    });

    it('detects archived documents', () => {
      const folderPath = '/PC/Supplier/Ingredient/- Old/';
      const filename = 'old-document.pdf';

      const result = metadataExtractor.extractBasicMetadata(filename, folderPath);

      expect(result.versionStatus).toBe('archived');
      expect(result.isCurrent).toBe(false);
    });

    it('extracts version information from filename', () => {
      const filename = 'document-v2.1.3-final.pdf';

      const result = metadataExtractor.extractBasicMetadata(filename);

      expect(result.versionString).toBe('2.1.3');
    });

    it('detects document type from filename patterns', () => {
      const testCases = [
        { filename: 'product-sds.pdf', expectedType: 'sds' },
        { filename: 'certificate-of-analysis.pdf', expectedType: 'certificate_of_analysis' },
        { filename: 'halal-certificate.pdf', expectedType: 'halal_certificate' },
        { filename: 'kosher-cert.pdf', expectedType: 'kosher_certificate' },
        { filename: 'technical-data-sheet.pdf', expectedType: 'technical_data_sheet' },
        { filename: 'random-document.pdf', expectedType: 'other' }
      ];

      testCases.forEach(({ filename, expectedType }) => {
        const result = metadataExtractor.extractBasicMetadata(filename);
        expect(result.ragDocumentType).toBe(expectedType);
      });
    });
  });

  describe('classifyDocumentType', () => {
    it('classifies document types correctly based on filename', () => {
      const testCases = [
        { name: 'sodium-chloride-sds.pdf', expected: 'sds' },
        { name: 'vitamin-e-msds.pdf', expected: 'msds' },
        { name: 'product-coa.pdf', expected: 'certificate_of_analysis' },
        { name: 'ingredient-specification.pdf', expected: 'specification' },
        { name: 'halal-certificate.pdf', expected: 'halal_certificate' },
        { name: 'random-file.pdf', expected: 'other' }
      ];

      testCases.forEach(({ name, expected }) => {
        const result = metadataExtractor.classifyDocumentType(name);
        expect(result).toBe(expected);
      });
    });

    it('prioritizes specific patterns over general ones', () => {
      const result = metadataExtractor.classifyDocumentType('safety-data-sheet-sds.pdf');
      expect(result).toBe('sds'); // Should match 'sds' not 'safety_data_sheet'
    });
  });

  describe('normalizeString', () => {
    it('normalizes strings consistently', () => {
      const testCases = [
        { input: 'Chemical Supplier Corp.', expected: 'chemical supplier corp' },
        { input: 'Vitamin-E_Plus', expected: 'vitamin e plus' },
        { input: '  Extra   Spaces  ', expected: 'extra spaces' },
        { input: 'Special@#$Characters', expected: 'specialcharacters' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = metadataExtractor.normalizeString(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('detectComplianceTypes', () => {
    it('detects compliance types from text content', () => {
      const testCases = [
        { text: 'This product is halal certified and kosher approved.', expected: ['Halal', 'Kosher'] },
        { text: 'GMO-free and organic certified ingredient.', expected: ['GMO-Free', 'Organic'] },
        { text: 'REACH compliant and FDA approved.', expected: ['REACH'] },
        { text: 'No specific compliance mentioned.', expected: [] }
      ];

      testCases.forEach(({ text, expected }) => {
        const result = metadataExtractor.detectComplianceTypes(text);
        expect(result).toEqual(expected);
      });
    });
  });

  describe('extractChemicalIdentifiers', () => {
    it('extracts CAS numbers from text', () => {
      const text = 'Chemical ingredients: Water (CAS: 7732-18-5), Sodium Chloride (7647-14-5)';
      const result = metadataExtractor.extractChemicalIdentifiers(text);

      expect(result.casNumbers).toEqual(['7732-18-5', '7647-14-5']);
    });

    it('extracts INCI names from text', () => {
      const text = 'INCI: Aqua, Sodium Chloride, Tocopherol';
      const result = metadataExtractor.extractChemicalIdentifiers(text);

      expect(result.inciNames).toEqual(['Aqua', 'Sodium Chloride', 'Tocopherol']);
    });

    it('extracts EC numbers from text', () => {
      const text = 'EC Number: 231-598-3, also listed as EC 200-001-8';
      const result = metadataExtractor.extractChemicalIdentifiers(text);

      expect(result.ecNumbers).toEqual(['231-598-3', '200-001-8']);
    });

    it('handles text with no chemical identifiers', () => {
      const text = 'This is just regular text with no chemical information.';
      const result = metadataExtractor.extractChemicalIdentifiers(text);

      expect(result).toEqual({
        casNumbers: [],
        inciNames: [],
        ecNumbers: [],
        chemicalNames: []
      });
    });
  });

  describe('calculateQualityScore', () => {
    it('calculates quality score based on metadata completeness', () => {
      const completeMetadata = {
        supplierName: 'TestCorp',
        ingredientName: 'Test Ingredient',
        ragDocumentType: 'sds',
        casNumbers: ['123-45-6'],
        inciNames: ['Test Chemical'],
        complianceTypes: ['REACH'],
        confidenceScore: 0.95
      };

      const score = metadataExtractor.calculateQualityScore(completeMetadata, 'Sample text');

      expect(score).toBeGreaterThan(80);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('penalizes incomplete metadata', () => {
      const incompleteMetadata = {
        supplierName: null,
        ingredientName: null,
        ragDocumentType: 'other'
      };

      const score = metadataExtractor.calculateQualityScore(incompleteMetadata, '');

      expect(score).toBeLessThan(50);
    });
  });

  describe('Singleton export', () => {
    it('exports a singleton instance', () => {
      expect(enhancedMetadataExtractor).toBeInstanceOf(MetadataExtractionService);
      expect(enhancedMetadataExtractor).toBe(enhancedMetadataExtractor); // Same instance
    });
  });

  describe('Error handling and edge cases', () => {
    it('handles null inputs gracefully', () => {
      const result = metadataExtractor.extractBasicMetadata(null as any, null as any);
      expect(result).toBeDefined();
      expect(result.supplierName).toBeNull();
    });

    it('handles empty folder paths', () => {
      const result = metadataExtractor.extractBasicMetadata('test.pdf', '');
      expect(result.supplierName).toBeNull();
      expect(result.ingredientName).toBeNull();
    });

    it('handles malformed folder paths', () => {
      const result = metadataExtractor.extractBasicMetadata('test.pdf', '/random/path/structure/');
      expect(result.supplierName).toBeNull();
      expect(result.ingredientName).toBeNull();
    });
  });
});