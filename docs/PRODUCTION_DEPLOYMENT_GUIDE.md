# Production Deployment Guide

This guide provides comprehensive steps for deploying the chatbot application to production and resolving common configuration issues that can cause client-side exceptions.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Deployment Checklist](#deployment-checklist)
- [Health Check Monitoring](#health-check-monitoring)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Error Resolution Steps](#error-resolution-steps)
- [Preventive Measures](#preventive-measures)

## Prerequisites

### Required AWS Resources
- [ ] AWS Account with appropriate permissions
- [ ] IAM User with programmatic access
- [ ] S3 buckets for document storage
- [ ] Step Functions state machine deployed
- [ ] Lambda functions deployed
- [ ] SQS queues configured
- [ ] Cognito user pool (optional)

### Required External Services
- [ ] Neon PostgreSQL database
- [ ] GitHub repository configured
- [ ] AWS Amplify project configured
- [ ] Domain name configured (optional)

## Environment Configuration

### Critical Environment Variables

The following environment variables are **required** for production deployment:

#### Database Configuration
```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

#### AWS Core Configuration
```bash
BAWS_ACCESS_KEY_ID=your_aws_access_key_id
BAWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
DEFAULT_REGION=ap-southeast-1
BEDROCK_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
```

#### S3 Configuration
```bash
S3_DOCUMENT_BUCKET=your-document-bucket
STEPFUNCTIONS_S3_BUCKET=your-step-functions-bucket
```

#### Application Configuration
```bash
NEXT_PUBLIC_APP_URL=https://your-domain.com
JWT_SECRET=your-secure-jwt-secret-at-least-32-characters
```

### Optional Environment Variables

#### Step Functions (Recommended)
```bash
STEPFUNCTIONS_STATE_MACHINE_ARN=arn:aws:states:region:account:stateMachine:YourStateMachine
```

#### WebSocket Configuration (Real-time Features)
```bash
NEXT_PUBLIC_WS_URL=wss://your-websocket-endpoint
```

#### External APIs
```bash
MISTRAL_API_KEY=your_mistral_api_key
GITHUB_PAT=your_github_personal_access_token
```

#### SQS Queues
```bash
SQS_CRITICAL_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name
SQS_HIGH_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name
SQS_NORMAL_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name
SQS_LOW_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name
```

#### Cognito (Optional)
```bash
COGNITO_USER_POOL_ID=region_poolid
COGNITO_CLIENT_ID=your_client_id
COGNITO_REGION=region
```

## Deployment Checklist

### Pre-Deployment
- [ ] **Environment Variables**: All required environment variables configured in Amplify
- [ ] **Database**: Neon database accessible and properly configured
- [ ] **AWS Permissions**: IAM user has necessary permissions for all services
- [ ] **S3 Buckets**: Document and Step Functions buckets created and accessible
- [ ] **Step Functions**: State machine deployed and ARN configured
- [ ] **Lambda Functions**: All Lambda functions deployed and working
- [ ] **Health Checks**: Run health checks locally to verify configuration

### Deployment Steps
1. **Configure Environment Variables**
   ```bash
   # In AWS Amplify Console or CLI
   amplify env add production
   amplify env checkout production
   # Configure all environment variables listed above
   ```

2. **Run Health Checks**
   ```bash
   curl https://your-domain.com/api/health?detailed=true
   ```

3. **Test Critical Features**
   - [ ] User authentication works
   - [ ] Database connections established
   - [ ] File upload functionality
   - [ ] Step Functions execution
   - [ ] WebSocket connections (if configured)

4. **Monitor Deployment**
   - [ ] Check AWS Amplify build logs
   - [ ] Monitor CloudWatch logs for errors
   - [ ] Verify health check endpoints return healthy status
   - [ ] Test user-facing features

### Post-Deployment
- [ ] **Smoke Tests**: Verify all critical features work end-to-end
- [ ] **Performance Tests**: Check response times and loading speeds
- [ ] **Error Monitoring**: Set up CloudWatch alarms for error rates
- [ ] **Health Monitoring**: Schedule regular health checks
- [ ] **Backup Verification**: Ensure database backups are working
- [ ] **Security Review**: Verify all credentials are properly secured

## Health Check Monitoring

### Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/api/health` | Basic system health | `{"status": "healthy"}` |
| `/api/health?detailed=true` | Configuration validation | Detailed status report |
| `/api/health/database` | Database connectivity | Database connection status |
| `/api/health/step-functions` | AWS Step Functions access | Step Functions health |

### Monitoring Setup

1. **Automated Health Checks**
   ```bash
   # Set up CloudWatch alarms
   aws cloudwatch put-metric-alarm \
     --alarm-name "API-Health-Check" \
     --alarm-description "Monitor API health endpoint" \
     --metric-name HealthCheck \
     --namespace Production/API \
     --statistic Sum \
     --period 300 \
     --threshold 1 \
     --comparison-operator LessThanThreshold
   ```

2. **Error Rate Monitoring**
   - Set up CloudWatch logs monitoring
   - Configure alerts for error rate thresholds
   - Monitor 4xx and 5xx response rates

3. **Performance Monitoring**
   - Track response times
   - Monitor memory usage
   - Set up alerts for performance degradation

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Client-Side Exceptions in Production

**Symptoms:**
- Console errors about missing environment variables
- WebSocket connection failures
- Step Functions upload errors
- "Service temporarily unavailable" messages

**Root Causes:**
- Missing or incorrect environment variables
- AWS credentials not configured properly
- Step Functions state machine not deployed
- Network connectivity issues

**Resolution Steps:**
1. Check health endpoint: `GET /api/health?detailed=true`
2. Verify all environment variables are set in Amplify console
3. Test AWS credentials with a simple API call
4. Check Step Functions state machine ARN
5. Verify S3 bucket permissions

#### 2. Database Connection Failures

**Symptoms:**
- "Database connection failed" in health checks
- 500 errors on database operations
- Application startup failures

**Resolution Steps:**
1. Verify `DATABASE_URL` is correctly formatted
2. Check Neon database is running and accessible
3. Test connection from local environment
4. Verify database credentials are correct
5. Check firewall/network connectivity

#### 3. Step Functions Issues

**Symptoms:**
- "Step Functions not configured" warnings
- Upload failures with permission errors
- State machine execution failures

**Resolution Steps:**
1. Verify `STEPFUNCTIONS_STATE_MACHINE_ARN` is set correctly
2. Check IAM permissions for Step Functions
3. Test state machine manually in AWS console
4. Verify Lambda functions are deployed and working
5. Check S3 bucket permissions

#### 4. WebSocket/Real-time Feature Issues

**Symptoms:**
- "Connection failed" messages
- Real-time updates not working
- WebSocket timeout errors

**Resolution Steps:**
1. Configure `NEXT_PUBLIC_WS_URL` if using custom WebSocket endpoint
2. Check WebSocket server is running and accessible
3. Verify network allows WebSocket connections
4. Test fallback to polling mode

## Error Resolution Steps

### Step 1: Identify the Issue
1. Check the health endpoint: `/api/health?detailed=true`
2. Review CloudWatch logs for error patterns
3. Identify which services are failing
4. Determine if issue is configuration or deployment related

### Step 2: Verify Configuration
1. Compare environment variables with the checklist above
2. Test AWS credentials independently
3. Verify database connectivity
4. Check all external service configurations

### Step 3: Test Components Individually
1. Test database connection: `/api/health/database`
2. Test Step Functions access: `/api/health/step-functions`
3. Test file upload functionality
4. Test WebSocket connections

### Step 4: Apply Fixes
1. Update missing or incorrect environment variables
2. Redeploy with correct configuration
3. Update AWS IAM permissions if needed
4. Deploy missing infrastructure components

### Step 5: Validate Resolution
1. Run comprehensive health checks
2. Test end-to-end user workflows
3. Monitor error rates and performance
4. Verify all features work as expected

## Preventive Measures

### 1. Configuration Management
- **Use Infrastructure as Code**: Define all AWS resources in CloudFormation/CDK
- **Environment Variable Templates**: Maintain templates for different environments
- **Configuration Validation**: Run validation scripts before deployment
- **Secrets Management**: Use AWS Secrets Manager for sensitive values

### 2. Deployment Process
- **Staged Deployments**: Deploy to staging environment first
- **Automated Testing**: Run health checks as part of CI/CD pipeline
- **Rollback Plan**: Have automated rollback procedures
- **Monitoring**: Set up comprehensive monitoring and alerting

### 3. Error Handling
- **Graceful Degradation**: Ensure features degrade gracefully when services are unavailable
- **User-Friendly Messages**: Provide clear error messages to users
- **Retry Mechanisms**: Implement automatic retry for transient failures
- **Circuit Breakers**: Prevent cascading failures

### 4. Monitoring and Alerting
- **Health Check Automation**: Schedule regular health checks
- **Error Rate Monitoring**: Alert on increased error rates
- **Performance Monitoring**: Track response times and resource usage
- **Capacity Planning**: Monitor usage trends and plan for growth

### 5. Documentation and Training
- **Runbook Updates**: Keep troubleshooting guides up to date
- **Team Training**: Ensure team knows how to respond to issues
- **Post-Incident Reviews**: Learn from incidents and improve processes
- **Knowledge Sharing**: Document solutions and share with team

## Emergency Response

### Immediate Actions for Production Issues
1. **Check Overall System Health**
   ```bash
   curl https://your-domain.com/api/health
   ```

2. **Identify Failed Components**
   ```bash
   curl https://your-domain.com/api/health?detailed=true
   ```

3. **Check CloudWatch Logs**
   - Review recent error logs
   - Look for patterns or spikes in errors

4. **Verify Recent Changes**
   - Check recent deployments
   - Review environment variable changes
   - Verify infrastructure changes

5. **Apply Quick Fixes**
   - Revert problematic deployments
   - Fix critical environment variables
   - Restart services if needed

6. **Communicate Status**
   - Update status page
   - Notify stakeholders
   - Provide regular updates

### Long-term Resolution
1. **Root Cause Analysis**
   - Identify why the issue occurred
   - Determine how to prevent recurrence

2. **Process Improvements**
   - Update deployment procedures
   - Enhance monitoring and alerting
   - Improve testing coverage

3. **Documentation Updates**
   - Update runbooks
   - Document new solutions
   - Share lessons learned

## Contact Information

For production issues or questions about this deployment guide:

- **Emergency Escalation**: [Your emergency contact]
- **Development Team**: [Team contact information]
- **AWS Support**: [AWS support case process]
- **Database Support**: [Neon support information]

---

**Last Updated**: October 9, 2025
**Version**: 1.0
**Maintained by**: Development Team