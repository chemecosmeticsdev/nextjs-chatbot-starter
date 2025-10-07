# Database Cleanup Procedures for Production Deployment

## 🎯 **Objective**
Clean all test/mock data from the database while preserving the super admin user and essential system configurations for production deployment.

## 📊 **Pre-Cleanup Analysis**

### Current Database State
- **Total Tables**: 27 tables analyzed
- **Largest Tables by Size**:
  - `document_chunks`: 2752 kB (test vector embeddings)
  - `search_queries`: 144 kB (test search data)
  - `search_results_cache`: 112 kB (test cache data)
  - `chatbot_instances`: 96 kB (test chatbot data)
  - `activity_logs`: 88 kB (test activity data)

### Data to Preserve
- **Super Admin User**: `chemecosmetics.dev@gmail.com` (ID: 525baa17-e509-4f4f-a6e8-51fb8d570489)
- **System Settings**: All configurations in `system_settings` table
- **System Configs**: All configurations in `system_configs` table

### Data to Remove
- **Test User**: `test@example.com` (ID: b8a846f0-fb89-41fb-93d9-f4b26f02d10e)
- **Test Products**: 1 product ("Test INCI Name", "Test Trade Name")
- **Test Suppliers**: 1 supplier ("Test Supplier", code: "TS001")
- **Test Documents**: 3 documents (test-document.pdf, test-knowledge-base.txt, test_knowledge_document.pdf)
- **Test Chatbots**: 3 chatbot instances (Comprehensive Test Bot, Test Widget Chatbot, Test Support Bot v3)
- **Related Data**: All associated chunks, conversations, logs, cache entries

## 🔒 **Backup Procedures**

### 1. Automatic Neon Backup
Neon automatically creates point-in-time recovery backups. Verify backup status:
```sql
-- Check current database size and last backup
SELECT
    pg_size_pretty(pg_database_size(current_database())) as database_size,
    now() as backup_timestamp;
```

### 2. Export Critical Data
Before cleanup, export super admin user data for verification:
```sql
-- Export super admin user details
COPY (
    SELECT id, email, role, created_at, updated_at
    FROM users
    WHERE email = 'chemecosmetics.dev@gmail.com'
) TO '/tmp/super_admin_backup.csv' WITH CSV HEADER;
```

### 3. System Configuration Backup
```sql
-- Export system settings
COPY (
    SELECT * FROM system_settings
) TO '/tmp/system_settings_backup.csv' WITH CSV HEADER;

-- Export system configs
COPY (
    SELECT * FROM system_configs
) TO '/tmp/system_configs_backup.csv' WITH CSV HEADER;
```

## 🗑️ **Cleanup Procedures**

### Phase 1: Remove Test User and Dependencies

#### Step 1: Remove Test User Activity Logs
```sql
-- Remove activity logs for test user
DELETE FROM activity_logs
WHERE user_id = 'b8a846f0-fb89-41fb-93d9-f4b26f02d10e';

-- Verify deletion
SELECT COUNT(*) as remaining_test_user_logs
FROM activity_logs
WHERE user_id = 'b8a846f0-fb89-41fb-93d9-f4b26f02d10e';
```

#### Step 2: Remove Test User from Other Tables
```sql
-- Remove from conversation context
DELETE FROM conversation_context
WHERE user_id = 'b8a846f0-fb89-41fb-93d9-f4b26f02d10e';

-- Remove from message feedback
DELETE FROM message_feedback
WHERE user_id = 'b8a846f0-fb89-41fb-93d9-f4b26f02d10e';

-- Remove the test user
DELETE FROM users
WHERE id = 'b8a846f0-fb89-41fb-93d9-f4b26f02d10e';

-- Verify test user is removed
SELECT COUNT(*) as remaining_test_users
FROM users
WHERE email = 'test@example.com';
```

### Phase 2: Remove Test Documents and Chunks

#### Step 1: Identify Test Document IDs
```sql
-- Get test document IDs for reference
SELECT id, title, filename, original_filename
FROM documents
WHERE title LIKE '%test%' OR filename LIKE '%test%' OR original_filename LIKE '%test%';
```

#### Step 2: Remove Document Chunks
```sql
-- Remove vector embeddings for test documents
DELETE FROM document_chunks
WHERE document_id IN (
    SELECT id FROM documents
    WHERE title LIKE '%test%' OR filename LIKE '%test%' OR original_filename LIKE '%test%'
);

-- Verify chunks removed
SELECT COUNT(*) as remaining_chunks
FROM document_chunks dc
JOIN documents d ON dc.document_id = d.id
WHERE d.title LIKE '%test%' OR d.filename LIKE '%test%' OR d.original_filename LIKE '%test%';
```

#### Step 3: Remove Test Documents
```sql
-- Remove test documents
DELETE FROM documents
WHERE title LIKE '%test%' OR filename LIKE '%test%' OR original_filename LIKE '%test%';

-- Verify documents removed
SELECT COUNT(*) as remaining_test_documents
FROM documents
WHERE title LIKE '%test%' OR filename LIKE '%test%' OR original_filename LIKE '%test%';
```

### Phase 3: Remove Test Products and Suppliers

#### Step 1: Remove Test Products
```sql
-- Get test product ID
SELECT id, inci_name, trade_name, supplier_id
FROM products
WHERE inci_name = 'Test INCI Name';

-- Remove test product
DELETE FROM products
WHERE inci_name = 'Test INCI Name' AND trade_name = 'Test Trade Name';

-- Verify product removed
SELECT COUNT(*) as remaining_test_products
FROM products
WHERE inci_name LIKE '%Test%';
```

#### Step 2: Remove Test Suppliers
```sql
-- Remove test supplier
DELETE FROM suppliers
WHERE name = 'Test Supplier' AND code = 'TS001';

-- Verify supplier removed
SELECT COUNT(*) as remaining_test_suppliers
FROM suppliers
WHERE name LIKE '%Test%' OR code LIKE '%TS%';
```

### Phase 4: Remove Test Chatbot Data

#### Step 1: Remove Test Chatbot Messages
```sql
-- Remove messages for test chatbots
DELETE FROM chatbot_messages
WHERE chatbot_id IN (
    SELECT id FROM chatbot_instances
    WHERE name LIKE '%Test%' OR name LIKE '%Comprehensive%'
);
```

#### Step 2: Remove Test Conversations
```sql
-- Remove conversations for test chatbots
DELETE FROM chatbot_conversations
WHERE chatbot_id IN (
    SELECT id FROM chatbot_instances
    WHERE name LIKE '%Test%' OR name LIKE '%Comprehensive%'
);
```

#### Step 3: Remove Test Chatbot Configurations
```sql
-- Remove widget configs for test chatbots
DELETE FROM chatbot_widget_configs
WHERE chatbot_id IN (
    SELECT id FROM chatbot_instances
    WHERE name LIKE '%Test%' OR name LIKE '%Comprehensive%'
);

-- Remove other chatbot-related data
DELETE FROM chatbot_analytics
WHERE chatbot_id IN (
    SELECT id FROM chatbot_instances
    WHERE name LIKE '%Test%' OR name LIKE '%Comprehensive%'
);
```

#### Step 4: Remove Test Chatbot Instances
```sql
-- Remove test chatbot instances
DELETE FROM chatbot_instances
WHERE name LIKE '%Test%' OR name LIKE '%Comprehensive%';

-- Verify chatbots removed
SELECT COUNT(*) as remaining_test_chatbots
FROM chatbot_instances
WHERE name LIKE '%Test%' OR name LIKE '%Comprehensive%';
```

### Phase 5: Clean Search and Cache Data

#### Step 1: Remove Test Search Queries
```sql
-- Remove search queries that might be test-related
DELETE FROM search_queries
WHERE query_text LIKE '%test%'
   OR query_text LIKE '%Test%'
   OR user_id = 'b8a846f0-fb89-41fb-93d9-f4b26f02d10e';
```

#### Step 2: Clear Search Results Cache
```sql
-- Clear all cached search results (will be regenerated)
DELETE FROM search_results_cache;

-- Verify cache cleared
SELECT COUNT(*) as remaining_cache_entries FROM search_results_cache;
```

## ✅ **Post-Cleanup Verification**

### Verify Super Admin Integrity
```sql
-- Confirm super admin user exists and is intact
SELECT id, email, role, created_at
FROM users
WHERE email = 'chemecosmetics.dev@gmail.com';

-- Expected result: 1 user with super_admin role
```

### Verify Clean State
```sql
-- Check for any remaining test data
SELECT
    (SELECT COUNT(*) FROM users WHERE email LIKE '%test%') as test_users,
    (SELECT COUNT(*) FROM products WHERE inci_name LIKE '%Test%') as test_products,
    (SELECT COUNT(*) FROM suppliers WHERE name LIKE '%Test%') as test_suppliers,
    (SELECT COUNT(*) FROM documents WHERE title LIKE '%test%') as test_documents,
    (SELECT COUNT(*) FROM chatbot_instances WHERE name LIKE '%Test%') as test_chatbots;

-- Expected result: All counts should be 0
```

### Database Size Verification
```sql
-- Check database size after cleanup
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;
```

## 🚨 **Rollback Procedures**

### If Issues Occur During Cleanup
1. **Stop Cleanup Process**: Do not proceed with additional DELETE operations
2. **Neon Point-in-Time Recovery**: Contact Neon support for point-in-time recovery
3. **Restore from Backup**: Use Neon's automatic backup system

### Verification Before Proceeding
```sql
-- Before each major deletion, verify the count
SELECT COUNT(*) FROM table_name WHERE condition;

-- Only proceed if count matches expectations
```

## 📊 **Expected Results After Cleanup**

### Preserved Data
- ✅ 1 Super admin user
- ✅ System settings and configurations
- ✅ Database schema and structure
- ✅ Empty tables ready for production data

### Removed Data
- ✅ 0 Test users
- ✅ 0 Test products/suppliers
- ✅ 0 Test documents and chunks
- ✅ 0 Test chatbot instances
- ✅ 0 Test-related cache/search data

### Database Size Reduction
- **Before**: ~3.5MB total
- **After**: ~500KB (estimated 85% reduction)
- **Largest remaining**: Core system tables with minimal data

---

## ⚠️ **Important Notes**

1. **Execute in Order**: Follow the phases in sequence to maintain referential integrity
2. **Verify Each Step**: Check results before proceeding to next phase
3. **Monitor Performance**: Watch for any performance issues during cleanup
4. **Document Results**: Record actual deletion counts for verification
5. **Test After Cleanup**: Ensure system functionality is maintained

**Cleanup Execution Date**: [TO BE FILLED]
**Executed By**: [TO BE FILLED]
**Total Records Removed**: [TO BE FILLED]
**Final Database Size**: [TO BE FILLED]