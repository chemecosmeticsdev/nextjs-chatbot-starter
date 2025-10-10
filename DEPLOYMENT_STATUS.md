# Step Functions Debugging - Deployment Status

**Date**: 2025-10-10 06:33 UTC
**Commit**: 1360f5d (debug: add comprehensive logging to Step Functions input construction)
**Deployment Job**: #84 (SUCCEEDED)
**Application**: https://master.d8z7xlyl8bjeg.amplifyapp.com

---

## Current Status: ✅ DEPLOYED - READY FOR TESTING

AWS Amplify deployment successful. Debug logging is now active in production.
**Ready to coordinate testing to capture Step Functions input diagnostics.**

---

## Debugging Changes Deployed

### Problem Being Diagnosed
Step Functions execution receives empty input `{}` instead of properly constructed object with:
- documentId, fileName, fileKey, fileSize, mimeType
- s3Bucket, uploadedBy, documentType, metadata
- Processing configuration

### Debug Logging Added (Lines 117-145 in start/route.ts)

#### 1. Environment Variables Check
```typescript
console.log('Environment variables check:', {
  DEFAULT_REGION: process.env.DEFAULT_REGION,
  ACCOUNT_ID: process.env.ACCOUNT_ID,
  AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID,
  STEPFUNCTIONS_STATE_MACHINE_ARN: process.env.STEPFUNCTIONS_STATE_MACHINE_ARN,
  STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET
});
```
**Purpose**: Verify all environment variables are properly set in production

#### 2. Step Functions Input Object
```typescript
console.log('Step Functions Input Object:', JSON.stringify(stepFunctionsInput, null, 2));
```
**Purpose**: Show complete input object BEFORE JSON.stringify

#### 3. Execution Parameters
```typescript
console.log('Step Functions Execution Params:', {
  stateMachineArn,
  name: executionParams.name,
  inputLength: executionParams.input.length,
  inputPreview: executionParams.input.substring(0, 200) + '...'
});
```
**Purpose**: Verify input is properly stringified and has content

#### 4. ACCOUNT_ID Fallback Fix
```typescript
const stateMachineArn = process.env.STEPFUNCTIONS_STATE_MACHINE_ARN ||
  `arn:aws:states:${process.env.DEFAULT_REGION}:${process.env.ACCOUNT_ID || process.env.AWS_ACCOUNT_ID}:stateMachine:DocumentProcessingPipeline`;
```
**Purpose**: Properly fallback to AWS_ACCOUNT_ID if ACCOUNT_ID is not set

---

## Deployment Verification

### Build Status: ✅ SUCCEEDED
```
Job #84: SUCCEED
Duration: ~6 minutes
Steps: BUILD ✅ | DEPLOY ✅ | VERIFY ✅
Completed: 2025-10-10 06:31:09 UTC
```

### Application Health: ✅ HEALTHY
```bash
curl -s https://master.d8z7xlyl8bjeg.amplifyapp.com/api/health | jq
# Output: {"status":"healthy","timestamp":"2025-10-10T06:33:04.611Z"}
```

### Debug Code Confirmed
- ✅ Environment variables logging (lines 117-124)
- ✅ Step Functions input logging (lines 126-127)
- ✅ Execution parameters logging (lines 139-145)
- ✅ ACCOUNT_ID fallback fix (line 131)

---

## Testing Plan - READY TO EXECUTE

### Overview
Execute a test file upload with `autoStart=true` to trigger Step Functions and capture debug logs showing why the execution receives empty input.

### Prerequisites
Before testing, verify CloudWatch Logs access or monitor through AWS Console.

---

### Test Procedure

#### Step 1: Prepare Test File
```bash
# Create a simple test document
echo "Test INCI ingredient document for debugging" > /tmp/test-debug.txt
```

#### Step 2: Execute Upload with Auto-Start
```bash
# Upload file and automatically trigger Step Functions
curl -X POST https://master.d8z7xlyl8bjeg.amplifyapp.com/api/step-functions/upload \
  -F "file=@/tmp/test-debug.txt" \
  -F "autoStart=true" \
  -F "uploadedBy=debug-session" \
  -F "documentType=inci" \
  -F "documentCategory=ingredient" \
  -F 'metadata={"test":"step-functions-debug","session":"2025-10-10"}' \
  -v | jq '.'
```

#### Step 3: Capture Response Details
**Save these values from the response:**
- `execution.executionArn` - for checking execution status
- `execution.executionId` - for correlation with logs
- `execution.documentId` - for database tracking
- `file.fileKey` - S3 object key

#### Example Expected Response:
```json
{
  "success": true,
  "file": {
    "id": "<uuid>",
    "fileName": "test-debug.txt",
    "fileKey": "uploads/2025/10/<uuid>-test-debug.txt",
    "fileSize": 46,
    "mimeType": "text/plain",
    "uploadedBy": "debug-session",
    "documentType": "inci",
    "documentCategory": "ingredient"
  },
  "execution": {
    "executionId": "<uuid>",
    "documentId": "<uuid>",
    "executionArn": "arn:aws:states:ap-southeast-1:...",
    "status": "RUNNING",
    "stepFunctionsInput": { ... }
  }
}
```

---

### Step 4: Check Step Functions Execution
```bash
# Replace with actual execution ARN from response
EXECUTION_ARN="<paste-execution-arn-here>"

# Check execution status and input
aws stepfunctions describe-execution \
  --execution-arn "$EXECUTION_ARN" \
  --region ap-southeast-1 \
  --output json | jq '{
    status: .status,
    input: (.input | fromjson),
    startDate: .startDate,
    name: .name
  }'
```

**Critical Question**: Does the `input` field show:
- ✅ Full object with documentId, fileName, fileKey, etc.
- ❌ Empty object `{}`

---

### Step 5: Analyze Debug Logs

#### Option A: CloudWatch Logs Console
1. Navigate to: https://ap-southeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-1#logsV2:log-groups
2. Find log group: `/aws/amplify/d8z7xlyl8bjeg/master`
3. Search for recent logs containing: "Environment variables check"

#### Option B: AWS CLI (if log group exists)
```bash
# List available log streams
aws logs describe-log-streams \
  --log-group-name "/aws/amplify/d8z7xlyl8bjeg/master" \
  --region ap-southeast-1 \
  --order-by LastEventTime \
  --descending \
  --max-items 5

# Tail recent logs
aws logs tail "/aws/amplify/d8z7xlyl8bjeg/master" \
  --follow \
  --region ap-southeast-1 \
  --format short \
  --filter-pattern "Environment variables check"
```

---

### Debug Log Analysis Checklist

When you see the debug logs, verify:

#### 1. Environment Variables (from log line 118-124)
```
Environment variables check: {
  DEFAULT_REGION: ?
  ACCOUNT_ID: ?
  AWS_ACCOUNT_ID: ?
  STEPFUNCTIONS_STATE_MACHINE_ARN: ?
  STEPFUNCTIONS_S3_BUCKET: ?
}
```
- [ ] DEFAULT_REGION = "ap-southeast-1"
- [ ] ACCOUNT_ID or AWS_ACCOUNT_ID is set
- [ ] STEPFUNCTIONS_STATE_MACHINE_ARN is set or will be constructed
- [ ] STEPFUNCTIONS_S3_BUCKET = "stepfunctions-document-processing"

#### 2. Step Functions Input Object (from log line 127)
```json
Step Functions Input Object: {
  "executionId": "<uuid>",
  "documentId": "<uuid>",
  "fileName": "test-debug.txt",
  "fileKey": "uploads/...",
  "s3Key": "uploads/...",
  "fileSize": 46,
  "mimeType": "text/plain",
  "s3Bucket": "stepfunctions-document-processing",
  ...
}
```
- [ ] All fields are populated
- [ ] Object is not empty
- [ ] Values match the upload request

#### 3. Execution Parameters (from log line 140-144)
```
Step Functions Execution Params: {
  stateMachineArn: "arn:aws:states:...",
  name: "DocumentProcessing-<uuid>",
  inputLength: <number>,
  inputPreview: "{"executionId":"..."..."
}
```
- [ ] inputLength > 0 (should be 300-500 characters)
- [ ] inputPreview shows actual JSON content (not empty)
- [ ] stateMachineArn is properly formatted

---

### Diagnostic Decision Tree

#### If inputLength = 0 or inputPreview is empty
**Problem**: Input is being cleared/lost during JSON.stringify
**Next Steps**:
1. Check if stepFunctionsInput object is properly constructed
2. Verify no middleware is stripping the input
3. Check for serialization issues

#### If input shows in logs but Step Functions receives `{}`
**Problem**: Issue is between API call and Step Functions service
**Next Steps**:
1. Check IAM permissions for StartExecution
2. Verify API parameter passing
3. Check for AWS SDK version issues

#### If environment variables are missing
**Problem**: Amplify environment variables not propagated
**Next Steps**:
1. Verify Amplify Console environment variable configuration
2. Check next.config.js env block
3. Trigger rebuild if needed

---

### Test 2: Direct Start Endpoint (Alternative)
If autoStart fails, test the start endpoint directly:

```bash
# Upload file first
FILE_RESPONSE=$(curl -s -X POST https://master.d8z7xlyl8bjeg.amplifyapp.com/api/step-functions/upload \
  -F "file=@/tmp/test-debug.txt" \
  -F "uploadedBy=debug-direct")

# Extract file details
FILE_KEY=$(echo $FILE_RESPONSE | jq -r '.file.fileKey')
FILE_NAME=$(echo $FILE_RESPONSE | jq -r '.file.fileName')
FILE_SIZE=$(echo $FILE_RESPONSE | jq -r '.file.fileSize')
MIME_TYPE=$(echo $FILE_RESPONSE | jq -r '.file.mimeType')

# Call start endpoint directly
curl -X POST https://master.d8z7xlyl8bjeg.amplifyapp.com/api/step-functions/start \
  -H "Content-Type: application/json" \
  -d "{
    \"fileName\": \"$FILE_NAME\",
    \"fileKey\": \"$FILE_KEY\",
    \"fileSize\": $FILE_SIZE,
    \"mimeType\": \"$MIME_TYPE\",
    \"uploadedBy\": \"debug-direct\",
    \"documentType\": \"inci\",
    \"documentCategory\": \"ingredient\",
    \"metadata\": {\"test\":\"direct-start\"}
  }" | jq '.'
```

---

### Test 3: Step Functions Configuration Check
```bash
# Check if Step Functions is properly configured
curl -s https://master.d8z7xlyl8bjeg.amplifyapp.com/api/step-functions/start | jq
```

**Expected Output**:
```json
{
  "success": true,
  "user": {
    "id": "...",
    "email": "chemecosmetics.dev@gmail.com",
    "full_name": "...",
    "role": "admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**✅ SUCCESS CRITERIA**:
- `success: true`
- Valid JWT token returned
- User object contains correct email

**❌ FAILURE INDICATORS**:
- `error: "Auth UserPool not configured"`
- `success: false`
- Missing token in response

---

### Test 3: Session Verification ✅
```bash
# Extract token from Test 2 response
TOKEN="<paste-token-here>"

curl -s https://master.d8z7xlyl8bjeg.amplifyapp.com/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Expected Output**:
```json
{
  "success": true,
  "user": {
    "id": "...",
    "email": "chemecosmetics.dev@gmail.com",
    "full_name": "...",
    "role": "admin",
    "is_active": true
  }
}
```

**✅ SUCCESS CRITERIA**:
- `success: true`
- User data matches login response
- `is_active: true`

---

### Test 4: Browser Login Flow ✅

1. **Open Application**:
   ```
   https://master.d8z7xlyl8bjeg.amplifyapp.com/login
   ```

2. **Enter Credentials**:
   - Email: `chemecosmetics.dev@gmail.com`
   - Password: `SuperAdmin123!`

3. **Click Login**

4. **Verify Redirect**:
   - Should redirect to dashboard
   - No error messages
   - User menu shows email

5. **Check Browser Console**:
   - Open DevTools (F12)
   - Look for: `"Cognito authentication configured successfully"`
   - No error messages about missing environment variables

**✅ SUCCESS CRITERIA**:
- Successful login
- Dashboard loads
- No console errors
- Session cookie set

---

## Troubleshooting

### If Health Check Still Shows Degraded

**Problem**: Environment variables still missing after deployment

**Solution**:
1. Verify Amplify environment variables:
   ```bash
   aws amplify get-branch \
     --app-id d8z7xlyl8bjeg \
     --branch-name master \
     --region ap-southeast-1 \
     --query 'branch.environmentVariables' \
     --output json | grep COGNITO
   ```

2. Check if variables are set:
   - Should show: `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION`
   - If missing, add them back through Amplify Console

3. Trigger rebuild:
   ```bash
   aws amplify start-job \
     --app-id d8z7xlyl8bjeg \
     --branch-name master \
     --job-type RELEASE \
     --region ap-southeast-1
   ```

---

### If Login Endpoint Returns 500 Error

**Problem**: Server-side error during authentication

**Solution**:
1. Check application logs in Amplify Console
2. Look for specific error messages
3. Verify Cognito User Pool is accessible:
   ```bash
   aws cognito-idp describe-user-pool \
     --user-pool-id ap-southeast-1_hLrZl0hn0 \
     --region ap-southeast-1
   ```

---

### If Login Returns "Invalid Credentials"

**Problem**: User password may need reset

**Solution**:
1. Reset password via AWS CLI:
   ```bash
   aws cognito-idp admin-reset-user-password \
     --user-pool-id ap-southeast-1_hLrZl0hn0 \
     --username chemecosmetics.dev@gmail.com \
     --region ap-southeast-1
   ```

2. Set new password:
   ```bash
   aws cognito-idp admin-set-user-password \
     --user-pool-id ap-southeast-1_hLrZl0hn0 \
     --username chemecosmetics.dev@gmail.com \
     --password "NewSecurePassword123!" \
     --permanent \
     --region ap-southeast-1
   ```

---

## Rollback Plan

### If Deployment Fails or Causes Issues

#### Option 1: Git Revert
```bash
git revert 63bf4b9803abe31d76fb80e6cc46785d33be8bde
git push origin master
```

#### Option 2: Amplify Console Rollback
1. Navigate to: [Amplify Console](https://ap-southeast-1.console.aws.amazon.com/amplify/home?region=ap-southeast-1#/d8z7xlyl8bjeg)
2. Go to: App → master → Deployments
3. Find Job #82 (previous successful deployment)
4. Click "Redeploy this version"

#### Option 3: Manual Environment Variable Fix
If only environment variables are the issue:
1. Go to Amplify Console → Environment variables
2. Verify these are set:
   - `COGNITO_USER_POOL_ID=ap-southeast-1_hLrZl0hn0`
   - `COGNITO_CLIENT_ID=7p0uanoj10cg99u2qjpe1np74q`
   - `COGNITO_REGION=ap-southeast-1`
3. Redeploy

---

## Success Checklist

After deployment completes, verify:

- [ ] Deployment status shows `SUCCEED`
- [ ] Health check returns `status: "healthy"`
- [ ] Health check shows no missing Cognito variables
- [ ] Login endpoint accepts credentials
- [ ] Login endpoint returns valid JWT token
- [ ] Session verification works with token
- [ ] Browser login flow works end-to-end
- [ ] Dashboard loads after login
- [ ] No console errors about Cognito
- [ ] User session persists across page refreshes

---

## Timeline

| Time | Event | Status |
|------|-------|--------|
| 06:11 UTC | Commit pushed to GitHub | ✅ Done |
| 06:11 UTC | Amplify build triggered (Job #83) | 🟡 Running |
| ~06:17 UTC | Build expected to complete | ⏳ Pending |
| ~06:18 UTC | Health check verification | ⏳ Pending |
| ~06:20 UTC | Login endpoint testing | ⏳ Pending |
| ~06:25 UTC | Full functionality verification | ⏳ Pending |

**Estimated Total Time**: 10-15 minutes from commit

---

## Next Steps After Successful Deployment

### Immediate (Today)
1. ✅ Verify all tests pass
2. ⏳ Test with multiple users
3. ⏳ Monitor error logs for 24 hours
4. ⏳ Document authentication flow for team

### Short-term (This Week)
1. ⏳ Add integration tests for authentication
2. ⏳ Set up CloudWatch alarms for login failures
3. ⏳ Enable MFA for admin accounts
4. ⏳ Implement password reset workflow

### Medium-term (This Month)
1. ⏳ Add email verification for new users
2. ⏳ Implement social login (Google, GitHub)
3. ⏳ Set up user activity monitoring
4. ⏳ Create authentication documentation

---

## Quick Reference Commands

### Deployment Monitoring
```bash
# Check latest deployment status
aws amplify list-jobs \
  --app-id d8z7xlyl8bjeg \
  --branch-name master \
  --region ap-southeast-1 \
  --max-results 3 \
  --output table

# Get specific job details
aws amplify get-job \
  --app-id d8z7xlyl8bjeg \
  --branch-name master \
  --job-id 84 \
  --region ap-southeast-1
```

### Step Functions Operations
```bash
# List state machines
aws stepfunctions list-state-machines \
  --region ap-southeast-1 \
  --output table

# Check specific execution
aws stepfunctions describe-execution \
  --execution-arn "<arn>" \
  --region ap-southeast-1 \
  --output json | jq '{status, input: (.input|fromjson)}'

# List recent executions
aws stepfunctions list-executions \
  --state-machine-arn "arn:aws:states:ap-southeast-1:<account>:stateMachine:DocumentProcessingPipeline" \
  --region ap-southeast-1 \
  --max-results 10
```

### S3 Operations
```bash
# List uploaded files
aws s3 ls s3://stepfunctions-document-processing/uploads/ \
  --recursive \
  --human-readable \
  --summarize

# Check specific file
aws s3api head-object \
  --bucket stepfunctions-document-processing \
  --key "uploads/2025/10/<file-key>"
```

---

## Summary & Next Steps

### Current Status: ✅ DEPLOYMENT SUCCESSFUL
- **Job #84**: Completed successfully at 06:31 UTC
- **Application**: Healthy and responding
- **Debug Code**: Confirmed deployed and active
- **Ready**: For coordinated testing phase

### What We're Testing
Diagnosing why Step Functions execution receives empty input `{}` instead of the properly constructed object with all document metadata.

### Next Action: Execute Testing
Run the test upload command from the Testing Plan above and analyze:
1. **Response JSON** - Verify execution starts successfully
2. **Debug Logs** - Check environment variables and input object construction
3. **Step Functions** - Verify execution receives proper input
4. **Diagnosis** - Determine root cause of empty input issue

### Files Modified
- `/workspaces/codespaces-blank/chatbot_v1/app/api/step-functions/start/route.ts`
  - Added comprehensive debug logging (lines 117-145)
  - Fixed ACCOUNT_ID fallback logic (line 131)

### Resources
- **Application URL**: https://master.d8z7xlyl8bjeg.amplifyapp.com
- **Amplify Console**: https://ap-southeast-1.console.aws.amazon.com/amplify/home?region=ap-southeast-1#/d8z7xlyl8bjeg
- **CloudWatch Logs**: https://ap-southeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-1#logsV2:log-groups
- **Step Functions Console**: https://ap-southeast-1.console.aws.amazon.com/states/home?region=ap-southeast-1

---

**Status**: ✅ READY FOR TESTING
**Updated**: 2025-10-10 06:33 UTC
**Deployment**: Job #84 (SUCCEEDED)
**Commit**: 1360f5d

---

## How to Use This Document

1. **Review "Debugging Changes Deployed"** - Understand what debug logging is active
2. **Execute "Testing Plan"** - Run Step 1-3 to trigger the upload and execution
3. **Analyze "Debug Logs"** - Use the checklists to verify each component
4. **Follow "Diagnostic Decision Tree"** - Determine root cause based on findings
5. **Report Results** - Share findings to determine next fix iteration
