# Lambda Deployment Checklist for Node.js Functions

## Pre-Deployment Checklist

### 1. Package Preparation
- [ ] Verify `package.json` has all required dependencies
- [ ] Run `npm install --production` to install dependencies
- [ ] Verify `node_modules` directory exists and contains all packages
- [ ] Check for any dependency security vulnerabilities

### 2. Package Verification
```bash
# List all files in the package
ls -la

# Verify critical modules exist
ls -la node_modules/ | grep -E "pg|aws-sdk"

# Check package size (should be reasonable)
du -sh node_modules/
```

### 3. Create Deployment Package
```bash
# Create ZIP file excluding unnecessary files
zip -r function-name.zip . \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "test/*" \
  -x "*.md" \
  -x ".env*"

# Verify ZIP contents
unzip -l function-name.zip | head -20
```

### 4. Size Validation
- [ ] Uncompressed package < 250 MB
- [ ] Compressed package < 50 MB
- [ ] If larger, consider using Lambda Layers

## Deployment Commands

### Deploy New Function Code
```bash
aws lambda update-function-code \
  --function-name YOUR_FUNCTION_NAME \
  --zip-file fileb://function-name.zip \
  --region ap-southeast-1
```

### Verify Deployment
```bash
# Check function status
aws lambda get-function \
  --function-name YOUR_FUNCTION_NAME \
  --query 'Configuration.[LastUpdateStatus, CodeSize, LastModified]' \
  --output table

# Wait for deployment to complete
while true; do
  STATUS=$(aws lambda get-function \
    --function-name YOUR_FUNCTION_NAME \
    --query 'Configuration.LastUpdateStatus' \
    --output text)
  echo "Status: $STATUS"
  [[ "$STATUS" == "Successful" ]] && break
  sleep 2
done
```

## Post-Deployment Testing

### 1. Create Test Event
```bash
cat > test-event.json << 'EOF'
{
  "test": "data"
}
EOF
```

### 2. Invoke Function
```bash
aws lambda invoke \
  --function-name YOUR_FUNCTION_NAME \
  --payload file://test-event.json \
  --cli-binary-format raw-in-base64-out \
  response.json

# Check response
cat response.json | jq '.'
```

### 3. Check CloudWatch Logs
```bash
# Tail recent logs
aws logs tail /aws/lambda/YOUR_FUNCTION_NAME \
  --since 5m \
  --format short

# Check for errors
aws logs tail /aws/lambda/YOUR_FUNCTION_NAME \
  --since 1h \
  --format short \
  --filter-pattern "ERROR"

# Check for specific module errors
aws logs tail /aws/lambda/YOUR_FUNCTION_NAME \
  --since 1h \
  --format short \
  --filter-pattern "Cannot find module"
```

## Common Issues and Solutions

### Issue 1: "Cannot find module 'MODULE_NAME'"
**Cause**: Missing dependency in deployment package

**Solution**:
```bash
# Ensure package.json has the dependency
npm install MODULE_NAME --save

# Reinstall all dependencies
rm -rf node_modules
npm install --production

# Rebuild deployment package
zip -r function-fixed.zip .
```

### Issue 2: Package Size Too Large
**Cause**: Including dev dependencies or large files

**Solution**:
```bash
# Use production dependencies only
npm install --production

# Exclude unnecessary files
zip -r function.zip . \
  -x "node_modules/.cache/*" \
  -x "test/*" \
  -x "*.md"

# Or use Lambda Layers for shared dependencies
```

### Issue 3: Function Timeout
**Cause**: Database connection issues or slow operations

**Solution**:
```bash
# Increase timeout
aws lambda update-function-configuration \
  --function-name YOUR_FUNCTION_NAME \
  --timeout 300

# Increase memory (improves CPU performance)
aws lambda update-function-configuration \
  --function-name YOUR_FUNCTION_NAME \
  --memory-size 512
```

## Lambda Layers for Shared Dependencies

### Create a Lambda Layer
```bash
# Create layer structure
mkdir -p nodejs/node_modules
cd nodejs

# Install dependencies
npm install pg@^8.11.3 --production
npm install aws-sdk --production

# Create layer package
cd ..
zip -r pg-layer.zip nodejs/

# Publish layer
aws lambda publish-layer-version \
  --layer-name pg-postgresql-client \
  --description "PostgreSQL client (pg) for Node.js Lambda functions" \
  --zip-file fileb://pg-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x
```

### Attach Layer to Function
```bash
aws lambda update-function-configuration \
  --function-name YOUR_FUNCTION_NAME \
  --layers arn:aws:lambda:ap-southeast-1:ACCOUNT_ID:layer:pg-postgresql-client:1
```

## Environment Variables

### View Current Variables
```bash
aws lambda get-function-configuration \
  --function-name YOUR_FUNCTION_NAME \
  --query 'Environment.Variables' \
  --output json
```

### Update Variables
```bash
aws lambda update-function-configuration \
  --function-name YOUR_FUNCTION_NAME \
  --environment "Variables={
    DATABASE_URL=postgresql://user:pass@host/db,
    DEFAULT_REGION=ap-southeast-1,
    NODE_ENV=production
  }"
```

## Monitoring and Debugging

### CloudWatch Metrics
```bash
# Get invocation count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=YOUR_FUNCTION_NAME \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum

# Get error count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=YOUR_FUNCTION_NAME \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

### Log Insights Queries
```bash
# Query recent errors
aws logs start-query \
  --log-group-name /aws/lambda/YOUR_FUNCTION_NAME \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20'
```

## Rollback Procedure

### List Function Versions
```bash
aws lambda list-versions-by-function \
  --function-name YOUR_FUNCTION_NAME \
  --output table
```

### Rollback to Previous Version
```bash
# Get previous version code
aws lambda get-function \
  --function-name YOUR_FUNCTION_NAME:VERSION_NUMBER \
  --query 'Code.Location' \
  --output text

# Download and redeploy
curl -o previous-version.zip "PRESIGNED_URL"

aws lambda update-function-code \
  --function-name YOUR_FUNCTION_NAME \
  --zip-file fileb://previous-version.zip
```

## Best Practices

1. **Always test locally first** using `sam local invoke` or similar tools
2. **Use environment variables** for configuration (never hardcode credentials)
3. **Implement proper error handling** and logging in your Lambda code
4. **Monitor CloudWatch Logs** for the first few invocations after deployment
5. **Tag your Lambda functions** for cost tracking and organization
6. **Use Lambda Layers** for shared dependencies across multiple functions
7. **Keep deployment packages small** to improve cold start times
8. **Version your Lambda functions** for easy rollback
9. **Set appropriate memory and timeout** based on function requirements
10. **Enable X-Ray tracing** for production functions

## Step Functions Integration

### Test Lambda with Step Functions
```bash
# Start execution
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:REGION:ACCOUNT:stateMachine:NAME" \
  --input file://test-input.json

# Check execution logs
aws logs tail /aws/vendedlogs/states/STATE_MACHINE_NAME-Logs \
  --since 10m \
  --format short
```

---

**Reference Document**
**Created**: October 10, 2025
**AWS Region**: ap-southeast-1
**For**: Node.js Lambda Functions with Database Dependencies
