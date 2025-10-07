/**
 * Quality Assurance Service for Document Processing Pipeline
 * Validates document processing results and ensures data integrity
 */

import { db } from '@/lib/db/connection';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq, and, sql, count, avg, min, max } from 'drizzle-orm';
import { analyticsService } from './analytics';
import { vectorStorage } from './vector-storage';
import { titanEmbedder } from '@/lib/embeddings/titan-embedder';

export interface QualityCheck {
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'data_integrity' | 'processing_quality' | 'metadata_validation' | 'performance' | 'security';
  passed: boolean;
  details?: any;
  recommendation?: string;
}

export interface ValidationResult {
  documentId: string;
  overallScore: number;
  passed: boolean;
  checks: QualityCheck[];
  summary: {
    critical: number;
    warnings: number;
    info: number;
    totalChecks: number;
  };
  metadata: {
    validatedAt: Date;
    validationVersion: string;
    processingTime: number;
  };
}

export interface SystemHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  checks: QualityCheck[];
  services: {
    database: boolean;
    embeddings: boolean;
    vectorStorage: boolean;
    ocr: boolean;
  };
  statistics: {
    totalDocuments: number;
    averageQualityScore: number;
    recentFailureRate: number;
    averageProcessingTime: number;
  };
  recommendations: string[];
  timestamp: Date;
}

export class QualityAssuranceService {
  private readonly validationVersion = '1.0.0';

  /**
   * Validate a single document's processing results
   */
  async validateDocument(documentId: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const checks: QualityCheck[] = [];

    try {
      // Get document data
      const document = await this.getDocumentData(documentId);
      if (!document) {
        return this.createFailedValidation(documentId, 'Document not found', startTime);
      }

      // Get associated chunks
      const chunks = await this.getDocumentChunks(documentId);

      // Run all validation checks
      checks.push(...await this.validateDataIntegrity(document, chunks));
      checks.push(...await this.validateProcessingQuality(document, chunks));
      checks.push(...await this.validateMetadata(document));
      checks.push(...await this.validatePerformance(document));
      checks.push(...await this.validateSecurity(document));

      // Calculate overall score and status
      const { score, passed } = this.calculateValidationScore(checks);

      return {
        documentId,
        overallScore: score,
        passed,
        checks,
        summary: this.summarizeChecks(checks),
        metadata: {
          validatedAt: new Date(),
          validationVersion: this.validationVersion,
          processingTime: Date.now() - startTime
        }
      };
    } catch (error) {
      console.error('QA validation error:', error);
      checks.push({
        name: 'validation_error',
        description: 'Validation process encountered an error',
        severity: 'critical',
        category: 'data_integrity',
        passed: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });

      return {
        documentId,
        overallScore: 0,
        passed: false,
        checks,
        summary: this.summarizeChecks(checks),
        metadata: {
          validatedAt: new Date(),
          validationVersion: this.validationVersion,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Validate multiple documents in batch
   */
  async validateDocumentsBatch(documentIds: string[]): Promise<ValidationResult[]> {
    const results = await Promise.all(
      documentIds.map(id => this.validateDocument(id))
    );

    // Log batch validation metrics
    await analyticsService.trackEvent('qa_batch_validation', {
      documentCount: documentIds.length,
      passedCount: results.filter(r => r.passed).length,
      averageScore: results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
    });

    return results;
  }

  /**
   * Validate data integrity
   */
  private async validateDataIntegrity(document: any, chunks: any[]): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = [];

    // Check document completeness
    checks.push({
      name: 'document_completeness',
      description: 'Document has all required fields',
      severity: 'critical',
      category: 'data_integrity',
      passed: !!(document.filename && document.extractedText && document.metadata),
      details: {
        hasFilename: !!document.filename,
        hasExtractedText: !!document.extractedText,
        hasMetadata: !!document.metadata
      },
      recommendation: 'Ensure all required document fields are populated during processing'
    });

    // Check chunk integrity
    const expectedChunks = this.estimateExpectedChunks(document.extractedText);
    checks.push({
      name: 'chunk_integrity',
      description: 'Document chunks are complete and properly indexed',
      severity: 'critical',
      category: 'data_integrity',
      passed: chunks.length > 0 && chunks.length <= expectedChunks * 1.5,
      details: {
        actualChunks: chunks.length,
        expectedRange: `1-${Math.ceil(expectedChunks * 1.5)}`,
        hasSequentialIndexes: this.hasSequentialIndexes(chunks)
      },
      recommendation: 'Review chunking strategy if chunk count is outside expected range'
    });

    // Check embedding integrity
    const chunksWithEmbeddings = chunks.filter(chunk => chunk.embedding && chunk.embedding.length === 1024);
    checks.push({
      name: 'embedding_integrity',
      description: 'All chunks have valid 1024-dimensional embeddings',
      severity: 'critical',
      category: 'data_integrity',
      passed: chunksWithEmbeddings.length === chunks.length,
      details: {
        totalChunks: chunks.length,
        chunksWithEmbeddings: chunksWithEmbeddings.length,
        embeddingDimensions: chunksWithEmbeddings.length > 0 ? chunksWithEmbeddings[0].embedding?.length : 0
      },
      recommendation: 'Regenerate embeddings for chunks missing valid embeddings'
    });

    // Check content consistency
    const totalChunkContent = chunks.map(c => c.content).join(' ').length;
    const originalContentLength = document.extractedText?.length || 0;
    checks.push({
      name: 'content_consistency',
      description: 'Chunk content matches original document content',
      severity: 'warning',
      category: 'data_integrity',
      passed: totalChunkContent >= originalContentLength * 0.8 && totalChunkContent <= originalContentLength * 1.2,
      details: {
        originalLength: originalContentLength,
        chunkContentLength: totalChunkContent,
        ratio: originalContentLength > 0 ? totalChunkContent / originalContentLength : 0
      },
      recommendation: 'Review chunking algorithm if content length differs significantly'
    });

    return checks;
  }

  /**
   * Validate processing quality
   */
  private async validateProcessingQuality(document: any, chunks: any[]): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = [];

    // Check OCR confidence
    const ocrConfidence = document.metadata?.ocrConfidence || 0;
    checks.push({
      name: 'ocr_quality',
      description: 'OCR extraction confidence is acceptable',
      severity: ocrConfidence < 0.5 ? 'critical' : ocrConfidence < 0.8 ? 'warning' : 'info',
      category: 'processing_quality',
      passed: ocrConfidence >= 0.8,
      details: {
        confidence: ocrConfidence,
        threshold: 0.8
      },
      recommendation: ocrConfidence < 0.8 ? 'Consider manual review or reprocessing with different OCR settings' : undefined
    });

    // Check metadata quality
    const metadataQuality = document.metadata?.qualityScore || 0;
    checks.push({
      name: 'metadata_quality',
      description: 'Metadata extraction quality is acceptable',
      severity: metadataQuality < 50 ? 'critical' : metadataQuality < 70 ? 'warning' : 'info',
      category: 'processing_quality',
      passed: metadataQuality >= 70,
      details: {
        qualityScore: metadataQuality,
        threshold: 70,
        documentType: document.metadata?.documentType,
        aiEnhanced: document.metadata?.aiEnhanced
      },
      recommendation: metadataQuality < 70 ? 'Review metadata extraction with AI enhancement if not already used' : undefined
    });

    // Check chunking strategy appropriateness
    const chunkSizes = chunks.map(c => c.tokenCount || 0);
    const avgChunkSize = chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length;
    const chunkSizeVariance = this.calculateVariance(chunkSizes);

    checks.push({
      name: 'chunking_quality',
      description: 'Chunking strategy produces optimal chunk sizes',
      severity: avgChunkSize < 50 || avgChunkSize > 1000 ? 'warning' : 'info',
      category: 'processing_quality',
      passed: avgChunkSize >= 50 && avgChunkSize <= 1000 && chunkSizeVariance < 0.5,
      details: {
        averageChunkSize: avgChunkSize,
        chunkSizeVariance,
        strategy: chunks[0]?.metadata?.strategy,
        optimalRange: '50-1000 tokens'
      },
      recommendation: avgChunkSize < 50 ? 'Consider using smaller chunk overlap or different strategy' :
                     avgChunkSize > 1000 ? 'Consider using more aggressive chunking strategy' : undefined
    });

    return checks;
  }

  /**
   * Validate metadata completeness and accuracy
   */
  private async validateMetadata(document: any): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = [];
    const metadata = document.metadata || {};

    // Check required metadata fields
    const requiredFields = ['documentType', 'supplierName', 'ingredientName'];
    const missingFields = requiredFields.filter(field => !metadata[field]);

    checks.push({
      name: 'required_metadata',
      description: 'All required metadata fields are present',
      severity: 'critical',
      category: 'metadata_validation',
      passed: missingFields.length === 0,
      details: {
        requiredFields,
        missingFields,
        presentFields: requiredFields.filter(field => metadata[field])
      },
      recommendation: missingFields.length > 0 ? `Populate missing fields: ${missingFields.join(', ')}` : undefined
    });

    // Check document type classification
    const documentType = metadata.documentType;
    const filename = document.filename || '';
    const expectedType = this.inferDocumentTypeFromFilename(filename);

    checks.push({
      name: 'document_type_accuracy',
      description: 'Document type classification matches filename patterns',
      severity: 'warning',
      category: 'metadata_validation',
      passed: !expectedType || documentType === expectedType,
      details: {
        detectedType: documentType,
        expectedType,
        filename,
        aiEnhanced: metadata.aiEnhanced
      },
      recommendation: documentType !== expectedType ? 'Review document type classification accuracy' : undefined
    });

    // Check compliance information
    const hasComplianceInfo = metadata.complianceTypes && metadata.complianceTypes.length > 0;
    checks.push({
      name: 'compliance_information',
      description: 'Compliance and regulatory information is captured',
      severity: 'info',
      category: 'metadata_validation',
      passed: hasComplianceInfo || documentType !== 'sds', // SDS should have compliance info
      details: {
        complianceTypes: metadata.complianceTypes || [],
        documentType,
        shouldHaveCompliance: documentType === 'sds'
      },
      recommendation: !hasComplianceInfo && documentType === 'sds' ? 'Review document for compliance information' : undefined
    });

    return checks;
  }

  /**
   * Validate performance metrics
   */
  private async validatePerformance(document: any): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = [];
    const metadata = document.metadata || {};

    // Check processing time
    const totalProcessingTime = (metadata.processingStages?.ocr?.processingTime || 0) +
                               (metadata.processingStages?.metadata?.processingTime || 0) +
                               (metadata.processingStages?.chunking?.processingTime || 0) +
                               (metadata.processingStages?.vectorization?.processingTime || 0);

    const documentSize = document.extractedText?.length || 0;
    const processingRate = documentSize > 0 ? documentSize / totalProcessingTime * 1000 : 0; // chars per second

    checks.push({
      name: 'processing_performance',
      description: 'Document processing completed within acceptable time',
      severity: totalProcessingTime > 300000 ? 'warning' : 'info', // 5 minutes
      category: 'performance',
      passed: totalProcessingTime <= 300000,
      details: {
        totalProcessingTime,
        processingRate,
        documentSize,
        threshold: '300 seconds'
      },
      recommendation: totalProcessingTime > 300000 ? 'Consider optimizing processing pipeline for large documents' : undefined
    });

    return checks;
  }

  /**
   * Validate security and sensitive data handling
   */
  private async validateSecurity(document: any): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = [];
    const extractedText = document.extractedText || '';

    // Check for potential PII/sensitive data patterns
    const sensitivePatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Credit card pattern
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email pattern
    ];

    const foundSensitiveData = sensitivePatterns.some(pattern => pattern.test(extractedText));

    checks.push({
      name: 'sensitive_data_detection',
      description: 'No sensitive personal information detected in content',
      severity: 'warning',
      category: 'security',
      passed: !foundSensitiveData,
      details: {
        hasSensitiveData: foundSensitiveData,
        patternsChecked: sensitivePatterns.length
      },
      recommendation: foundSensitiveData ? 'Review content for sensitive data and consider redaction' : undefined
    });

    // Check content filtering status
    const contentFiltered = document.metadata?.contentFiltered || false;
    checks.push({
      name: 'content_filtering',
      description: 'Content has been processed through safety filters',
      severity: 'info',
      category: 'security',
      passed: contentFiltered,
      details: {
        contentFiltered,
        filterVersion: document.metadata?.filterVersion
      },
      recommendation: !contentFiltered ? 'Ensure content filtering is enabled for compliance' : undefined
    });

    return checks;
  }

  /**
   * Generate comprehensive system health report
   */
  async generateSystemHealthReport(): Promise<SystemHealthReport> {
    const checks: QualityCheck[] = [];
    const services = {
      database: false,
      embeddings: false,
      vectorStorage: false,
      ocr: false
    };

    try {
      // Check database health
      const dbHealth = await this.checkDatabaseHealth();
      checks.push(dbHealth);
      services.database = dbHealth.passed;

      // Check embeddings service health
      const embeddingsHealth = await this.checkEmbeddingsHealth();
      checks.push(embeddingsHealth);
      services.embeddings = embeddingsHealth.passed;

      // Check vector storage health
      const vectorHealth = await this.checkVectorStorageHealth();
      checks.push(vectorHealth);
      services.vectorStorage = vectorHealth.passed;

      // Get system statistics
      const statistics = await this.getSystemStatistics();

      // Calculate overall health score
      const serviceScore = Object.values(services).filter(Boolean).length / Object.keys(services).length;
      const checkScore = checks.filter(c => c.passed).length / checks.length;
      const score = Math.round((serviceScore + checkScore) / 2 * 100);

      const overall = score >= 90 ? 'healthy' : score >= 70 ? 'degraded' : 'unhealthy';

      // Generate recommendations
      const recommendations = this.generateSystemRecommendations(checks, statistics);

      return {
        overall,
        score,
        checks,
        services,
        statistics,
        recommendations,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('System health check error:', error);
      return {
        overall: 'unhealthy',
        score: 0,
        checks: [{
          name: 'health_check_error',
          description: 'System health check failed',
          severity: 'critical',
          category: 'data_integrity',
          passed: false,
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        }],
        services,
        statistics: {
          totalDocuments: 0,
          averageQualityScore: 0,
          recentFailureRate: 1,
          averageProcessingTime: 0
        },
        recommendations: ['Investigate system health check failure'],
        timestamp: new Date()
      };
    }
  }

  /**
   * Helper methods
   */
  private async getDocumentData(documentId: string) {
    const result = await db.select().from(documents).where(eq(documents.id, documentId));
    return result[0] || null;
  }

  private async getDocumentChunks(documentId: string) {
    return await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
  }

  private estimateExpectedChunks(text: string): number {
    const words = text?.split(' ').length || 0;
    return Math.max(1, Math.ceil(words / 400)); // Assume ~400 words per chunk
  }

  private hasSequentialIndexes(chunks: any[]): boolean {
    const indexes = chunks.map(c => c.chunkIndex).sort((a, b) => a - b);
    return indexes.every((index, i) => index === i);
  }

  private calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length;
    return variance / (mean * mean); // Coefficient of variation
  }

  private inferDocumentTypeFromFilename(filename: string): string | null {
    const lower = filename.toLowerCase();
    if (lower.includes('sds') || lower.includes('safety')) return 'sds';
    if (lower.includes('spec') || lower.includes('specification')) return 'specification';
    if (lower.includes('cert') || lower.includes('certificate')) return 'certificate';
    if (lower.includes('coa') || lower.includes('analysis')) return 'certificate_of_analysis';
    return null;
  }

  private calculateValidationScore(checks: QualityCheck[]): { score: number; passed: boolean } {
    const criticalFailed = checks.filter(c => c.severity === 'critical' && !c.passed).length;
    const warningFailed = checks.filter(c => c.severity === 'warning' && !c.passed).length;

    if (criticalFailed > 0) {
      return { score: Math.max(0, 50 - criticalFailed * 25), passed: false };
    }

    const totalChecks = checks.length;
    const passedChecks = checks.filter(c => c.passed).length;
    const score = Math.round((passedChecks / totalChecks) * 100);

    return { score, passed: score >= 80 && warningFailed <= 2 };
  }

  private summarizeChecks(checks: QualityCheck[]) {
    return {
      critical: checks.filter(c => c.severity === 'critical' && !c.passed).length,
      warnings: checks.filter(c => c.severity === 'warning' && !c.passed).length,
      info: checks.filter(c => c.severity === 'info' && !c.passed).length,
      totalChecks: checks.length
    };
  }

  private createFailedValidation(documentId: string, reason: string, startTime: number): ValidationResult {
    return {
      documentId,
      overallScore: 0,
      passed: false,
      checks: [{
        name: 'validation_failed',
        description: reason,
        severity: 'critical',
        category: 'data_integrity',
        passed: false
      }],
      summary: { critical: 1, warnings: 0, info: 0, totalChecks: 1 },
      metadata: {
        validatedAt: new Date(),
        validationVersion: this.validationVersion,
        processingTime: Date.now() - startTime
      }
    };
  }

  private async checkDatabaseHealth(): Promise<QualityCheck> {
    try {
      const result = await db.execute(sql`SELECT 1 as test`);
      return {
        name: 'database_connectivity',
        description: 'Database is accessible and responding',
        severity: 'critical',
        category: 'data_integrity',
        passed: result.length > 0,
        details: { responsive: true }
      };
    } catch (error) {
      return {
        name: 'database_connectivity',
        description: 'Database connectivity check failed',
        severity: 'critical',
        category: 'data_integrity',
        passed: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkEmbeddingsHealth(): Promise<QualityCheck> {
    try {
      const health = await titanEmbedder.getHealthStatus();
      return {
        name: 'embeddings_service',
        description: 'Embeddings service is healthy and responsive',
        severity: 'critical',
        category: 'processing_quality',
        passed: health.healthy,
        details: health
      };
    } catch (error) {
      return {
        name: 'embeddings_service',
        description: 'Embeddings service health check failed',
        severity: 'critical',
        category: 'processing_quality',
        passed: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkVectorStorageHealth(): Promise<QualityCheck> {
    try {
      const health = await vectorStorage.getHealth();
      return {
        name: 'vector_storage',
        description: 'Vector storage is healthy and responsive',
        severity: 'critical',
        category: 'data_integrity',
        passed: health.healthy,
        details: health
      };
    } catch (error) {
      return {
        name: 'vector_storage',
        description: 'Vector storage health check failed',
        severity: 'critical',
        category: 'data_integrity',
        passed: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async getSystemStatistics() {
    try {
      const [totalDocs, avgQuality, recentFailures, avgProcessingTime] = await Promise.all([
        db.select({ count: count() }).from(documents),
        db.execute(sql`
          SELECT AVG(CAST(metadata->>'qualityScore' AS INTEGER)) as avg_quality
          FROM documents
          WHERE metadata->>'qualityScore' IS NOT NULL
        `),
        db.execute(sql`
          SELECT COUNT(*) as failures
          FROM documents
          WHERE processing_status = 'failed'
          AND created_at > NOW() - INTERVAL '24 hours'
        `),
        db.execute(sql`
          SELECT AVG(CAST(metadata->>'totalProcessingTime' AS INTEGER)) as avg_time
          FROM documents
          WHERE metadata->>'totalProcessingTime' IS NOT NULL
        `)
      ]);

      return {
        totalDocuments: totalDocs[0]?.count || 0,
        averageQualityScore: parseFloat(avgQuality[0]?.avg_quality || '0'),
        recentFailureRate: parseFloat(recentFailures[0]?.failures || '0'),
        averageProcessingTime: parseFloat(avgProcessingTime[0]?.avg_time || '0')
      };
    } catch (error) {
      console.error('Error getting system statistics:', error);
      return {
        totalDocuments: 0,
        averageQualityScore: 0,
        recentFailureRate: 0,
        averageProcessingTime: 0
      };
    }
  }

  private generateSystemRecommendations(checks: QualityCheck[], statistics: any): string[] {
    const recommendations: string[] = [];

    const failedCritical = checks.filter(c => c.severity === 'critical' && !c.passed);
    if (failedCritical.length > 0) {
      recommendations.push('Address critical system issues immediately');
    }

    if (statistics.recentFailureRate > statistics.totalDocuments * 0.1) {
      recommendations.push('Investigate high recent failure rate');
    }

    if (statistics.averageQualityScore < 70) {
      recommendations.push('Review and optimize document processing quality');
    }

    if (statistics.averageProcessingTime > 180000) { // 3 minutes
      recommendations.push('Optimize processing pipeline performance');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is operating normally');
    }

    return recommendations;
  }
}

// Export singleton instance
export const qualityAssurance = new QualityAssuranceService();