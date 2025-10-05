# Vector Search Deployment Guide

## Pre-deployment Checklist

### Database Migration
1. **Backup existing data**
   ```sql
   CREATE TABLE document_chunks_backup AS
   SELECT * FROM document_chunks WHERE embedding IS NOT NULL;
   ```

2. **Apply schema changes**
   ```sql
   -- Drop old indexes
   DROP INDEX IF EXISTS idx_document_chunks_embedding CASCADE;
   DROP INDEX IF EXISTS idx_document_chunks_embedding_ivfflat CASCADE;

   -- Update table structure (use migration approach from main report)
   -- See vector-search-debug-report.md for full migration steps
   ```

3. **Create optimized indexes**
   ```sql
   CREATE INDEX idx_document_chunks_embedding_hnsw ON document_chunks
   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

   CREATE INDEX idx_document_chunks_embedding_ivfflat ON document_chunks
   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 224);
   ```

### Environment Configuration
```bash
# Required environment variables
BEDROCK_REGION=us-east-1
BAWS_ACCESS_KEY_ID=your_aws_access_key
BAWS_SECRET_ACCESS_KEY=your_aws_secret_key
DATABASE_URL=your_neon_postgresql_url
```

### Code Deployment
1. Deploy updated `lib/services/knowledge-base.ts`
2. Deploy updated `lib/db/schema.ts`
3. Restart application services
4. Monitor for errors in logs

## Performance Monitoring

### Key Metrics to Track
- Vector search response time (<100ms target)
- Embedding generation time
- Database query performance
- Memory usage for vector operations

### Monitoring Queries
```sql
-- Check vector search performance
EXPLAIN ANALYZE
SELECT * FROM document_chunks dc
INNER JOIN documents d ON dc.document_id = d.id
WHERE dc.embedding IS NOT NULL
ORDER BY dc.embedding <=> '[...]'::vector
LIMIT 10;

-- Monitor index usage
SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'document_chunks';
```

## Rollback Plan

If issues occur, rollback steps:
1. Restore from `document_chunks_backup` table
2. Revert code changes
3. Restore original indexes
4. Monitor system stability