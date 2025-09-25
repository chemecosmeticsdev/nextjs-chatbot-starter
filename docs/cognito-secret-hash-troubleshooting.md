# AWS Cognito SECRET_HASH Troubleshooting Guide

## Issue Summary

**Error**: `NotAuthorizedException: Client [CLIENT_ID] is configured with secret but SECRET_HASH was not received`

**Symptoms**:
- Authentication fails during login attempt with Cognito
- Error occurs specifically when using AWS Amplify with a Cognito User Pool App Client that has a client secret configured
- Error manifests in the `signInWithSRP` process during authentication flow

## Technical Root Cause

### What is SECRET_HASH?

SECRET_HASH is a Base64-encoded HMAC-SHA256 value required by AWS Cognito when an App Client has a client secret configured. The formula is:

```
Base64(HMAC_SHA256("Client Secret Key", "Username" + "Client ID"))
```

### Why This Error Occurs

1. **Cognito App Client Configuration**: The User Pool App Client was created with a client secret
2. **AWS Amplify Limitation**: AWS Amplify Gen 2 doesn't automatically handle SECRET_HASH computation when using the high-level `signIn` function
3. **Missing Parameter**: Cognito expects SECRET_HASH in authentication requests but Amplify doesn't provide it

## Resolution Steps

### Option 1: Create New App Client Without Secret (Recommended)

This is the cleanest solution that eliminates the SECRET_HASH requirement entirely.

#### Step 1: Create New App Client

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id "YOUR_USER_POOL_ID" \
  --client-name "ChatbotAPI-Client-NoSecret" \
  --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH \
  --prevent-user-existence-errors ENABLED \
  --enable-token-revocation \
  --region YOUR_REGION
```

#### Step 2: Update Environment Variables

```env
# Before (with client secret)
COGNITO_CLIENT_ID=303op9c9i4e9b7gipo8u9odfah
COGNITO_CLIENT_SECRET=of0pg1nsefphr5o45h11ec9o8olim7frt6s7o0f2g6vdj01340o

# After (without client secret)
COGNITO_CLIENT_ID=ul6htvtb7qvtqliekgn4b4dg1
# COGNITO_CLIENT_SECRET removed entirely
```

#### Step 3: Update Amplify Configuration

```typescript
// lib/cognito.ts
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.COGNITO_USER_POOL_ID || '',
      userPoolClientId: process.env.COGNITO_CLIENT_ID || '',
      // userPoolClientSecret removed
      region: process.env.COGNITO_REGION || 'ap-southeast-1',
      loginWith: {
        email: true,
        username: false,
        phone: false
      }
    }
  }
};
```

### Option 2: Manual SECRET_HASH Implementation (Alternative)

If you must keep the client secret, you can implement manual SECRET_HASH computation:

```typescript
import crypto from 'crypto';

function calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
  const message = username + clientId;
  return crypto.createHmac('SHA256', clientSecret).update(message).digest('base64');
}

// Use with AWS SDK directly instead of Amplify signIn
import { CognitoIdentityProviderClient, InitiateAuthCommand, AuthFlowType } from '@aws-sdk/client-cognito-identity-provider';

const command = new InitiateAuthCommand({
  AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
  ClientId: clientId,
  AuthParameters: {
    USERNAME: email,
    PASSWORD: password,
    SECRET_HASH: calculateSecretHash(email, clientId, clientSecret)
  }
});
```

## Code Changes Made

### Files Modified/Created:

1. **lib/cognito.ts**: Simplified to remove SECRET_HASH handling
2. **.env.local**: Updated `COGNITO_CLIENT_ID`, removed `COGNITO_CLIENT_SECRET`
3. **AWS CLI**: Created new app client without secret

### Key Configuration Changes:

```typescript
// Before - Complex with SECRET_HASH
const signInInput: SignInInput = {
  username: email,
  password: password,
  options: {
    authFlowType: 'USER_SRP_AUTH',
    authParameters: {
      SECRET_HASH: calculateSecretHash(email, clientId, clientSecret)
    }
  }
};

// After - Simple without SECRET_HASH
const signInInput: SignInInput = {
  username: email,
  password: password,
};
```

## AWS CLI Commands Used

### Check Current Client Configuration:
```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id ap-southeast-1_hLrZl0hn0 \
  --client-id 303op9c9i4e9b7gipo8u9odfah \
  --region ap-southeast-1
```

### Create New Client Without Secret:
```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id ap-southeast-1_hLrZl0hn0 \
  --client-name "ChatbotAPI-Client-NoSecret" \
  --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH \
  --prevent-user-existence-errors ENABLED \
  --enable-token-revocation \
  --region ap-southeast-1
```

## Prevention Guidelines

### For New Projects:
1. **Default to No Client Secret**: Unless specifically required for server-to-server authentication, avoid creating app clients with client secrets
2. **Document Client Configuration**: Always document which authentication flows are needed
3. **Use Environment-Specific Clients**: Create separate app clients for development/staging/production

### For Existing Projects:
1. **Audit App Clients**: Review existing clients and their secret configuration
2. **Migration Strategy**: Plan migration from secret-based to non-secret clients
3. **Testing**: Always test authentication flows in development environment first

## Security Considerations

### Client Secret vs No Secret:

**With Client Secret (More Secure)**:
- Suitable for server-side applications
- Requires SECRET_HASH computation
- Better for confidential clients
- More complex implementation

**Without Client Secret (Simpler)**:
- Suitable for public clients (mobile apps, SPAs)
- No SECRET_HASH required
- Simpler implementation with AWS Amplify
- Standard for frontend applications

### Recommendation:
For Next.js applications using AWS Amplify, **prefer app clients without client secrets** unless you have specific server-to-server authentication requirements.

## Testing Verification

### Verify the Fix:
1. **Environment Variables**: Ensure new client ID is set
2. **Authentication Test**: Test login with super admin credentials
3. **Session Management**: Verify JWT tokens are created correctly
4. **Route Protection**: Test protected routes redirect correctly

### Test Commands:
```bash
# Test login endpoint
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"chemecosmetics.dev@gmail.com","password":"SuperAdmin123!"}'

# Expected: Success response with user data, no SECRET_HASH error
```

## Additional Resources

- [AWS Cognito User Pool App Client Configuration](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)
- [Computing Secret Hash Values](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html)
- [AWS Amplify Authentication](https://docs.amplify.aws/javascript/build-a-backend/auth/)

## Resolution Timeline

- **Issue Identified**: SECRET_HASH error during Cognito authentication
- **Root Cause**: App client configured with client secret, Amplify not handling SECRET_HASH
- **Solution Applied**: Created new app client without client secret
- **Result**: Authentication working correctly without SECRET_HASH complexity
- **Documentation**: This guide created for future reference

---

**Last Updated**: September 24, 2025
**Authors**: Development Team
**Issue Status**: Resolved ✅