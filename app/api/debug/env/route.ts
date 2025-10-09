/**
 * Debug Environment Variables Endpoint
 * Shows available environment variables (safely)
 */

import { NextRequest, NextResponse } from 'next/server';

// Disable caching for debug endpoint
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const envDebug = {
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      region: process.env.DEFAULT_REGION,
      hasAwsCredentials: !!(process.env.BAWS_ACCESS_KEY_ID && process.env.BAWS_SECRET_ACCESS_KEY),
      sqsQueues: {
        critical: !!process.env.SQS_CRITICAL_QUEUE_URL,
        high: !!process.env.SQS_HIGH_QUEUE_URL,
        normal: !!process.env.SQS_NORMAL_QUEUE_URL,
        low: !!process.env.SQS_LOW_QUEUE_URL,
      },
      sqsQueueUrls: {
        critical: process.env.SQS_CRITICAL_QUEUE_URL || 'not-set',
        high: process.env.SQS_HIGH_QUEUE_URL || 'not-set',
        normal: process.env.SQS_NORMAL_QUEUE_URL || 'not-set',
        low: process.env.SQS_LOW_QUEUE_URL || 'not-set',
      },
      allEnvKeys: Object.keys(process.env).filter(key =>
        key.startsWith('SQS_') ||
        key.startsWith('BAWS_') ||
        key.startsWith('DEFAULT_') ||
        key.startsWith('NODE_')
      ).sort()
    };

    const response = NextResponse.json(envDebug, { status: 200 });

    // Add cache prevention headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Surrogate-Control', 'no-store');

    return response;

  } catch (error: any) {
    console.error('[DEBUG] Environment debug error:', error);

    const errorResponse = NextResponse.json({
      error: error?.message || 'Debug failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });

    // Add cache prevention headers to error response too
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    errorResponse.headers.set('Pragma', 'no-cache');
    errorResponse.headers.set('Expires', '0');
    errorResponse.headers.set('Surrogate-Control', 'no-store');

    return errorResponse;
  }
}