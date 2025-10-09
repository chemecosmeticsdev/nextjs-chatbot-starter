import { NextResponse } from 'next/server';

export async function GET() {
  // Only show this in development or with a debug flag
  if (process.env.NODE_ENV === 'production' && !process.env.DEBUG_ENV) {
    return NextResponse.json({ error: 'Debug endpoint disabled in production' }, { status: 403 });
  }

  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
    BAWS_ACCESS_KEY_ID: process.env.BAWS_ACCESS_KEY_ID ? 'SET' : 'NOT_SET',
    BAWS_SECRET_ACCESS_KEY: process.env.BAWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT_SET',
    DEFAULT_REGION: process.env.DEFAULT_REGION || 'NOT_SET',
    BEDROCK_REGION: process.env.BEDROCK_REGION || 'NOT_SET',
    STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET || 'NOT_SET',
    ACCOUNT_ID: process.env.ACCOUNT_ID || 'NOT_SET',
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY ? 'SET' : 'NOT_SET',
    // Add timestamp for cache busting
    timestamp: new Date().toISOString(),
    buildId: process.env.BUILD_ID || 'NOT_SET'
  };

  return NextResponse.json(envVars);
}
