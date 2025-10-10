# AWS Cognito Authentication Analysis and Recommendations

**Date**: 2025-10-10
**Application**: Next.js Chatbot Starter
**Deployment**: AWS Amplify (https://master.d8z7xlyl8bjeg.amplifyapp.com)
**Account ID**: 761526718835
**Region**: ap-southeast-1

---

## Executive Summary

**Issue**: The login endpoint `/api/v1/auth/login` is failing with "Auth UserPool not configured" despite:
1. AWS Cognito User Pool exists and is properly configured
2. Environment variables are set in Amplify branch configuration
3. Users exist in the Cognito User Pool

**Root Cause**: Environment variables are not being propagated to the runtime environment during Amplify deployment, despite being configured in the branch settings.

**Status**: ✅ **COGNITO RESOURCES EXIST** - Ready to use, configuration issue only

---

## 1. Cognito Resources Inventory

### User Pool Details
```
User Pool ID: ap-southeast-1_hLrZl0hn0
Name: ChatbotAPI-UserPool
ARN: arn:aws:cognito-idp:ap-southeast-1:761526718835:userpool/ap-southeast-1_hLrZl0hn0
Status: Active
Created: 2025-09-22
Users: 2 (CONFIRMED)
```

**Configuration Highlights**:
- Username Attributes: Email-based login
- Auto-Verified: Email
- Password Policy: Strong (8+ chars, upper, lower, numbers, symbols)
- Advanced Security: ENFORCED
- MFA: OFF (can be enabled if needed)
- Deletion Protection: ACTIVE
- User Pool Tier: PLUS

### App Clients

| Client ID | Client Name | Has Secret | Auth Flows |
|-----------|-------------|------------|------------|
| `7p0uanoj10cg99u2qjpe1np74q` | ChatbotAPI-Client-NoSecret | ❌ No | USER_PASSWORD_AUTH, USER_SRP_AUTH, ADMIN_USER_PASSWORD_AUTH |
| `303op9c9i4e9b7gipo8u9odfah` | ChatbotAPI-Client | ✅ Yes | (Legacy) |
| `ul6htvtb7qvtqliekgn4b4dg1` | ChatbotAPI-Client-NoSecret | ❌ No | (Duplicate) |

**Recommended Client**: `7p0uanoj10cg99u2qjpe1np74q` (No secret required - simpler integration)

### Existing Users

1. **Super Admin**: `chemecosmetics.dev@gmail.com` (CONFIRMED, Email Verified)
2. **Test User**: `testuser@example.com` (CONFIRMED)

---

## 2. Current Environment Configuration

### ✅ Configured in Amplify Branch
The following Cognito variables are correctly set in AWS Amplify branch configuration:

```bash
COGNITO_USER_POOL_ID=ap-southeast-1_hLrZl0hn0
COGNITO_CLIENT_ID=7p0uanoj10cg99u2qjpe1np74q
COGNITO_REGION=ap-southeast-1
COGNITO_USER_POOL_ARN=arn:aws:cognito-idp:ap-southeast-1:761526718835:userpool/ap-southeast-1_hLrZl0hn0
```

### ❌ Missing at Runtime
Health check shows these variables are **NOT available** at runtime:
```json
{
  "service": "configuration",
  "status": "degraded",
  "details": "Some optional configuration missing: ..., COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION, ..."
}
```

---

## 3. Authentication Architecture

### Current Implementation
```
User Login → /api/v1/auth/login → CognitoAuthService → AWS Cognito
                                    ↓
                                UserSyncService (Database)
                                    ↓
                                JWT Session Token
                                    ↓
                                Session Cookie
```

### Dual Authentication System
The application currently uses **two parallel authentication systems**:

1. **AWS Cognito** (Primary - via `/api/v1/auth/login`)
   - AWS-managed user pool
   - Industry-standard authentication
   - Multi-factor authentication support
   - Password policies and security features
   - User management through AWS Console

2. **JWT-Only** (Fallback - via `/api/v1/auth/me`)
   - Custom JWT token management
   - Session-based authentication
   - Database-driven user verification
   - No dependency on external services

**Current User Session**: The user has a valid JWT session cookie from the fallback system, which is why they can access some features but login fails.

---

## 4. Root Cause Analysis

### Why Login is Failing

1. **Environment Variable Propagation Issue**:
   - Amplify branch settings show variables are configured
   - Runtime health check shows variables are missing
   - This indicates a build/deployment configuration issue

2. **Possible Causes**:
   - Environment variables not prefixed with `NEXT_PUBLIC_` are not available in browser-side code
   - Server-side environment variables need special handling in Next.js standalone mode
   - Amplify build process may not be correctly injecting server-side environment variables

3. **Evidence**:
   ```bash
   # This works (has value):
   DATABASE_URL - Server-side only, correctly propagated

   # This fails (no value):
   COGNITO_USER_POOL_ID - Server-side only, NOT propagated
   ```

---

## 5. Recommendations

### Option A: Fix Cognito Configuration (RECOMMENDED)

**Pros**:
- Industry-standard authentication
- AWS-managed security and compliance
- Built-in features (MFA, password reset, email verification)
- Better scalability and user management
- Already configured - just needs fixing

**Cons**:
- Requires AWS service dependency
- Additional costs (minimal for small user base)

**Implementation Steps**:

1. **Fix Environment Variable Propagation**:
   ```bash
   # Update environment variables in Amplify to be available at runtime
   # Option 1: Add to next.config.js (for server-side access)
   # Option 2: Use AWS Amplify Gen 2 environment configuration
   # Option 3: Update buildspec.yml to inject variables
   ```

2. **Update Code to Handle Missing Cognito**:
   ```typescript
   // Add graceful degradation in lib/cognito.ts
   const cognitoConfigured = Boolean(
     process.env.COGNITO_USER_POOL_ID &&
     process.env.COGNITO_CLIENT_ID
   );

   if (!cognitoConfigured) {
     // Fall back to database-only authentication
   }
   ```

3. **Redeploy Application**:
   - Trigger new Amplify build
   - Verify environment variables in runtime
   - Test login endpoint

**Estimated Effort**: 1-2 hours

---

### Option B: Switch to Database-Only Authentication

**Pros**:
- No AWS service dependencies for auth
- Simpler deployment (fewer environment variables)
- Full control over authentication logic
- Already partially implemented

**Cons**:
- Need to implement security features manually
- Password reset, email verification require custom code
- Less secure unless properly implemented
- No built-in MFA support

**Implementation Steps**:

1. **Create Database-Only Auth Service**:
   ```typescript
   // lib/db-auth.ts
   export class DatabaseAuthService {
     static async login(email: string, password: string) {
       // Verify against database
       // Use bcrypt for password hashing
       // Return JWT token
     }
   }
   ```

2. **Update Login Route**:
   ```typescript
   // app/api/v1/auth/login/route.ts
   // Replace CognitoAuthService with DatabaseAuthService
   ```

3. **Implement Security Features**:
   - Password hashing (bcrypt)
   - Rate limiting
   - Email verification
   - Password reset workflow

**Estimated Effort**: 4-6 hours

---

### Option C: Hybrid Approach (MOST FLEXIBLE)

Keep both authentication methods with graceful fallback:

```typescript
// lib/auth-manager.ts
export class AuthManager {
  static async login(email: string, password: string) {
    // Try Cognito first if configured
    if (isCognitoConfigured()) {
      const result = await CognitoAuthService.login(email, password);
      if (result.success) return result;
    }

    // Fall back to database authentication
    return await DatabaseAuthService.login(email, password);
  }
}
```

**Benefits**:
- Works in all environments
- Seamless fallback
- Allows migration from database to Cognito
- Testing flexibility

**Estimated Effort**: 2-3 hours

---

## 6. Immediate Action Items

### Priority 1: Fix Environment Variables (Quick Fix)

1. **Verify Amplify Configuration**:
   ```bash
   aws amplify get-branch \
     --app-id d8z7xlyl8bjeg \
     --branch-name master \
     --region ap-southeast-1 \
     --query 'branch.environmentVariables' \
     --output json
   ```

2. **Add to next.config.js** (if using server components):
   ```javascript
   // next.config.js
   module.exports = {
     env: {
       COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
       COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
       COGNITO_REGION: process.env.COGNITO_REGION,
     }
   }
   ```

3. **Update lib/cognito.ts**:
   ```typescript
   const awsConfig = {
     Auth: {
       Cognito: {
         userPoolId: process.env.COGNITO_USER_POOL_ID ||
                     process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
         userPoolClientId: process.env.COGNITO_CLIENT_ID ||
                           process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
         region: process.env.COGNITO_REGION ||
                 process.env.NEXT_PUBLIC_COGNITO_REGION || 'ap-southeast-1',
       }
     }
   };

   // Add validation
   if (!awsConfig.Auth.Cognito.userPoolId) {
     console.error('COGNITO_USER_POOL_ID not configured');
     throw new Error('Auth UserPool not configured.');
   }
   ```

### Priority 2: Update Health Check

Make Cognito variables **required** instead of optional:

```typescript
// app/api/health/route.ts
{ name: 'COGNITO_USER_POOL_ID', value: process.env.COGNITO_USER_POOL_ID, required: true },
{ name: 'COGNITO_CLIENT_ID', value: process.env.COGNITO_CLIENT_ID, required: true },
{ name: 'COGNITO_REGION', value: process.env.COGNITO_REGION, required: true },
```

### Priority 3: Add Graceful Degradation

```typescript
// lib/cognito.ts
export function isCognitoConfigured(): boolean {
  return Boolean(
    process.env.COGNITO_USER_POOL_ID &&
    process.env.COGNITO_CLIENT_ID &&
    process.env.COGNITO_REGION
  );
}

export class CognitoAuthService {
  static async login(email: string, password: string): Promise<AuthResult> {
    if (!isCognitoConfigured()) {
      return {
        success: false,
        error: 'Cognito authentication not configured. Please use alternative login method.'
      };
    }
    // ... rest of login logic
  }
}
```

---

## 7. Testing Plan

### After Fix Implementation

1. **Verify Environment Variables**:
   ```bash
   curl -s 'https://master.d8z7xlyl8bjeg.amplifyapp.com/api/health?detailed=true' | \
     python3 -m json.tool
   ```

2. **Test Login Endpoint**:
   ```bash
   curl -X POST https://master.d8z7xlyl8bjeg.amplifyapp.com/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"chemecosmetics.dev@gmail.com","password":"SuperAdmin123!"}'
   ```

3. **Verify Session Creation**:
   - Check response contains JWT token
   - Verify session cookie is set
   - Test `/api/v1/auth/me` endpoint

4. **Test User Flow**:
   - Navigate to login page
   - Enter credentials
   - Verify successful authentication
   - Check dashboard access

---

## 8. Cost Analysis

### Cognito Pricing (Monthly)
- **MAU (Monthly Active Users)**: Free tier = 50,000 users
- **Current Usage**: 2 users = $0.00/month
- **Advanced Security**: Included in PLUS tier
- **Email Notifications**: $0.0001 per email (using Amazon SES)

**Total Estimated Cost**: < $1/month for current scale

### Comparison with Alternatives
- **Auth0**: $23/month minimum
- **Firebase Auth**: $0.00 for < 50k users (similar to Cognito)
- **Custom Database Auth**: $0.00 (but requires maintenance)

**Recommendation**: Cognito is cost-effective and provides best value for AWS-native applications.

---

## 9. Security Considerations

### Current Cognito Security Features
✅ Advanced Security Mode: ENFORCED
✅ Password Policy: Strong (8+ chars, complexity requirements)
✅ Email Verification: Enabled
✅ Account Recovery: Email-based
✅ Deletion Protection: Active
✅ SSL/TLS: Required
❌ MFA: Not enabled (recommend enabling for admin users)
❌ Account Takeover Protection: Not configured

### Recommendations
1. **Enable MFA for Admin Users**:
   ```bash
   aws cognito-idp set-user-pool-mfa-config \
     --user-pool-id ap-southeast-1_hLrZl0hn0 \
     --mfa-configuration OPTIONAL \
     --region ap-southeast-1
   ```

2. **Configure Account Takeover Protection**:
   - Enable risk-based adaptive authentication
   - Configure IP-based blocking
   - Set up CloudWatch alarms for suspicious activity

3. **Regular Security Audits**:
   - Review Cognito CloudWatch logs
   - Monitor failed login attempts
   - Check for compromised credentials

---

## 10. Migration Path (If Needed)

### From Database Auth to Cognito

If currently using database-only authentication:

1. **User Migration**:
   ```bash
   # Option 1: Bulk import users
   # Option 2: Just-in-time migration (on first login)
   # Option 3: Email users to reset password
   ```

2. **Gradual Rollout**:
   - Phase 1: Admin users only
   - Phase 2: Beta users
   - Phase 3: All users

3. **Rollback Plan**:
   - Keep database auth code
   - Feature flag for Cognito
   - Monitor error rates

---

## 11. Next Steps

### Immediate (Today)
1. ✅ Document Cognito resources (DONE)
2. ⏳ Fix environment variable propagation
3. ⏳ Update health check to require Cognito vars
4. ⏳ Add error handling in login route

### Short-term (This Week)
1. ⏳ Test login with existing users
2. ⏳ Enable MFA for admin account
3. ⏳ Set up CloudWatch alarms
4. ⏳ Document authentication flow

### Long-term (This Month)
1. ⏳ Implement password reset flow
2. ⏳ Add user self-registration
3. ⏳ Configure social login (Google, GitHub)
4. ⏳ Set up user activity monitoring

---

## 12. Conclusion

**Summary**: AWS Cognito is properly configured and ready to use. The issue is an environment variable propagation problem in the Amplify deployment, not a missing resource issue.

**Recommended Approach**:
1. Fix environment variable propagation (Option A - Priority 1)
2. Add graceful degradation (Option C)
3. Update health checks to catch this earlier

**Estimated Time to Resolution**: 1-2 hours
**Risk Level**: Low (existing users won't be affected, new logins will work after fix)
**Cost Impact**: Minimal (< $1/month)

---

## Appendix A: Useful AWS CLI Commands

### Check Cognito User Pool
```bash
aws cognito-idp describe-user-pool \
  --user-pool-id ap-southeast-1_hLrZl0hn0 \
  --region ap-southeast-1
```

### List Users
```bash
aws cognito-idp list-users \
  --user-pool-id ap-southeast-1_hLrZl0hn0 \
  --region ap-southeast-1
```

### Create User (Admin)
```bash
aws cognito-idp admin-create-user \
  --user-pool-id ap-southeast-1_hLrZl0hn0 \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com \
  --temporary-password "TempPass123!" \
  --region ap-southeast-1
```

### Reset Password
```bash
aws cognito-idp admin-reset-user-password \
  --user-pool-id ap-southeast-1_hLrZl0hn0 \
  --username user@example.com \
  --region ap-southeast-1
```

### Check Amplify Environment Variables
```bash
aws amplify get-branch \
  --app-id d8z7xlyl8bjeg \
  --branch-name master \
  --region ap-southeast-1 \
  --query 'branch.environmentVariables'
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-10
**Maintainer**: AWS CLI Engineer Agent
