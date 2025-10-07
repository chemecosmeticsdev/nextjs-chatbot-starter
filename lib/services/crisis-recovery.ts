import { documentRecoveryService } from './document-recovery';

/**
 * Crisis Recovery Script
 * Execute immediate recovery actions for the JobQueue crisis
 */
export class CrisisRecovery {

  async executePhase2Recovery(): Promise<void> {
    console.log('='.repeat(60));
    console.log('🚨 PHASE 2: CRISIS RECOVERY EXECUTION');
    console.log('='.repeat(60));

    try {
      // Step 1: Get current recovery statistics
      console.log('\n📊 STEP 1: Analyzing current state...');
      const stats = await documentRecoveryService.getRecoveryStats();
      console.log('Recovery Statistics:', stats);

      // Step 2: Quick userId recovery for immediate fix
      console.log('\n🔧 STEP 2: Quick userId recovery...');
      const userIdResults = await documentRecoveryService.quickUserIdRecovery('system-recovery');
      console.log(`✅ Fixed userId for ${userIdResults.fixed} documents`);
      if (userIdResults.errors.length > 0) {
        console.log(`❌ Errors: ${userIdResults.errors.length}`);
        userIdResults.errors.forEach(error => console.log(`   - ${error}`));
      }

      // Step 3: Comprehensive recovery analysis (dry run first)
      console.log('\n📋 STEP 3: Comprehensive recovery analysis (dry run)...');
      const dryRunResults = await documentRecoveryService.recoverFailedDocuments({
        dryRun: true,
        batchSize: 25
      });
      console.log('Dry Run Results:', dryRunResults);

      // Step 4: Execute recovery if dry run looks good
      if (dryRunResults.recoverable > 0 && dryRunResults.errors.length < 5) {
        console.log('\n⚡ STEP 4: Executing recovery...');
        const recoveryResults = await documentRecoveryService.recoverFailedDocuments({
          dryRun: false,
          batchSize: 25,
          systemUserId: 'system-recovery'
        });
        console.log('Recovery Results:', recoveryResults);

        console.log('\n✅ PHASE 2 RECOVERY COMPLETE!');
        console.log(`📈 Summary:`);
        console.log(`   - Documents analyzed: ${recoveryResults.analyzed}`);
        console.log(`   - Documents recovered: ${recoveryResults.recoverable}`);
        console.log(`   - Documents fixed: ${recoveryResults.fixed}`);
        console.log(`   - Documents reprocessed: ${recoveryResults.reprocessed}`);
        console.log(`   - Errors encountered: ${recoveryResults.errors.length}`);
      } else {
        console.log('\n⚠️  Dry run showed issues - manual review needed');
        console.log(`   - Recoverable: ${dryRunResults.recoverable}`);
        console.log(`   - Errors: ${dryRunResults.errors.length}`);
      }

    } catch (error) {
      console.error('\n💥 PHASE 2 RECOVERY FAILED:', error);
      throw error;
    }
  }
}

export const crisisRecovery = new CrisisRecovery();