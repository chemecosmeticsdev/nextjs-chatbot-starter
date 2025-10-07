"use client";

import { useState, useEffect, useCallback } from 'react';
import { AuthTokenService, SessionData } from '@/lib/auth';

interface AuthState {
  user: SessionData | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

export function useAuth(): AuthContextType {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/auth/me', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setState({
          user: data.user,
          token: data.token || null,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        setState({
          user: null,
          token: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    } catch (error) {
      console.error('Error checking existing session:', error);
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        setState({
          user: data.user,
          token: data.token || null,
          isLoading: false,
          isAuthenticated: true,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
      }));
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  const refreshAuth = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setState(prev => ({
          ...prev,
          user: data.user,
          token: data.token || prev.token,
        }));
      }
    } catch (error) {
      console.error('Auth refresh error:', error);
    }
  }, []);

  return {
    ...state,
    login,
    logout,
    refreshAuth,
  };
}