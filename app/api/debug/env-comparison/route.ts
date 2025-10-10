import { NextResponse } from 'next/server';

/**
 * Debug endpoint to compare environment variable access patterns
 * This will help us understand why debug/env-check sees variables but step-functions/start doesn't
 */
export async function GET() {
  try {
    const requiredVars = [
      'BAWS_ACCESS_KEY_ID',
      'BAWS_SECRET_ACCESS_KEY',
      'DEFAULT_REGION',
      'STEPFUNCTIONS_S3_BUCKET'
    ];

    // Method 1: Simple boolean check (used by debug/env-check)
    const method1Results = {
      BAWS_ACCESS_KEY_ID: !!process.env.BAWS_ACCESS_KEY_ID,
      BAWS_SECRET_ACCESS_KEY: !!process.env.BAWS_SECRET_ACCESS_KEY,
      DEFAULT_REGION: !!process.env.DEFAULT_REGION,
      STEPFUNCTIONS_S3_BUCKET: !!process.env.STEPFUNCTIONS_S3_BUCKET,
    };

    // Method 2: Detailed analysis (used by step-functions/start)
    const method2Results: any = {};
    const missingVars: string[] = [];

    requiredVars.forEach(varName => {
      const value = process.env[varName];
      const isMissing = !value || value.trim() === '';

      method2Results[varName] = {
        exists: !!value,
        isUndefined: value === undefined,
        isNull: value === null,
        isEmpty: value === '',
        isWhitespace: value ? value.trim() === '' : false,
        length: value?.length || 0,
        type: typeof value,
        firstChars: value ? value.substring(0, 10) + (value.length > 10 ? '...' : '') : 'N/A'
      };

      if (isMissing) {
        missingVars.push(varName);
      }
    });

    // Method 3: Get actual values (redacted for secrets)
    const method3Results = {
      BAWS_ACCESS_KEY_ID: process.env.BAWS_ACCESS_KEY_ID ? '[PRESENT]' : '[MISSING]',
      BAWS_SECRET_ACCESS_KEY: process.env.BAWS_SECRET_ACCESS_KEY ? '[PRESENT]' : '[MISSING]',
      DEFAULT_REGION: process.env.DEFAULT_REGION || '[MISSING]',
      STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET || '[MISSING]',
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      comparison: {
        method1_boolean_check: method1Results,
        method2_detailed_analysis: method2Results,
        method3_actual_values: method3Results,
        missingVarsDetected: missingVars,
        conclusion: {
          allPresentByMethod1: Object.values(method1Results).every(v => v === true),
          missingByMethod2: missingVars.length > 0,
          missingVarsList: missingVars
        }
      }
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Comparison check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}