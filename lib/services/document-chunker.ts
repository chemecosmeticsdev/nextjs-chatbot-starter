/**
 * Intelligent Document Chunking Service
 *
 * Provides adaptive chunking strategies optimized for 1024-dimensional embeddings
 * with document type-specific chunking logic for cosmetics ingredient documents.
 */

export interface ChunkMetadata {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  chunk_total: number;
  chunk_type: 'full_document' | 'section' | 'table' | 'paragraph' | 'list';
  section_title?: string;
  section_number?: number;
  page_number?: number;
  has_overlap: boolean;
  overlap_with_previous?: boolean;
  overlap_with_next?: boolean;
  token_count: number;
  character_count: number;
  quality_score: number;
}

export interface DocumentChunk {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  chunk_total: number;
  chunk_text: string;
  chunk_type: 'full_document' | 'section' | 'table' | 'paragraph' | 'list';
  section_title?: string;
  section_number?: number;
  page_number?: number;
  has_overlap: boolean;
  metadata: ChunkMetadata;
}

export interface ChunkingStrategy {
  name: string;
  maxTokens: number;
  minTokens: number;
  overlapTokens: number;
  preserveSections: boolean;
  useSemanticBoundaries: boolean;
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  strategy_used: string;
  total_chunks: number;
  total_tokens: number;
  average_chunk_size: number;
  quality_metrics: {
    coherence_score: number;
    coverage_score: number;
    overlap_efficiency: number;
  };
}

export class DocumentChunker {
  // Chunking strategies optimized for 1024-dimensional embeddings
  private static readonly strategies: Record<string, ChunkingStrategy> = {
    // Small documents - single chunk
    'single_chunk': {
      name: 'Single Chunk',
      maxTokens: 1200,
      minTokens: 0,
      overlapTokens: 0,
      preserveSections: false,
      useSemanticBoundaries: false,
    },

    // Standard documents - semantic chunking
    'semantic': {
      name: 'Semantic Chunking',
      maxTokens: 1000,
      minTokens: 300,
      overlapTokens: 150,
      preserveSections: true,
      useSemanticBoundaries: true,
    },

    // Technical documents - section-based
    'technical_sections': {
      name: 'Technical Section-Based',
      maxTokens: 1200,
      minTokens: 200,
      overlapTokens: 100,
      preserveSections: true,
      useSemanticBoundaries: true,
    },

    // Safety Data Sheets - SDS sections
    'sds_sections': {
      name: 'SDS Section-Based',
      maxTokens: 800,
      minTokens: 100,
      overlapTokens: 50,
      preserveSections: true,
      useSemanticBoundaries: false,
    },

    // Certificates - content-based
    'certificate': {
      name: 'Certificate Chunking',
      maxTokens: 600,
      minTokens: 200,
      overlapTokens: 100,
      preserveSections: false,
      useSemanticBoundaries: true,
    },

    // Large documents - aggressive chunking
    'large_document': {
      name: 'Large Document Chunking',
      maxTokens: 900,
      minTokens: 400,
      overlapTokens: 200,
      preserveSections: true,
      useSemanticBoundaries: true,
    },
  };

  /**
   * Main chunking method - automatically selects optimal strategy
   */
  static chunk(
    documentId: string,
    text: string,
    documentType: string,
    tokenCount: number,
    metadata?: {
      filename?: string;
      has_sections?: boolean;
      page_count?: number;
    }
  ): ChunkingResult {
    const strategy = this.selectStrategy(documentType, tokenCount, metadata);

    let chunks: DocumentChunk[];

    // Apply strategy-specific chunking
    switch (strategy.name) {
      case 'Single Chunk':
        chunks = this.createSingleChunk(documentId, text, strategy);
        break;
      case 'SDS Section-Based':
        chunks = this.chunkSDSDocument(documentId, text, strategy);
        break;
      case 'Technical Section-Based':
        chunks = this.chunkTechnicalDocument(documentId, text, strategy);
        break;
      case 'Certificate Chunking':
        chunks = this.chunkCertificate(documentId, text, strategy);
        break;
      default:
        chunks = this.chunkSemanticBoundaries(documentId, text, strategy);
    }

    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(chunks, text);

    return {
      chunks,
      strategy_used: strategy.name,
      total_chunks: chunks.length,
      total_tokens: chunks.reduce((sum, chunk) => sum + chunk.metadata.token_count, 0),
      average_chunk_size: chunks.length > 0 ?
        chunks.reduce((sum, chunk) => sum + chunk.metadata.token_count, 0) / chunks.length : 0,
      quality_metrics: qualityMetrics,
    };
  }

  /**
   * Select optimal chunking strategy based on document characteristics
   */
  private static selectStrategy(
    documentType: string,
    tokenCount: number,
    metadata?: any
  ): ChunkingStrategy {
    // Single chunk for small documents
    if (tokenCount < 1200) {
      return this.strategies.single_chunk;
    }

    // Document type-specific strategies
    switch (documentType) {
      case 'sds':
      case 'msds':
        return this.strategies.sds_sections;

      case 'specification':
      case 'technical_data_sheet':
      case 'certificate_of_analysis':
        return this.strategies.technical_sections;

      case 'halal_certificate':
      case 'kosher_certificate':
      case 'iso_certificate':
      case 'reach_registration':
        return this.strategies.certificate;

      default:
        // Use large document strategy for very long texts
        if (tokenCount > 5000) {
          return this.strategies.large_document;
        }
        return this.strategies.semantic;
    }
  }

  /**
   * Create single chunk for small documents
   */
  private static createSingleChunk(
    documentId: string,
    text: string,
    strategy: ChunkingStrategy
  ): DocumentChunk[] {
    const chunkId = this.generateChunkId();
    const tokenCount = this.estimateTokens(text);

    const metadata: ChunkMetadata = {
      chunk_id: chunkId,
      document_id: documentId,
      chunk_index: 0,
      chunk_total: 1,
      chunk_type: 'full_document',
      has_overlap: false,
      token_count: tokenCount,
      character_count: text.length,
      quality_score: 100, // Full document always has perfect coverage
    };

    return [{
      chunk_id: chunkId,
      document_id: documentId,
      chunk_index: 0,
      chunk_total: 1,
      chunk_text: text.trim(),
      chunk_type: 'full_document',
      has_overlap: false,
      metadata,
    }];
  }

  /**
   * Chunk Safety Data Sheet documents by standard sections (1-16)
   */
  private static chunkSDSDocument(
    documentId: string,
    text: string,
    strategy: ChunkingStrategy
  ): DocumentChunk[] {
    const sections = this.extractSDSSections(text);
    const chunks: DocumentChunk[] = [];

    if (sections.length === 0) {
      // Fallback to semantic chunking if no sections found
      return this.chunkSemanticBoundaries(documentId, text, strategy);
    }

    sections.forEach((section, index) => {
      const chunkId = this.generateChunkId();
      const tokenCount = this.estimateTokens(section.content);

      // If section is too large, split it further
      if (tokenCount > strategy.maxTokens) {
        const subChunks = this.splitLargeSection(section.content, strategy, strategy.maxTokens);
        subChunks.forEach((subChunk, subIndex) => {
          const subChunkId = this.generateChunkId();
          const subTokenCount = this.estimateTokens(subChunk);

          const metadata: ChunkMetadata = {
            chunk_id: subChunkId,
            document_id: documentId,
            chunk_index: chunks.length,
            chunk_total: 0, // Will be updated later
            chunk_type: 'section',
            section_title: `${section.title} (Part ${subIndex + 1})`,
            section_number: section.number,
            has_overlap: subIndex > 0,
            overlap_with_previous: subIndex > 0,
            token_count: subTokenCount,
            character_count: subChunk.length,
            quality_score: this.calculateChunkQuality(subChunk, section.title),
          };

          chunks.push({
            chunk_id: subChunkId,
            document_id: documentId,
            chunk_index: chunks.length,
            chunk_total: 0,
            chunk_text: subChunk.trim(),
            chunk_type: 'section',
            section_title: metadata.section_title,
            section_number: section.number,
            has_overlap: metadata.has_overlap,
            metadata,
          });
        });
      } else {
        const metadata: ChunkMetadata = {
          chunk_id: chunkId,
          document_id: documentId,
          chunk_index: index,
          chunk_total: 0,
          chunk_type: 'section',
          section_title: section.title,
          section_number: section.number,
          has_overlap: false,
          token_count: tokenCount,
          character_count: section.content.length,
          quality_score: this.calculateChunkQuality(section.content, section.title),
        };

        chunks.push({
          chunk_id: chunkId,
          document_id: documentId,
          chunk_index: index,
          chunk_total: 0,
          chunk_text: section.content.trim(),
          chunk_type: 'section',
          section_title: section.title,
          section_number: section.number,
          has_overlap: false,
          metadata,
        });
      }
    });

    // Update chunk_total for all chunks
    chunks.forEach(chunk => {
      chunk.chunk_total = chunks.length;
      chunk.metadata.chunk_total = chunks.length;
    });

    return chunks;
  }

  /**
   * Chunk technical documents preserving structure
   */
  private static chunkTechnicalDocument(
    documentId: string,
    text: string,
    strategy: ChunkingStrategy
  ): DocumentChunk[] {
    // Try to identify sections first
    const sections = this.extractGenericSections(text);

    if (sections.length > 1) {
      return this.chunkBySections(documentId, sections, strategy);
    }

    // Fallback to semantic chunking
    return this.chunkSemanticBoundaries(documentId, text, strategy);
  }

  /**
   * Chunk certificates focusing on key information
   */
  private static chunkCertificate(
    documentId: string,
    text: string,
    strategy: ChunkingStrategy
  ): DocumentChunk[] {
    // Split by paragraphs for certificates
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);

    if (paragraphs.length <= 2) {
      return this.createSingleChunk(documentId, text, strategy);
    }

    return this.chunkByParagraphs(documentId, paragraphs, strategy);
  }

  /**
   * Semantic boundary-based chunking for general documents
   */
  private static chunkSemanticBoundaries(
    documentId: string,
    text: string,
    strategy: ChunkingStrategy
  ): DocumentChunk[] {
    const sentences = this.splitIntoSentences(text);
    const chunks: DocumentChunk[] = [];

    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokens(sentence);

      // Check if adding this sentence would exceed max tokens
      if (currentTokens + sentenceTokens > strategy.maxTokens && currentChunk.length > 0) {
        // Finalize current chunk
        const chunkText = currentChunk.join(' ').trim();
        const chunk = this.createChunk(
          documentId,
          chunkText,
          chunks.length,
          0, // Will be updated later
          'paragraph'
        );
        chunks.push(chunk);

        // Start new chunk with overlap
        if (strategy.overlapTokens > 0) {
          const overlapSentences = this.getOverlapSentences(
            currentChunk,
            strategy.overlapTokens
          );
          currentChunk = overlapSentences;
          currentTokens = this.estimateTokens(currentChunk.join(' '));
        } else {
          currentChunk = [];
          currentTokens = 0;
        }
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ').trim();
      const chunk = this.createChunk(
        documentId,
        chunkText,
        chunks.length,
        0,
        'paragraph'
      );
      chunks.push(chunk);
    }

    // Update chunk_total for all chunks
    chunks.forEach(chunk => {
      chunk.chunk_total = chunks.length;
      chunk.metadata.chunk_total = chunks.length;
      // Update overlap flags
      if (chunk.chunk_index > 0) {
        chunk.has_overlap = true;
        chunk.metadata.has_overlap = true;
        chunk.metadata.overlap_with_previous = true;
      }
      if (chunk.chunk_index < chunks.length - 1) {
        chunk.metadata.overlap_with_next = true;
      }
    });

    return chunks;
  }

  /**
   * Extract SDS sections (1-16)
   */
  private static extractSDSSections(text: string): Array<{
    number: number;
    title: string;
    content: string;
  }> {
    const sectionPattern = /(?:Section\s+)?(\d+)[.:\s]+([^\n]+)\n([\s\S]*?)(?=(?:Section\s+)?\d+[.:\s]+|$)/gi;
    const sections: Array<{ number: number; title: string; content: string }> = [];

    let match;
    while ((match = sectionPattern.exec(text)) !== null) {
      const sectionNumber = parseInt(match[1]);

      // Only process sections 1-16 for SDS
      if (sectionNumber >= 1 && sectionNumber <= 16) {
        sections.push({
          number: sectionNumber,
          title: match[2].trim(),
          content: match[3].trim(),
        });
      }
    }

    return sections.sort((a, b) => a.number - b.number);
  }

  /**
   * Extract generic document sections
   */
  private static extractGenericSections(text: string): Array<{
    title: string;
    content: string;
  }> {
    // Match various heading patterns
    const headingPatterns = [
      /^#{1,3}\s+(.+)$/gm, // Markdown headings
      /^([A-Z][A-Z\s]{2,50}):?\s*$/gm, // ALL CAPS headings
      /^\d+\.\s+([^.]+)$/gm, // Numbered headings
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):?\s*$/gm, // Title Case headings
    ];

    const sections: Array<{ title: string; content: string }> = [];
    let lastIndex = 0;
    let lastTitle = '';

    for (const pattern of headingPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (lastTitle && match.index > lastIndex) {
          // Add previous section
          const content = text.substring(lastIndex, match.index).trim();
          if (content.length > 100) {
            sections.push({ title: lastTitle, content });
          }
        }
        lastTitle = match[1].trim();
        lastIndex = match.index + match[0].length;
      }
    }

    // Add final section
    if (lastTitle && lastIndex < text.length) {
      const content = text.substring(lastIndex).trim();
      if (content.length > 100) {
        sections.push({ title: lastTitle, content });
      }
    }

    return sections;
  }

  /**
   * Helper methods
   */
  private static createChunk(
    documentId: string,
    text: string,
    index: number,
    total: number,
    type: 'full_document' | 'section' | 'table' | 'paragraph' | 'list'
  ): DocumentChunk {
    const chunkId = this.generateChunkId();
    const tokenCount = this.estimateTokens(text);

    const metadata: ChunkMetadata = {
      chunk_id: chunkId,
      document_id: documentId,
      chunk_index: index,
      chunk_total: total,
      chunk_type: type,
      has_overlap: false,
      token_count: tokenCount,
      character_count: text.length,
      quality_score: this.calculateChunkQuality(text),
    };

    return {
      chunk_id: chunkId,
      document_id: documentId,
      chunk_index: index,
      chunk_total: total,
      chunk_text: text,
      chunk_type: type,
      has_overlap: false,
      metadata,
    };
  }

  private static splitIntoSentences(text: string): string[] {
    // Enhanced sentence splitting with better handling of abbreviations
    return text
      .split(/(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|etc|vs|Inc|Ltd|Corp|Co)\.)(?<![A-Z]\.)\.(?=\s+[A-Z])/g)
      .flatMap(sentence => sentence.split(/[!?]+\s+/))
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private static splitLargeSection(
    text: string,
    strategy: ChunkingStrategy,
    maxTokens: number
  ): string[] {
    const sentences = this.splitIntoSentences(text);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
        currentTokens = 0;
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }

  private static getOverlapSentences(sentences: string[], targetTokens: number): string[] {
    const overlap: string[] = [];
    let tokens = 0;

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentenceTokens = this.estimateTokens(sentences[i]);
      if (tokens + sentenceTokens > targetTokens) break;

      overlap.unshift(sentences[i]);
      tokens += sentenceTokens;
    }

    return overlap;
  }

  private static chunkBySections(
    documentId: string,
    sections: Array<{ title: string; content: string }>,
    strategy: ChunkingStrategy
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    sections.forEach((section, index) => {
      const tokenCount = this.estimateTokens(section.content);

      if (tokenCount > strategy.maxTokens) {
        // Split large sections
        const subChunks = this.splitLargeSection(section.content, strategy, strategy.maxTokens);
        subChunks.forEach((subChunk, subIndex) => {
          const chunk = this.createChunk(
            documentId,
            subChunk,
            chunks.length,
            0,
            'section'
          );
          chunk.section_title = `${section.title} (Part ${subIndex + 1})`;
          chunk.metadata.section_title = chunk.section_title;
          chunks.push(chunk);
        });
      } else {
        const chunk = this.createChunk(
          documentId,
          section.content,
          index,
          0,
          'section'
        );
        chunk.section_title = section.title;
        chunk.metadata.section_title = section.title;
        chunks.push(chunk);
      }
    });

    // Update totals
    chunks.forEach(chunk => {
      chunk.chunk_total = chunks.length;
      chunk.metadata.chunk_total = chunks.length;
    });

    return chunks;
  }

  private static chunkByParagraphs(
    documentId: string,
    paragraphs: string[],
    strategy: ChunkingStrategy
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = this.estimateTokens(paragraph);

      if (currentTokens + paragraphTokens > strategy.maxTokens && currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        const chunk = this.createChunk(documentId, chunkText, chunks.length, 0, 'paragraph');
        chunks.push(chunk);

        currentChunk = [];
        currentTokens = 0;
      }

      currentChunk.push(paragraph);
      currentTokens += paragraphTokens;
    }

    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join('\n\n');
      const chunk = this.createChunk(documentId, chunkText, chunks.length, 0, 'paragraph');
      chunks.push(chunk);
    }

    // Update totals
    chunks.forEach(chunk => {
      chunk.chunk_total = chunks.length;
      chunk.metadata.chunk_total = chunks.length;
    });

    return chunks;
  }

  private static estimateTokens(text: string): number {
    // Enhanced token estimation for technical documents
    // Accounts for technical terms, chemical names, and special formatting
    const words = text.split(/\s+/).length;
    const technicalTerms = text.match(/[A-Z]{2,}|[\w-]+-[\w-]+|\d+\.\d+/g)?.length || 0;
    const chemicalFormulas = text.match(/[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)*/g)?.length || 0;

    // Base estimation + technical complexity factor
    return Math.ceil(words * 1.3 + technicalTerms * 0.2 + chemicalFormulas * 0.1);
  }

  private static calculateChunkQuality(text: string, sectionTitle?: string): number {
    let quality = 70; // Base quality score

    // Length appropriateness (50-2000 chars is optimal)
    const length = text.length;
    if (length >= 100 && length <= 2000) {
      quality += 15;
    } else if (length < 50) {
      quality -= 20;
    } else if (length > 3000) {
      quality -= 10;
    }

    // Content coherence indicators
    if (text.match(/\.\s+[A-Z]/g)?.length > 1) quality += 5; // Multiple sentences
    if (text.includes('\n')) quality += 5; // Structured content
    if (sectionTitle) quality += 10; // Has section context

    // Technical content indicators
    if (text.match(/\d+\.\d+/g)) quality += 5; // Numbers/measurements
    if (text.match(/[A-Z]{3,}/g)) quality += 5; // Acronyms/technical terms

    return Math.min(100, Math.max(0, quality));
  }

  private static calculateQualityMetrics(chunks: DocumentChunk[], originalText: string): {
    coherence_score: number;
    coverage_score: number;
    overlap_efficiency: number;
  } {
    const totalOriginalLength = originalText.length;
    const totalChunkLength = chunks.reduce((sum, chunk) => sum + chunk.chunk_text.length, 0);

    // Coverage: how much of original text is preserved
    const coverage_score = Math.min(100, (totalChunkLength / totalOriginalLength) * 100);

    // Coherence: average chunk quality
    const coherence_score = chunks.length > 0 ?
      chunks.reduce((sum, chunk) => sum + chunk.metadata.quality_score, 0) / chunks.length : 0;

    // Overlap efficiency: reasonable overlap without excessive duplication
    const overlapChunks = chunks.filter(chunk => chunk.has_overlap).length;
    const overlap_efficiency = chunks.length > 1 ?
      Math.max(0, 100 - (overlapChunks / chunks.length) * 50) : 100;

    return {
      coherence_score: Math.round(coherence_score),
      coverage_score: Math.round(coverage_score),
      overlap_efficiency: Math.round(overlap_efficiency),
    };
  }

  private static generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance and types
export const documentChunker = new DocumentChunker();

export type ChunkType = 'full_document' | 'section' | 'table' | 'paragraph' | 'list';
export type ChunkingStrategyName = 'single_chunk' | 'semantic' | 'technical_sections' | 'sds_sections' | 'certificate' | 'large_document';