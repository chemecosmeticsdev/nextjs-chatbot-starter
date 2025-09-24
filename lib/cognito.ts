import { Amplify } from 'aws-amplify';
import { signIn, signOut, getCurrentUser, fetchAuthSession, SignInInput } from 'aws-amplify/auth';
import crypto from 'crypto';

const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
      userPoolClientId: process.env.COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
      region: process.env.COGNITO_REGION || process.env.NEXT_PUBLIC_COGNITO_REGION || 'ap-southeast-1',
      loginWith: {
        email: true,
        username: false,
        phone: false
      }
    }
  }
};

// Helper function to calculate SECRET_HASH for Cognito
function calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
  const message = username + clientId;
  return crypto.createHmac('SHA256', clientSecret).update(message).digest('base64');
}

Amplify.configure(awsConfig);

export interface CognitoUser {
  username: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
}

export interface AuthResult {
  success: boolean;
  user?: CognitoUser;
  error?: string;
}

export class CognitoAuthService {
  static async login(email: string, password: string): Promise<AuthResult> {
    try {
      const signInInput: SignInInput = {
        username: email,
        password: password,
      };

      const { isSignedIn } = await signIn(signInInput);

      if (isSignedIn) {
        const user = await getCurrentUser();
        const session = await fetchAuthSession();

        // Extract user attributes from JWT token
        const idToken = session.tokens?.idToken;
        const userAttributes = idToken?.payload as any;

        return {
          success: true,
          user: {
            username: user.username,
            email: userAttributes?.email,
            given_name: userAttributes?.given_name,
            family_name: userAttributes?.family_name,
            name: userAttributes?.name || `${userAttributes?.given_name || ''} ${userAttributes?.family_name || ''}`.trim(),
          }
        };
      }

      return {
        success: false,
        error: 'Sign in was not completed'
      };
    } catch (error: any) {
      console.error('Cognito login error:', error);
      return {
        success: false,
        error: error.message || 'Login failed'
      };
    }
  }

  static async logout(): Promise<void> {
    try {
      await signOut();
    } catch (error) {
      console.error('Cognito logout error:', error);
      throw error;
    }
  }

  static async getCurrentUser(): Promise<CognitoUser | null> {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();

      const idToken = session.tokens?.idToken;
      const userAttributes = idToken?.payload as any;

      return {
        username: user.username,
        email: userAttributes?.email,
        given_name: userAttributes?.given_name,
        family_name: userAttributes?.family_name,
        name: userAttributes?.name || `${userAttributes?.given_name || ''} ${userAttributes?.family_name || ''}`.trim(),
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  static async getSession() {
    try {
      return await fetchAuthSession();
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }

  static async isAuthenticated(): Promise<boolean> {
    try {
      const session = await fetchAuthSession();
      return session.tokens !== undefined;
    } catch (error) {
      return false;
    }
  }
}