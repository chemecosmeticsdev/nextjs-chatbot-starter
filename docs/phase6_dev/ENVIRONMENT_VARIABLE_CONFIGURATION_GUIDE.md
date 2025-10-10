# Environment Variable Configuration Guide
## AWS Amplify + Next.js Deployment

**Last Updated:** 2025-10-10
**Application:** Next.js Chatbot with Step Functions Integration
**Deployment Platform:** AWS Amplify

---

## Overview

This guide documents the complete environment variable configuration for the Next.js application deployed on AWS Amplify. It includes both the AWS Amplify Console configuration and the Next.js `next.config.js` mapping required for proper runtime access.

---

## Critical Configuration Pattern

### AWS Amplify + Next.js Environment Variable Access

AWS Amplify injects environment variables at **build time**, but Next.js API routes require **explicit runtime mapping** via the `env` block in `next.config.js`.

```javascript
// next.config.js - Required for runtime access
module.exports = {
  env: {
    // Server-side variables (mapped explicitly)
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    BAWS_ACCESS_KEY_ID: process.env.BAWS_ACCESS_KEY_ID,
    // ... other server variables
  },
  // NEXT_PUBLIC_ variables are handled automatically by Next.js/Amplify
}
```

**Without this mapping**: Server-side API routes cannot access environment variables despite proper Amplify configuration.

---

## Environment Variables Configuration

### AWS Amplify Console Variables

Configure these variables in **AWS Amplify Console → App Settings → Environment Variables**:

#### 🔴 **Required Variables (Critical)**

```bash
# Database Configuration
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require

# Authentication
JWT_SECRET=[REDACTED]

# AWS Credentials (BAWS prefix required for Amplify)
BAWS_ACCESS_KEY_ID=AKIA...
BAWS_SECRET_ACCESS_KEY=...

# AWS Configuration
DEFAULT_REGION=ap-southeast-1
BEDROCK_REGION=us-east-1
ACCOUNT_ID=761526718835

# S3 Buckets
STEPFUNCTIONS_S3_BUCKET=stepfunctions-document-processing
S3_DOCUMENT_BUCKET=chatbot-documents-d8z7xlyl8bjeg

# Client-side Configuration
NEXT_PUBLIC_APP_URL=https://master.d8z7xlyl8bjeg.amplifyapp.com
```

#### 🟡 **Recommended Variables (Important)**

```bash
# Step Functions
STEPFUNCTIONS_STATE_MACHINE_ARN=arn:aws:states:ap-southeast-1:761526718835:stateMachine:DocumentProcessingPipeline

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=wss://your-websocket-endpoint
```

#### 🟢 **Optional Variables (Feature-Specific)**

```bash
# SQS Queues (for task processing)
SQS_CRITICAL_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/761526718835/critical-queue
SQS_HIGH_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/761526718835/high-queue
SQS_NORMAL_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/761526718835/normal-queue
SQS_LOW_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/761526718835/low-queue

# Cognito (if using AWS Cognito)
COGNITO_USER_POOL_ID=ap-southeast-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=ap-southeast-1

# External APIs
MISTRAL_API_KEY=your-mistral-api-key
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxx
```

### Next.js Runtime Mapping

Add this `env` block to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... other config

  // Selective env block to expose server-side variables to Next.js runtime
  // AWS Amplify injects variables at build time, but Next.js needs explicit mapping for runtime access
  // NEXT_PUBLIC_ variables are handled automatically by Next.js/Amplify
  env: {
    // Database connection
    DATABASE_URL: process.env.DATABASE_URL,

    // Authentication
    JWT_SECRET: process.env.JWT_SECRET,

    // AWS credentials and configuration
    BAWS_ACCESS_KEY_ID: process.env.BAWS_ACCESS_KEY_ID,
    BAWS_SECRET_ACCESS_KEY: process.env.BAWS_SECRET_ACCESS_KEY,
    DEFAULT_REGION: process.env.DEFAULT_REGION,
    BEDROCK_REGION: process.env.BEDROCK_REGION,

    // AWS account and bucket configuration
    AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID || process.env.ACCOUNT_ID, // Fallback to ACCOUNT_ID
    STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET,
    S3_DOCUMENT_BUCKET: process.env.S3_DOCUMENT_BUCKET,

    // Step Functions ARN
    STEPFUNCTIONS_STATE_MACHINE_ARN: process.env.STEPFUNCTIONS_STATE_MACHINE_ARN,
  },
}

module.exports = nextConfig
```

---

## Variable Categories and Usage

### Database Variables
- **`DATABASE_URL`**: PostgreSQL connection string for Neon database
- **Usage**: Database connections, Drizzle ORM configuration
- **Format**: `postgresql://user:pass@host:5432/dbname?sslmode=require`

### Authentication Variables
- **`JWT_SECRET`**: Secret key for JWT token signing and verification
- **Usage**: Authentication middleware, session management
- **Security**: Must be cryptographically secure, minimum 32 characters

### AWS Credentials
- **`BAWS_ACCESS_KEY_ID`**: AWS Access Key (BAWS prefix required for Amplify)
- **`BAWS_SECRET_ACCESS_KEY`**: AWS Secret Key (BAWS prefix required for Amplify)
- **Usage**: AWS SDK authentication for Step Functions, S3, Bedrock
- **Security**: Never expose in client-side code or logs

### AWS Service Configuration
- **`DEFAULT_REGION`**: Primary AWS region (ap-southeast-1)
- **`BEDROCK_REGION`**: AWS Bedrock region (us-east-1) - required for Bedrock models
- **`ACCOUNT_ID`**: AWS Account ID for ARN construction

### Client-Side Variables
- **`NEXT_PUBLIC_APP_URL`**: Base URL for the application
- **`NEXT_PUBLIC_WS_URL`**: WebSocket endpoint for real-time features
- **Usage**: Client-side API calls, WebSocket connections
- **Note**: Automatically exposed to browser, don't include secrets

---

## Deployment Process

### 1. Add Variables to Amplify Console

1. Navigate to **AWS Amplify Console**
2. Select your application
3. Go to **App Settings → Environment Variables**
4. Add all required variables for your branch (usually `master`)
5. Save changes

### 2. Update next.config.js

1. Add the `env` block mapping to `next.config.js`
2. Map all server-side variables that API routes need to access
3. Do NOT map `NEXT_PUBLIC_` variables (handled automatically)

### 3. Commit and Deploy

1. Commit changes to your repository
2. Push to the configured branch (triggers Amplify build)
3. Monitor deployment in Amplify Console
4. Verify configuration using health check endpoints

---

## Verification and Testing

### Health Check Endpoint

Test configuration using the health check API:

```bash
# Basic health check
curl https://your-app.amplifyapp.com/api/health

# Detailed configuration check
curl https://your-app.amplifyapp.com/api/health?detailed=true

# Development-only secrets check (only works in development)
curl https://your-app.amplifyapp.com/api/health?detailed=true&secrets=true
```

### Expected Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-10-10T06:00:00.000Z",
  "results": [
    {
      "service": "api",
      "status": "healthy",
      "details": "API service is running",
      "required": true
    },
    {
      "service": "database",
      "status": "healthy",
      "details": "Database connection successful",
      "required": true
    },
    {
      "service": "configuration",
      "status": "healthy",
      "details": "All required configuration present",
      "required": true
    }
  ]
}
```

### Authentication Endpoint Test

```bash
# Should return 401 (not 500) when properly configured
curl -i https://your-app.amplifyapp.com/api/v1/auth/me

# Expected response:
# HTTP/2 401
# {"error":"No session found","code":"NO_SESSION"}
```

---

## Common Issues and Solutions

### Issue 1: Variables Not Accessible in API Routes

**Symptoms**:
- Health check shows missing required configuration
- API routes throw "undefined" errors for environment variables

**Solution**:
- Verify variables are added to Amplify Console
- Ensure `env` block is present in `next.config.js`
- Redeploy application after adding env block

### Issue 2: Client-Side Variables Not Loading

**Symptoms**:
- `NEXT_PUBLIC_` variables show as undefined in browser
- Client-side API calls fail due to missing base URL

**Solution**:
- Remove `NEXT_PUBLIC_` variables from `env` block
- Ensure they're added to Amplify Console
- Let Next.js handle them automatically

### Issue 3: AWS Credentials Invalid

**Symptoms**:
- Step Functions or S3 operations fail with authentication errors
- AWS SDK throws credential errors

**Solution**:
- Verify `BAWS_ACCESS_KEY_ID` and `BAWS_SECRET_ACCESS_KEY` are correct
- Ensure credentials have appropriate permissions
- Check AWS region configuration

---

## Security Best Practices

### 1. Secret Management
- Use cryptographically secure values for `JWT_SECRET`
- Rotate secrets regularly
- Never commit secrets to version control

### 2. Variable Separation
- Keep server-side secrets out of `NEXT_PUBLIC_` variables
- Use the `env` block only for server-side variables
- Minimize exposed configuration in health checks

### 3. Permission Management
- Use least-privilege principle for AWS credentials
- Regularly audit environment variable access
- Monitor for unauthorized variable changes

---

## Troubleshooting Commands

### Check Amplify Deployment Status
```bash
aws amplify get-job --app-id d8z7xlyl8bjeg --branch-name master --job-id LATEST
```

### List Environment Variables
```bash
aws amplify get-branch --app-id d8z7xlyl8bjeg --branch-name master
```

### Test Database Connection
```bash
curl https://your-app.amplifyapp.com/api/health/database
```

### Test Step Functions Configuration
```bash
curl https://your-app.amplifyapp.com/api/step-functions/start
```

---

## Changelog

### 2025-10-10 - v2.0 (Current)
- ✅ Added selective `env` block for server-side variable access
- ✅ Added missing required variables to Amplify Console
- ✅ Fixed authentication endpoint 500 errors
- ✅ Resolved database health check issues

### Previous - v1.0 (Broken)
- ❌ No `env` block - server variables inaccessible
- ❌ Missing critical variables in Amplify Console
- ❌ Authentication endpoints failing with 500 errors

---

*This configuration guide is based on the successful resolution of authentication endpoint failures in the Next.js chatbot application. For questions or issues, refer to the full investigation report.*