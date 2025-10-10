/**
 * Step Functions pgVector Inserter
 * Inserts vector embeddings and document metadata into Neon PostgreSQL with pgvector
 */

const { Client } = require('pg');

exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('pgVector Inserter started:', JSON.stringify(event, null, 2));

  let client;

  try {
    const {
      executionId,
      documentId,
      fileName,
      s3Bucket,
      s3Key,
      mimeType,
      ocrResult,
      enhancedMetadata,
      chunkingResult,
      embeddingResult
    } = event;

    // Validate required parameters
    if (!executionId || !documentId || !embeddingResult?.embeddings) {
      throw new Error('Missing required parameters: executionId, documentId, embeddingResult.embeddings');
    }

    console.log(`Inserting vectors for document: ${fileName} (${documentId})`);
    console.log(`Processing ${embeddingResult.embeddings.length} embeddings`);

    // Initialize database connection
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log('Connected to Neon PostgreSQL database');

    // Start transaction
    await client.query('BEGIN');

    try {
      // Insert or update document metadata
      const documentInsertResult = await insertDocumentMetadata(
        client,
        documentId,
        fileName,
        s3Bucket,
        s3Key,
        mimeType,
        ocrResult,
        enhancedMetadata,
        chunkingResult,
        embeddingResult
      );

      // Insert chunk embeddings
      const chunkInsertResult = await insertChunkEmbeddings(
        client,
        documentId,
        embeddingResult.embeddings
      );

      // Commit transaction
      await client.query('COMMIT');

      // Prepare response
      const response = {
        ...event,
        insertionResult: {
          documentInserted: documentInsertResult.inserted,
          documentUpdated: documentInsertResult.updated,
          chunksInserted: chunkInsertResult.inserted,
          chunksFailed: chunkInsertResult.failed,
          totalEmbeddings: embeddingResult.embeddings.length,
          successfulInsertions: chunkInsertResult.inserted,
          failedInsertions: chunkInsertResult.failed,
          insertionRate: ((chunkInsertResult.inserted / embeddingResult.embeddings.length) * 100).toFixed(2) + '%',
          processingTime: Date.now() - startTime,
          databaseMetadata: {
            insertedAt: new Date().toISOString(),
            executionId: executionId,
            vectorDimensions: 1024,
            database: 'neon-postgresql-pgvector'
          }
        },
        // Update execution status
        status: 'INSERTION_COMPLETED',
        updatedAt: new Date().toISOString()
      };

      console.log(`pgVector insertion completed for ${fileName}. Inserted ${chunkInsertResult.inserted}/${embeddingResult.embeddings.length} chunks successfully`);
      return response;

    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('pgVector insertion failed:', error);

    // Return error response that Step Functions can handle
    return {
      ...event,
      status: 'INSERTION_FAILED',
      error: {
        type: error.name || 'InsertionError',
        message: error.message,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime
      },
      updatedAt: new Date().toISOString()
    };
  } finally {
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
};

/**
 * Insert or update document metadata in the documents table
 */
async function insertDocumentMetadata(
  client,
  documentId,
  fileName,
  s3Bucket,
  s3Key,
  mimeType,
  ocrResult,
  enhancedMetadata,
  chunkingResult,
  embeddingResult
) {
  try {
    // Check if document already exists
    const existingDoc = await client.query(
      'SELECT id FROM documents WHERE id = $1',
      [documentId]
    );

    const documentData = {
      id: documentId,
      title: enhancedMetadata?.title || fileName.replace(/\.[^/.]+$/, ''),
      file_name: fileName,
      file_path: `s3://${s3Bucket}/${s3Key}`,
      mime_type: mimeType || 'application/octet-stream',
      file_size: ocrResult?.metadata?.fileSize || 0,
      processing_status: 'completed',
      text_content: ocrResult?.text || '',
      text_length: ocrResult?.text?.length || 0,
      token_count: Math.ceil((ocrResult?.text?.length || 0) / 4), // Rough token estimation
      language: enhancedMetadata?.language || 'en',
      summary: enhancedMetadata?.summary || '',
      categories: JSON.stringify(enhancedMetadata?.categories || []),
      entities: JSON.stringify(enhancedMetadata?.entities || {}),
      metadata: JSON.stringify({
        ocr: {
          method: ocrResult?.method,
          confidence: ocrResult?.confidence,
          processingTime: ocrResult?.processingTime
        },
        enhancement: enhancedMetadata?.enhancement,
        chunking: {
          strategy: chunkingResult?.strategy,
          totalChunks: chunkingResult?.totalChunks,
          avgChunkSize: chunkingResult?.avgChunkSize
        },
        embedding: {
          model: embeddingResult?.embeddingMetadata?.model,
          dimensions: embeddingResult?.embeddingMetadata?.dimensions,
          successRate: embeddingResult?.statistics?.successRate
        }
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existingDoc.rows.length > 0) {
      // Update existing document
      await client.query(`
        UPDATE documents SET
          title = $2,
          file_name = $3,
          file_path = $4,
          mime_type = $5,
          file_size = $6,
          processing_status = $7,
          text_content = $8,
          text_length = $9,
          token_count = $10,
          language = $11,
          summary = $12,
          categories = $13,
          entities = $14,
          metadata = $15,
          updated_at = $16
        WHERE id = $1
      `, [
        documentData.id,
        documentData.title,
        documentData.file_name,
        documentData.file_path,
        documentData.mime_type,
        documentData.file_size,
        documentData.processing_status,
        documentData.text_content,
        documentData.text_length,
        documentData.token_count,
        documentData.language,
        documentData.summary,
        documentData.categories,
        documentData.entities,
        documentData.metadata,
        documentData.updated_at
      ]);

      console.log(`Updated existing document: ${documentId}`);
      return { inserted: false, updated: true };

    } else {
      // Insert new document
      await client.query(`
        INSERT INTO documents (
          id, title, file_name, file_path, mime_type, file_size, processing_status,
          text_content, text_length, token_count, language, summary, categories,
          entities, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        documentData.id,
        documentData.title,
        documentData.file_name,
        documentData.file_path,
        documentData.mime_type,
        documentData.file_size,
        documentData.processing_status,
        documentData.text_content,
        documentData.text_length,
        documentData.token_count,
        documentData.language,
        documentData.summary,
        documentData.categories,
        documentData.entities,
        documentData.metadata,
        documentData.created_at,
        documentData.updated_at
      ]);

      console.log(`Inserted new document: ${documentId}`);
      return { inserted: true, updated: false };
    }

  } catch (error) {
    console.error('Document metadata insertion failed:', error);
    throw new Error(`Document insertion failed: ${error.message}`);
  }
}

/**
 * Insert chunk embeddings into the document_chunks table
 */
async function insertChunkEmbeddings(client, documentId, embeddings) {
  let inserted = 0;
  let failed = 0;

  // Delete existing chunks for this document
  await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
  console.log(`Cleared existing chunks for document: ${documentId}`);

  // Insert new chunks
  for (const embeddingData of embeddings) {
    try {
      if (!embeddingData.success || !embeddingData.embedding) {
        console.warn(`Skipping failed embedding for chunk ${embeddingData.chunkIndex}`);
        failed++;
        continue;
      }

      // Prepare chunk data
      const chunkData = {
        id: embeddingData.chunkId,
        document_id: documentId,
        chunk_index: embeddingData.chunkIndex,
        content: embeddingData.chunkContent,
        content_length: embeddingData.chunkContent.length,
        word_count: embeddingData.chunkContent.split(/\s+/).length,
        embedding: JSON.stringify(embeddingData.embedding),
        metadata: JSON.stringify(embeddingData.metadata),
        created_at: new Date().toISOString()
      };

      // Insert chunk with pgvector embedding
      await client.query(`
        INSERT INTO document_chunks (
          id, document_id, chunk_index, content, content_length, word_count,
          embedding, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        chunkData.id,
        chunkData.document_id,
        chunkData.chunk_index,
        chunkData.content,
        chunkData.content_length,
        chunkData.word_count,
        chunkData.embedding,
        chunkData.metadata,
        chunkData.created_at
      ]);

      inserted++;

      if (inserted % 10 === 0) {
        console.log(`Inserted ${inserted} chunks so far...`);
      }

    } catch (error) {
      console.error(`Failed to insert chunk ${embeddingData.chunkIndex}:`, error);
      failed++;
    }
  }

  console.log(`Chunk insertion completed: ${inserted} inserted, ${failed} failed`);
  return { inserted, failed };
}

/**
 * Validate embedding data before insertion
 */
function validateEmbeddingData(embeddingData) {
  if (!embeddingData.chunkId || !embeddingData.chunkContent) {
    return false;
  }

  if (!embeddingData.embedding || !Array.isArray(embeddingData.embedding)) {
    return false;
  }

  if (embeddingData.embedding.length !== 1024) {
    return false;
  }

  return embeddingData.embedding.every(value =>
    typeof value === 'number' && !isNaN(value) && isFinite(value)
  );
}