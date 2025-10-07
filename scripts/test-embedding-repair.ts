/**
 * Test script for embedding repair functionality
 * This script tests the missing embedding repair process
 */

import { KnowledgeBaseService } from '@/lib/services/knowledge-base';

async function testEmbeddingRepair() {
  console.log('🔍 Starting embedding repair test...\n');

  try {
    // Step 1: Identify missing embeddings
    console.log('Step 1: Identifying missing embeddings...');
    const missingInfo = await KnowledgeBaseService.identifyMissingEmbeddings();

    console.log(`📊 Found ${missingInfo.missingCount} missing embeddings out of ${missingInfo.totalChunks} total chunks`);
    console.log(`📈 Current coverage: ${((1 - missingInfo.missingCount / missingInfo.totalChunks) * 100).toFixed(1)}%\n`);

    if (missingInfo.missingCount === 0) {
      console.log('✅ No missing embeddings found! System is already healthy.');
      return;
    }

    // Show missing chunks details
    console.log('Missing chunks:');
    missingInfo.missingChunks.forEach((chunk, index) => {
      console.log(`  ${index + 1}. Document: ${chunk.documentName}, Chunk: ${chunk.chunkIndex}`);
      console.log(`     Content preview: "${chunk.content.substring(0, 100)}..."`);
    });
    console.log();

    // Step 2: Validate current integrity
    console.log('Step 2: Validating embedding integrity...');
    const preRepairValidation = await KnowledgeBaseService.validateEmbeddingIntegrity();

    console.log(`📊 Pre-repair status:`);
    console.log(`   - Total chunks: ${preRepairValidation.totalChunks}`);
    console.log(`   - Valid embeddings: ${preRepairValidation.validEmbeddings}`);
    console.log(`   - Missing embeddings: ${preRepairValidation.missingEmbeddings}`);
    console.log(`   - Invalid embeddings: ${preRepairValidation.invalidEmbeddings}`);
    console.log(`   - Coverage: ${preRepairValidation.embeddingCoverage}%\n`);

    // Step 3: Repair missing embeddings
    console.log('Step 3: Repairing missing embeddings...');
    const repairResult = await KnowledgeBaseService.repairMissingEmbeddings();

    console.log(`🔧 Repair results:`);
    console.log(`   - Total processed: ${repairResult.totalRepaired}`);
    console.log(`   - Successful repairs: ${repairResult.successCount}`);
    console.log(`   - Failed repairs: ${repairResult.failureCount}`);

    if (repairResult.failures.length > 0) {
      console.log(`   - Failures:`);
      repairResult.failures.forEach((failure, index) => {
        console.log(`     ${index + 1}. Chunk ${failure.chunkId}: ${failure.error}`);
      });
    }
    console.log();

    // Step 4: Validate after repair
    console.log('Step 4: Validating after repair...');
    const postRepairValidation = await KnowledgeBaseService.validateEmbeddingIntegrity();

    console.log(`📊 Post-repair status:`);
    console.log(`   - Total chunks: ${postRepairValidation.totalChunks}`);
    console.log(`   - Valid embeddings: ${postRepairValidation.validEmbeddings}`);
    console.log(`   - Missing embeddings: ${postRepairValidation.missingEmbeddings}`);
    console.log(`   - Invalid embeddings: ${postRepairValidation.invalidEmbeddings}`);
    console.log(`   - Coverage: ${postRepairValidation.embeddingCoverage}%`);
    console.log(`   - System health: ${postRepairValidation.isValid ? '✅ HEALTHY' : '⚠️ ISSUES REMAIN'}\n`);

    // Step 5: Summary
    const coverageImprovement = postRepairValidation.embeddingCoverage - preRepairValidation.embeddingCoverage;
    console.log(`📈 Summary:`);
    console.log(`   - Coverage improvement: +${coverageImprovement.toFixed(1)}%`);
    console.log(`   - Fixed embeddings: ${repairResult.successCount}`);
    console.log(`   - Final status: ${postRepairValidation.isValid ? 'SYSTEM HEALTHY ✅' : 'ISSUES REMAIN ⚠️'}`);

    if (postRepairValidation.isValid) {
      console.log('\n🎉 All missing embeddings have been successfully repaired!');
      console.log('🚀 Vector search accuracy has been improved to 100% coverage.');
    }

  } catch (error) {
    console.error('❌ Error during embedding repair test:', error);
    throw error;
  }
}

// Export for use as module
export { testEmbeddingRepair };

// Run if executed directly
if (require.main === module) {
  testEmbeddingRepair()
    .then(() => {
      console.log('\n✅ Embedding repair test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Embedding repair test failed:', error);
      process.exit(1);
    });
}