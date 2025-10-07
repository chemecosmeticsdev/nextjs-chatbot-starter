# RAG Document Vectorization Implementation Plan - Part 3
## API Integration, Search & Deployment

**Continuation from Part 2** - This document covers embedding generation, Next.js API integration, search strategies, and production deployment.

---

## TABLE OF CONTENTS - PART 3

8. [Embedding Generation (AWS Titan v2)](#8-embedding-generation)
9. [Vectorization & Indexing Phase](#9-vectorization--indexing-phase)
10. [Next.js API Integration](#10-nextjs-api-integration)
11. [RAG Chatbot Implementation](#11-rag-chatbot-implementation)
12. [Search Optimization & Strategies](#12-search-optimization--strategies)
13. [Deployment & Production Setup](#13-deployment--production-setup)
14. [Cost Estimation](#14-cost-estimation)
15. [Implementation Timeline](#15-implementation-timeline)
16. [Monitoring & Maintenance](#16-monitoring--maintenance)

---

## 8. EMBEDDING GENERATION

### 8.1 AWS Bedrock Titan Embedding v2 Setup

**Model**: `amazon.titan-embed-text-v2:0`
**Dimensions**: 1024 (recommended over 512 for technical content)
**Normalization**: Enabled

```typescript
// lib/embeddings/titan-embedder.ts
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

export class TitanEmbedder {
  private client: BedrockRuntimeClient;
  private modelId = 'amazon.titan-embed-text-v2:0';

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(
    text: string,
    inputType: 'search_document' | 'search_query' = 'search_document'
  ): Promise<number[]> {
    const payload = {
      inputText: text,
      dimensions: 1024,
      normalize: true,
      embeddingTypes: [inputType],
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(
        new TextDecoder().decode(response.body)
      );

      return responseBody.embedding;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Note: Bedrock doesn't have native batch API, so we parallelize with rate limiting
   */
  async generateEmbeddingsBatch(
    texts: string[],
    inputType: 'search_document' | 'search_query' = 'search_document',
    maxConcurrency: number = 10
  ): Promise<number[][]> {
    const results: number[][] = [];
    const semaphore = new Semaphore(maxConcurrency);

    const promises = texts.map(async (text, index) => {
      await semaphore.acquire();
      try {
        const embedding = await this.generateEmbedding(text, inputType);
        results[index] = embedding;
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Estimate cost for embedding generation
   */
  estimateCost(tokenCount: number): number {
    // Titan Embedding v2 pricing: $0.0001 per 1K tokens
    const costPer1KTokens = 0.0001;
    return (tokenCount / 1000) * costPer1KTokens;
  }
}

// Simple semaphore for rate limiting
class Semaphore {
  private current = 0;
  private waiting: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release() {
    this.current--;
    const next = this.waiting.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}
```

---

## 9. VECTORIZATION & INDEXING PHASE

### Phase 3: Chunking & Embedding (Week 3, Days 15-21)

```typescript
// lib/chunking/chunker.ts
export interface Chunk {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  chunk_total: number;
  chunk_text: string;
  chunk_type: 'full_document' | 'section' | 'table';
  section_title?: string;
  section_number?: number;
}

export class DocumentChunker {
  private readonly maxTokens = 1200;
  private readonly minTokens = 800;
  private readonly overlapTokens = 150;

  /**
   * Chunk a document based on size and type
   */
  chunk(
    documentId: string,
    text: string,
    documentType: string,
    tokenCount: number
  ): Chunk[] {
    // Single chunk for small documents
    if (tokenCount < this.maxTokens) {
      return [{
        chunk_id: crypto.randomUUID(),
        document_id: documentId,
        chunk_index: 0,
        chunk_total: 1,
        chunk_text: text,
        chunk_type: 'full_document',
      }];
    }

    // Section-based chunking for large documents
    if (documentType === 'sds' || documentType === 'msds') {
      return this.chunkSDS(documentId, text);
    }

    // Generic semantic chunking
    return this.chunkBySize(documentId, text);
  }

  /**
   * Chunk SDS documents by standard sections
   */
  private chunkSDS(documentId: string, text: string): Chunk[] {
    const sections = this.extractSDSSections(text);
    const chunks: Chunk[] = [];

    sections.forEach((section, index) => {
      chunks.push({
        chunk_id: crypto.randomUUID(),
        document_id: documentId,
        chunk_index: index,
        chunk_total: sections.length,
        chunk_text: section.content,
        chunk_type: 'section',
        section_title: section.title,
        section_number: section.number,
      });
    });

    return chunks;
  }

  /**
   * Extract SDS sections (1-16)
   */
  private extractSDSSections(text: string): Array<{
    number: number;
    title: string;
    content: string;
  }> {
    const sectionPattern = /(?:Section\s+)?(\d+)[.:\s]+([^\n]+)\n([\s\S]*?)(?=(?:Section\s+)?\d+[.:\s]+|$)/gi;
    const sections: Array<{ number: number; title: string; content: string }> = [];

    let match;
    while ((match = sectionPattern.exec(text)) !== null) {
      sections.push({
        number: parseInt(match[1]),
        title: match[2].trim(),
        content: match[3].trim(),
      });
    }

    return sections;
  }

  /**
   * Generic size-based chunking with overlap
   */
  private chunkBySize(documentId: string, text: string): Chunk[] {
    const sentences = this.splitIntoSentences(text);
    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > this.maxTokens && currentChunk.length > 0) {
        // Finalize current chunk
        chunks.push({
          chunk_id: crypto.randomUUID(),
          document_id: documentId,
          chunk_index: chunks.length,
          chunk_total: 0, // Will update later
          chunk_text: currentChunk.join(' '),
          chunk_type: 'section',
        });

        // Start new chunk with overlap
        const overlapSentences = this.getOverlapSentences(currentChunk, this.overlapTokens);
        currentChunk = overlapSentences;
        currentTokens = this.estimateTokens(currentChunk.join(' '));
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        chunk_id: crypto.randomUUID(),
        document_id: documentId,
        chunk_index: chunks.length,
        chunk_total: 0,
        chunk_text: currentChunk.join(' '),
        chunk_type: 'section',
      });
    }

    // Update total_chunks
    chunks.forEach(chunk => chunk.chunk_total = chunks.length);

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitter (can be improved with NLP library)
    return text.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 0.75 words
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }

  private getOverlapSentences(sentences: string[], targetTokens: number): string[] {
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
}
```

### Vectorization Pipeline

```typescript
// scripts/vectorize-documents.ts
import { db } from '@/lib/db';
import { TitanEmbedder } from '@/lib/embeddings/titan-embedder';
import { DocumentChunker } from '@/lib/chunking/chunker';

async function vectorizeAllDocuments() {
  const embedder = new TitanEmbedder();
  const chunker = new DocumentChunker();

  // Get all documents with extracted text, not yet vectorized
  const documents = await db.query(`
    SELECT
      document_id,
      text_content,
      document_type,
      token_count,
      supplier_name,
      ingredient_name
    FROM documents
    WHERE text_content IS NOT NULL
      AND indexed_at IS NULL
      AND is_duplicate = false
    ORDER BY document_id
  `);

  console.log(`Vectorizing ${documents.rows.length} documents...`);

  let processed = 0;
  const batchSize = 50;

  for (let i = 0; i < documents.rows.length; i += batchSize) {
    const batch = documents.rows.slice(i, i + batchSize);

    await Promise.all(batch.map(async (doc) => {
      try {
        // Step 1: Chunk document
        const chunks = chunker.chunk(
          doc.document_id,
          doc.text_content,
          doc.document_type,
          doc.token_count
        );

        // Step 2: Generate embeddings for all chunks
        const chunkTexts = chunks.map(c => c.chunk_text);
        const embeddings = await embedder.generateEmbeddingsBatch(
          chunkTexts,
          'search_document'
        );

        // Step 3: Store embeddings in database
        await db.transaction(async (client) => {
          for (let j = 0; j < chunks.length; j++) {
            await client.query(`
              INSERT INTO document_embeddings (
                embedding_id,
                document_id,
                chunk_index,
                chunk_total,
                chunk_text,
                chunk_type,
                section_title,
                section_number,
                embedding
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              chunks[j].chunk_id,
              chunks[j].document_id,
              chunks[j].chunk_index,
              chunks[j].chunk_total,
              chunks[j].chunk_text,
              chunks[j].chunk_type,
              chunks[j].section_title,
              chunks[j].section_number,
              JSON.stringify(embeddings[j]),  // pgvector handles array
            ]);
          }

          // Mark document as indexed
          await client.query(`
            UPDATE documents
            SET indexed_at = NOW()
            WHERE document_id = $1
          `, [doc.document_id]);
        });

        processed++;
        if (processed % 100 === 0) {
          console.log(`Processed ${processed}/${documents.rows.length} documents`);
        }

      } catch (error) {
        console.error(`Failed to vectorize ${doc.document_id}:`, error);
      }
    }));
  }

  console.log(`Vectorization complete! Processed ${processed} documents.`);
}

// Run
vectorizeAllDocuments().catch(console.error);
```

---

## 10. NEXT.JS API INTEGRATION

### 10.1 Search API Endpoint

```typescript
// app/api/documents/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TitanEmbedder } from '@/lib/embeddings/titan-embedder';

export interface SearchFilters {
  supplier?: string;
  ingredient?: string | string[];
  documentTypes?: string[];
  complianceTypes?: string[];
  regulatoryRegions?: string[];
  onlyCurrentVersions?: boolean;
  minQualityScore?: number;
  excludeDiscontinued?: boolean;
}

export interface SearchOptions {
  similarityThreshold?: number;
  limit?: number;
  includeChunks?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { query, filters, options }: {
      query: string;
      filters?: SearchFilters;
      options?: SearchOptions;
    } = await req.json();

    // Validate
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Step 1: Generate query embedding
    const embedder = new TitanEmbedder();
    const queryEmbedding = await embedder.generateEmbedding(query, 'search_query');

    // Step 2: Build metadata filters
    const filterConditions = buildFilterSQL(filters);

    // Step 3: Hybrid search (vector + keyword)
    const results = await db.query(`
      WITH vector_results AS (
        SELECT
          e.embedding_id,
          e.chunk_text,
          e.chunk_index,
          e.chunk_total,
          d.document_id,
          d.filename,
          d.file_path,
          d.supplier_name,
          d.ingredient_name,
          d.document_type,
          d.document_category,
          d.compliance_types,
          d.version_date,
          d.quality_score,
          d.cas_numbers,
          d.inci_names,
          1 - (e.embedding <=> $1::vector) as similarity_score,
          ts_rank(
            to_tsvector('english', e.chunk_text),
            plainto_tsquery('english', $2)
          ) as text_rank
        FROM document_embeddings e
        JOIN documents d ON e.document_id = d.document_id
        WHERE ${filterConditions}
          AND (1 - (e.embedding <=> $1::vector)) > $3
      )
      SELECT *
      FROM vector_results
      ORDER BY
        (similarity_score * 0.7 + text_rank * 0.3) DESC,
        quality_score DESC NULLS LAST
      LIMIT $4
    `, [
      JSON.stringify(queryEmbedding),
      query,
      options?.similarityThreshold || 0.7,
      options?.limit || 20,
    ]);

    // Step 4: Aggregate chunks by document
    const aggregated = aggregateResults(results.rows, options?.includeChunks);

    // Step 5: Log analytics
    const latency = Date.now() - startTime;
    await logSearchAnalytics(query, filters, aggregated.length, latency);

    return NextResponse.json({
      success: true,
      results: aggregated,
      metadata: {
        total: aggregated.length,
        query,
        filters,
        latency_ms: latency,
      },
    });

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

function buildFilterSQL(filters?: SearchFilters): string {
  const conditions: string[] = [];

  // Always filter out duplicates and optionally discontinued
  conditions.push('d.is_duplicate = false');

  if (filters?.excludeDiscontinued !== false) {
    conditions.push('d.is_discontinued = false');
  }

  if (filters?.onlyCurrentVersions !== false) {
    conditions.push('d.is_current = true');
  }

  if (filters?.supplier) {
    conditions.push(`d.supplier_normalized = '${filters.supplier.toLowerCase()}'`);
  }

  if (filters?.ingredient) {
    if (Array.isArray(filters.ingredient)) {
      const ingredients = filters.ingredient.map(i => `'${i.toLowerCase()}'`).join(',');
      conditions.push(`d.ingredient_normalized IN (${ingredients})`);
    } else {
      conditions.push(`d.ingredient_normalized = '${filters.ingredient.toLowerCase()}'`);
    }
  }

  if (filters?.documentTypes && filters.documentTypes.length > 0) {
    const types = filters.documentTypes.map(t => `'${t}'`).join(',');
    conditions.push(`d.document_type IN (${types})`);
  }

  if (filters?.complianceTypes && filters.complianceTypes.length > 0) {
    const compliance = filters.complianceTypes.map(c => `'${c}'`).join(',');
    conditions.push(`d.compliance_types && ARRAY[${compliance}]`);
  }

  if (filters?.minQualityScore) {
    conditions.push(`d.quality_score >= ${filters.minQualityScore}`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
}

function aggregateResults(rows: any[], includeChunks: boolean = true): any[] {
  const docMap = new Map();

  for (const row of rows) {
    if (!docMap.has(row.document_id)) {
      docMap.set(row.document_id, {
        document_id: row.document_id,
        filename: row.filename,
        file_path: row.file_path,
        supplier_name: row.supplier_name,
        ingredient_name: row.ingredient_name,
        document_type: row.document_type,
        document_category: row.document_category,
        compliance_types: row.compliance_types,
        version_date: row.version_date,
        quality_score: row.quality_score,
        cas_numbers: row.cas_numbers,
        inci_names: row.inci_names,
        max_similarity: row.similarity_score,
        chunks: [],
        file_url: `/api/documents/${row.document_id}/download`,
        preview_url: `/api/documents/${row.document_id}/preview`,
      });
    }

    const doc = docMap.get(row.document_id);

    if (includeChunks) {
      doc.chunks.push({
        chunk_index: row.chunk_index,
        chunk_text: row.chunk_text,
        similarity_score: row.similarity_score,
      });
    }

    // Update max similarity
    if (row.similarity_score > doc.max_similarity) {
      doc.max_similarity = row.similarity_score;
    }
  }

  return Array.from(docMap.values());
}

async function logSearchAnalytics(
  query: string,
  filters: any,
  resultsCount: number,
  latency: number
) {
  try {
    await db.query(`
      INSERT INTO search_analytics (
        query,
        filters,
        results_count,
        latency_ms
      ) VALUES ($1, $2, $3, $4)
    `, [query, JSON.stringify(filters), resultsCount, latency]);
  } catch (error) {
    console.error('Failed to log analytics:', error);
  }
}
```

### 10.2 Document Retrieval API

```typescript
// app/api/documents/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await db.query(`
      SELECT * FROM documents
      WHERE document_id = $1
    `, [params.id]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}
```

---

## 11. RAG CHATBOT IMPLEMENTATION

### 11.1 Chat API with AWS Bedrock Nova Micro

```typescript
// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION,
  credentials: {
    accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory, filters } = await req.json();

    // Step 1: Retrieve relevant documents
    const searchResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/documents/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: message,
        filters,
        options: {
          limit: 5,
          includeChunks: true,
        },
      }),
    });

    const { results } = await searchResponse.json();

    // Step 2: Build context from retrieved documents
    const context = buildContext(results);

    // Step 3: Create RAG prompt
    const systemPrompt = `You are a helpful assistant for cosmetics ingredients information.
Use the provided documents to answer questions about ingredients, suppliers, compliance, and safety.
Always cite the document name when referencing information.

Important guidelines:
- Be precise and technical when needed
- Always mention the source document
- If information is not in the provided documents, say so
- For regulatory/compliance questions, be extra careful and cite sources

Context Documents:
${context}`;

    // Step 4: Call Bedrock Nova Micro
    const messages = [
      ...conversationHistory,
      { role: 'user', content: [{ text: message }] },
    ];

    const command = new ConverseCommand({
      modelId: 'amazon.nova-micro-v1:0',
      messages,
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const response = await bedrock.send(command);
    const assistantMessage = response.output.message;

    return NextResponse.json({
      message: assistantMessage,
      sources: results.map((r: any) => ({
        filename: r.filename,
        supplier: r.supplier_name,
        ingredient: r.ingredient_name,
        type: r.document_type,
        similarity: r.max_similarity,
        url: r.file_url,
      })),
    });

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Chat failed' },
      { status: 500 }
    );
  }
}

function buildContext(results: any[]): string {
  return results
    .map((doc, idx) => {
      const topChunks = doc.chunks
        .sort((a: any, b: any) => b.similarity_score - a.similarity_score)
        .slice(0, 2)
        .map((c: any) => c.chunk_text)
        .join('\n\n');

      return `Document ${idx + 1}: ${doc.filename}
Supplier: ${doc.supplier_name}
Ingredient: ${doc.ingredient_name}
Type: ${doc.document_type}
Similarity: ${(doc.max_similarity * 100).toFixed(1)}%

Content:
${topChunks}`;
    })
    .join('\n\n---\n\n');
}
```

---

## 12. SEARCH OPTIMIZATION & STRATEGIES

### 12.1 Query Rewriting & Expansion

```typescript
// lib/search/query-optimizer.ts
export class QueryOptimizer {
  /**
   * Expand user query with synonyms and related terms
   */
  expandQuery(query: string): string[] {
    const queries = [query];

    // Chemical name variations
    if (query.toLowerCase().includes('vitamin e')) {
      queries.push('tocopherol');
      queries.push('alpha-tocopherol');
    }

    // Compliance synonyms
    if (query.toLowerCase().includes('allergen')) {
      queries.push('allergen free');
      queries.push('allergen statement');
    }

    return queries;
  }

  /**
   * Detect query intent and suggest filters
   */
  detectIntent(query: string): { intent: string; suggestedFilters: any } {
    const lowerQuery = query.toLowerCase();

    // Safety information query
    if (lowerQuery.includes('safe') || lowerQuery.includes('hazard')) {
      return {
        intent: 'safety',
        suggestedFilters: {
          documentTypes: ['sds', 'msds'],
        },
      };
    }

    // Compliance query
    if (lowerQuery.includes('halal') || lowerQuery.includes('vegan') || lowerQuery.includes('kosher')) {
      return {
        intent: 'compliance',
        suggestedFilters: {
          documentTypes: ['halal_certificate', 'vegan_statement', 'kosher_certificate'],
        },
      };
    }

    // Technical specs query
    if (lowerQuery.includes('specification') || lowerQuery.includes('properties')) {
      return {
        intent: 'technical',
        suggestedFilters: {
          documentTypes: ['specification', 'technical_data_sheet'],
        },
      };
    }

    return { intent: 'general', suggestedFilters: {} };
  }
}
```

### 12.2 Re-ranking Strategy

```typescript
// lib/search/reranker.ts
export interface RerankConfig {
  boostFactors: {
    documentType?: Record<string, number>;
    qualityScore?: number;
    recency?: number;
  };
}

export function rerankResults(
  results: any[],
  query: string,
  config: RerankConfig
): any[] {
  return results
    .map(result => ({
      ...result,
      final_score: calculateFinalScore(result, query, config),
    }))
    .sort((a, b) => b.final_score - a.final_score);
}

function calculateFinalScore(
  result: any,
  query: string,
  config: RerankConfig
): number {
  let score = result.max_similarity;

  // Document type boost
  if (config.boostFactors.documentType) {
    const typeBoost = config.boostFactors.documentType[result.document_type] || 1.0;
    score *= typeBoost;
  }

  // Quality score boost
  if (config.boostFactors.qualityScore && result.quality_score) {
    score *= (1 + result.quality_score * config.boostFactors.qualityScore);
  }

  // Recency boost (newer docs slightly preferred)
  if (config.boostFactors.recency && result.version_date) {
    const daysSince = daysSinceDate(result.version_date);
    const recencyFactor = Math.max(0.9, 1 - (daysSince / 365) * 0.1);
    score *= recencyFactor;
  }

  return score;
}

function daysSinceDate(date: string): number {
  const then = new Date(date).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}
```

---

## 13. DEPLOYMENT & PRODUCTION SETUP

### 13.1 Environment Variables

```bash
# .env.local (production)
# Database
DATABASE_URL=postgresql://user:pass@neon-host/dbname

# AWS Credentials
BAWS_ACCESS_KEY_ID=your-key
BAWS_SECRET_ACCESS_KEY=your-secret
DEFAULT_REGION=ap-southeast-1
BEDROCK_REGION=us-east-1

# Application
NEXT_PUBLIC_APP_URL=https://your-app.com

# Optional: Mistral OCR (fallback)
MISTRAL_API_KEY=your-mistral-key
```

### 13.2 AWS Amplify Deployment Configuration

```yaml
# amplify.yml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*

# Environment variables (set in Amplify console)
# - DATABASE_URL
# - BAWS_ACCESS_KEY_ID
# - BAWS_SECRET_ACCESS_KEY
# - BEDROCK_REGION
```

---

## 14. COST ESTIMATION

### 14.1 One-Time Costs (Setup)

| Item | Quantity | Unit Cost | Total |
|------|----------|-----------|-------|
| **Text Extraction** | | | |
| Docling processing | 30K docs | $0 (open-source) | $0 |
| Mistral OCR (fallback 10%) | 3K docs (~15K pages) | $0.002/page | $30 |
| **Embedding Generation** | | | |
| Titan v2 embeddings | 45K chunks × 800 tokens | $0.0001/1K tokens | $3.60 |
| **Total One-Time** | | | **~$34** |

### 14.2 Monthly Recurring Costs

| Service | Usage | Unit Cost | Monthly |
|---------|-------|-----------|---------|
| **Neon PostgreSQL** | | | |
| Storage (1GB) | Embeddings + metadata | $0.15/GB | $0.15 |
| Compute (small tier) | Vector search queries | ~$20-40/month | $30 |
| **AWS Bedrock** | | | |
| Titan Embeddings (updates) | ~500 new docs/month | $0.0001/1K tokens | $0.40 |
| Nova Micro (chatbot) | 1000 queries/day | See below | $4.05 |
| **Total Monthly** | | | **~$35/month** |

**Nova Micro Chatbot Breakdown** (1000 queries/day):
- Input: 1000 tokens/query × 1000 queries = 1M tokens/day × 30 = 30M/month
- Output: 200 tokens/response × 1000 = 200K/day × 30 = 6M/month
- Cost: (30M × $0.075/M) + (6M × $0.30/M) = $2.25 + $1.80 = **$4.05/month**

### 14.3 Scaling Projections

**At 5x scale (150K documents, 5000 queries/day)**:
- Storage: ~$1
- Neon Compute: ~$60-80
- Embeddings (updates): ~$2
- Nova Micro: ~$20
- **Total: ~$85/month**

---

## 15. IMPLEMENTATION TIMELINE

### Week 1: Infrastructure & Discovery (Days 1-7)
- [x] **Day 1-2**: Database schema setup, API scaffolding
- [x] **Day 3**: Document inventory scan (31,749 files)
- [x] **Day 4-5**: Metadata extraction from paths/filenames
- [x] **Day 6**: Duplicate detection via hash comparison
- [x] **Day 7**: Version mapping, inventory report

### Week 2: Text Extraction (Days 8-14)
- [ ] **Day 8-10**: Docling integration, test on sample (1K docs)
- [ ] **Day 11-12**: Extract first batch (10K docs, suppliers A-D)
- [ ] **Day 13-14**: Extract remaining (20K docs), QA review

### Week 3: Vectorization (Days 15-21)
- [ ] **Day 15-16**: Chunking pipeline implementation
- [ ] **Day 17-18**: Titan v2 embedding generation (batches)
- [ ] **Day 19-20**: Vector DB ingestion, index optimization
- [ ] **Day 21**: Search performance testing

### Week 4: API & Testing (Days 22-28)
- [ ] **Day 22-23**: Next.js search API, filters
- [ ] **Day 24-25**: RAG chatbot with Nova Micro
- [ ] **Day 26-27**: End-to-end testing, quality evaluation
- [ ] **Day 28**: Documentation, deployment, handoff

**Total: 4 weeks** (includes QA buffer)

---

## 16. MONITORING & MAINTENANCE

### 16.1 Key Metrics to Track

```typescript
// Dashboard metrics
export interface SearchMetrics {
  // Performance
  avgLatency: number;           // Target: <500ms
  p95Latency: number;           // Target: <1000ms
  cacheHitRate: number;         // Target: >50%

  // Quality
  avgSimilarityScore: number;   // Target: >0.75
  zeroResultsRate: number;      // Target: <5%
  avgResultsCount: number;      // Target: 5-15

  // Usage
  dailyQueries: number;
  topQueries: string[];
  topSuppliers: string[];
  topIngredients: string[];
}
```

### 16.2 Automated Monitoring

```typescript
// lib/monitoring/metrics.ts
export async function logPerformanceMetrics() {
  const metrics = await db.query(`
    SELECT
      AVG(latency_ms) as avg_latency,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency,
      AVG(results_count) as avg_results,
      SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as zero_results_rate
    FROM search_analytics
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `);

  // Send to monitoring service (CloudWatch, Datadog, etc.)
  await sendToMonitoring(metrics.rows[0]);
}
```

### 16.3 Maintenance Schedule

**Weekly**:
- Review low-quality extractions (quality_score < 0.8)
- Check for failed vectorizations
- Monitor slow queries (>1s)

**Monthly**:
- Re-embed updated documents
- Refresh expired certificates metadata
- Analyze search patterns, optimize filters

**Quarterly**:
- Review and optimize metadata schema
- Update chunking strategies based on usage
- Performance tuning (indexes, queries)

---

## 17. FUTURE ENHANCEMENTS

### 17.1 Short-term (3-6 months)
1. **Multi-modal RAG**: Add image analysis for diagrams/charts
2. **Semantic caching**: Cache common query embeddings
3. **Auto-suggestions**: Query autocomplete based on history
4. **Batch comparison**: "Compare allergen profiles across 5 suppliers"

### 17.2 Long-term (6-12 months)
1. **Temporal queries**: "Show SDS changes over time"
2. **Cross-reference detection**: Auto-link related documents
3. **Multi-language support**: Thai/Chinese full-text search
4. **Certificate expiry alerts**: Proactive notifications
5. **Custom LLM fine-tuning**: Domain-specific cosmetics model

---

## SUMMARY & QUICK REFERENCE

### Technology Stack
- **Frontend**: Next.js with App Router
- **Database**: Neon PostgreSQL + pgvector
- **Embeddings**: AWS Titan v2 (1024-dim)
- **LLM**: AWS Bedrock Nova Micro
- **Text Extraction**: Docling (primary), Mistral OCR (fallback)
- **Deployment**: AWS Amplify

### Key Numbers
- **Documents**: 31,749 total, ~30,208 processable
- **Suppliers**: 89
- **Vector Dimensions**: 1024
- **Chunks**: ~45,000 (avg 1.5 per document)
- **Cost**: ~$34 setup, ~$35/month recurring
- **Timeline**: 4 weeks to production

### Critical Success Factors
1. **Metadata Quality**: 25+ fields enable precise filtering
2. **Hybrid Search**: Vector (70%) + Keyword (30%) for best results
3. **Comprehensive Chunking**: Document-level for small docs, section-level for large
4. **Version Management**: Always show latest, archive old versions
5. **Performance**: <500ms search latency, >0.75 similarity scores

### Next Steps
1. Review and approve this plan
2. Set up Neon database with schema (Part 2)
3. Run inventory scan (Part 1, Phase 1)
4. Begin text extraction pipeline (Part 2, Phase 2)
5. Start vectorization (Part 3, Phase 3)
6. Deploy APIs and test (Part 3, Week 4)

---

**END OF IMPLEMENTATION PLAN**

All three parts provide a complete, production-ready blueprint for building a high-precision RAG system for cosmetics ingredient B2B customer support. Each section includes working code examples, architectural decisions, and optimization strategies.
