/**
 * RAG Tool for Claude Agent SDK
 * Integrates vector search capabilities for cosmetic ingredients knowledge base
 */

import { db } from '@/lib/db';
import { documentChunks, documents } from '@/lib/db/schema';
import { sql, eq, and, gte } from 'drizzle-orm';

export interface VectorSearchParams {
  query: string;
  limit?: number;
  similarityThreshold?: number;
  documentTypes?: string[];
  suppliers?: string[];
  ingredientNames?: string[];
  categories?: string[];
}

export interface VectorSearchResult {
  documentId: string;
  chunkId: string;
  content: string;
  similarity: number;
  metadata: {
    documentName?: string;
    category?: string;
    supplier?: string;
    ingredientName?: string;
    documentType?: string;
    inciName?: string;
    ragDocumentType?: string;
    [key: string]: any;
  };
}

export interface RAGToolResponse {
  results: VectorSearchResult[];
  totalResults: number;
  searchQuery: string;
  processingTime: number;
  contextSummary: string;
}

export class RAGTool {
  private readonly defaultLimit = 10;
  private readonly defaultSimilarityThreshold = 0.7;

  /**
   * Perform vector search against the cosmetic ingredients knowledge base
   */
  async searchKnowledgeBase(params: VectorSearchParams): Promise<RAGToolResponse> {
    const startTime = Date.now();
    const {
      query,
      limit = this.defaultLimit,
      similarityThreshold = this.defaultSimilarityThreshold,
      documentTypes,
      suppliers,
      ingredientNames,
      categories
    } = params;

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Build the search query with filters
      let searchQuery = db
        .select({
          documentId: documentChunks.documentId,
          chunkId: documentChunks.id,
          content: documentChunks.content,
          similarity: sql<number>`1 - (${documentChunks.embedding} <=> ${queryEmbedding})`,
          // Document metadata
          documentName: documents.originalFilename,
          documentTitle: documents.title,
          category: documents.documentCategory,
          supplier: documents.supplierName,
          ingredientName: documents.ingredientName,
          documentType: documents.documentType,
          inciName: documents.ingredientInciName,
          ragDocumentType: documents.ragDocumentType,
          casNumber: documents.ingredientCasNumber,
          specifications: documents.specifications,
        })
        .from(documentChunks)
        .leftJoin(documents, eq(documentChunks.documentId, documents.id))
        .where(gte(sql`1 - (${documentChunks.embedding} <=> ${queryEmbedding})`, similarityThreshold))
        .orderBy(sql`${documentChunks.embedding} <=> ${queryEmbedding}`)
        .limit(limit);

      // Apply additional filters if provided
      const conditions = [
        gte(sql`1 - (${documentChunks.embedding} <=> ${queryEmbedding})`, similarityThreshold)
      ];

      if (documentTypes && documentTypes.length > 0) {
        conditions.push(sql`${documents.documentType} = ANY(${documentTypes})`);
      }

      if (suppliers && suppliers.length > 0) {
        conditions.push(sql`${documents.supplierNormalized} = ANY(${suppliers.map(s => s.toLowerCase())})`);
      }

      if (ingredientNames && ingredientNames.length > 0) {
        conditions.push(sql`${documents.ingredientNormalized} = ANY(${ingredientNames.map(s => s.toLowerCase())})`);
      }

      if (categories && categories.length > 0) {
        conditions.push(sql`${documents.documentCategory} = ANY(${categories})`);
      }

      if (conditions.length > 1) {
        searchQuery = searchQuery.where(and(...conditions));
      }

      // Execute the search
      const rawResults = await searchQuery;

      // Process results
      const results: VectorSearchResult[] = rawResults.map(row => ({
        documentId: row.documentId,
        chunkId: row.chunkId,
        content: row.content,
        similarity: row.similarity,
        metadata: {
          documentName: row.documentName || undefined,
          category: row.category || undefined,
          supplier: row.supplier || undefined,
          ingredientName: row.ingredientName || undefined,
          documentType: row.documentType || undefined,
          inciName: row.inciName || undefined,
          ragDocumentType: row.ragDocumentType || undefined,
          casNumber: row.casNumber || undefined,
          specifications: row.specifications || undefined,
        }
      }));

      const processingTime = Date.now() - startTime;

      // Generate context summary
      const contextSummary = this.generateContextSummary(results, query);

      return {
        results,
        totalResults: results.length,
        searchQuery: query,
        processingTime,
        contextSummary
      };

    } catch (error) {
      console.error('Error performing vector search:', error);
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embedding for query text using AWS Bedrock Titan
   */
  private async generateEmbedding(text: string): Promise<string> {
    try {
      // For now, return a placeholder
      // TODO: Implement actual embedding generation using AWS Bedrock Titan

      // This would use the Bedrock client to generate embeddings
      // const response = await this.bedrockClient.send(new InvokeModelCommand({
      //   modelId: 'amazon.titan-embed-text-v2:0',
      //   contentType: 'application/json',
      //   accept: 'application/json',
      //   body: new TextEncoder().encode(JSON.stringify({
      //     inputText: text,
      //     dimensions: 1024,
      //     normalize: true,
      //   })),
      // }));

      // For now, return a mock embedding vector
      const mockEmbedding = Array(1024).fill(0).map(() => Math.random() - 0.5);
      return `[${mockEmbedding.join(',')}]`;

    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a context summary from search results
   */
  private generateContextSummary(results: VectorSearchResult[], query: string): string {
    if (results.length === 0) {
      return `No relevant information found for query: "${query}"`;
    }

    const documentTypes = [...new Set(results.map(r => r.metadata.ragDocumentType).filter(Boolean))];
    const suppliers = [...new Set(results.map(r => r.metadata.supplier).filter(Boolean))];
    const ingredients = [...new Set(results.map(r => r.metadata.ingredientName).filter(Boolean))];

    let summary = `Found ${results.length} relevant document chunks`;

    if (ingredients.length > 0) {
      summary += ` related to ingredients: ${ingredients.slice(0, 3).join(', ')}`;
      if (ingredients.length > 3) summary += ` and ${ingredients.length - 3} others`;
    }

    if (suppliers.length > 0) {
      summary += ` from suppliers: ${suppliers.slice(0, 3).join(', ')}`;
      if (suppliers.length > 3) summary += ` and ${suppliers.length - 3} others`;
    }

    if (documentTypes.length > 0) {
      summary += ` including document types: ${documentTypes.slice(0, 3).join(', ')}`;
    }

    return summary;
  }

  /**
   * Search for specific INCI ingredient information
   */
  async searchByInciName(inciName: string, limit: number = 5): Promise<RAGToolResponse> {
    return this.searchKnowledgeBase({
      query: inciName,
      limit,
      similarityThreshold: 0.8, // Higher threshold for specific ingredient searches
    });
  }

  /**
   * Search for formulation information
   */
  async searchFormulationData(
    productType: string,
    ingredients: string[],
    limit: number = 8
  ): Promise<RAGToolResponse> {
    const query = `${productType} formulation ${ingredients.join(' ')}`;

    return this.searchKnowledgeBase({
      query,
      limit,
      similarityThreshold: 0.6, // Lower threshold for formulation searches
      documentTypes: ['formulation'],
      ingredientNames: ingredients,
    });
  }

  /**
   * Search for supplier and product information
   */
  async searchSupplierInfo(
    supplierName?: string,
    productName?: string,
    limit: number = 6
  ): Promise<RAGToolResponse> {
    const query = [supplierName, productName].filter(Boolean).join(' ');

    return this.searchKnowledgeBase({
      query,
      limit,
      similarityThreshold: 0.7,
      suppliers: supplierName ? [supplierName] : undefined,
    });
  }

  /**
   * Get tool description for Claude Agent SDK
   */
  static getToolDescription() {
    return {
      name: 'search_cosmetic_ingredients_kb',
      description: 'Search the cosmetic ingredients knowledge base for INCI information, formulations, supplier data, and technical documentation',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for the knowledge base'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 10)',
            minimum: 1,
            maximum: 20
          },
          similarityThreshold: {
            type: 'number',
            description: 'Minimum similarity threshold (default: 0.7)',
            minimum: 0.1,
            maximum: 1.0
          },
          documentTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by document types (e.g., "inci", "formulation")'
          },
          suppliers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by supplier names'
          },
          ingredientNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by ingredient names'
          }
        },
        required: ['query']
      }
    };
  }
}

// Export singleton instance
export const ragTool = new RAGTool();