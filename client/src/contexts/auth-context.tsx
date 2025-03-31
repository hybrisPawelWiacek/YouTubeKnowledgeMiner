/**
 * Authentication Context
 * 
 * This context provides authentication state and methods throughout the application.
 * It handles:
 * - User authentication status
 * - Login/logout operations
 * - User profile information
 * - Anonymous session to authenticated user migration
 */

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

// User Types
interface User {
  id: number;
  username: string;
  email: string;
  is_anonymous: boolean;
  created_at: string;
  role: string;
}

// Migration response data interface
interface MigrationResponse {
  success: boolean;
  message: string;
  data?: {
    migratedVideos: number;
    [key: string]: any;
  };
  error?: {
    code: string;
    message?: string;
    details?: any;
  };
}

// Auth Context State
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<{success: boolean, authToken?: string}>;
  logout: () => Promise<void>;
  migrateAnonymousContent: (sessionId: string, providedAuthToken?: string, retryCount?: number) => Promise<MigrationResponse>;
  refreshUser: () => Promise<void>;
}

// Create the context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isAnonymous: false,
  isLoading: true,
  error: null,
  login: async () => false,
  register: async () => ({ success: false }),
  logout: async () => {},
  migrateAnonymousContent: async () => ({
    success: false, 
    message: '',
    error: {
      code: 'CONTEXT_NOT_INITIALIZED'
    }
  }),
  refreshUser: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Derive authentication state from user data
  const isAuthenticated = !!user && !user.is_anonymous;
  const isAnonymous = !!user && user.is_anonymous;

  // Load user on initial mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await axios.get('/api/auth/me');
        setUser(response.data);
      } catch (error) {
        // User is not authenticated - this is an expected state, not an error
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Authentication Methods
  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      
      // Store user data
      setUser(response.data);
      
      // If there's a refresh_token, store it in localStorage as a backup 
      // for situations where cookies might not be accessible
      if (response.data.refresh_token) {
        console.log('[Auth Context] Storing auth token in localStorage for backup');
        localStorage.setItem('auth_token', response.data.refresh_token);
      }
      
      // Successfully logged in message
      toast({
        title: "Logged in successfully",
        description: `Welcome back, ${response.data.username}!`,
      });
      return true;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login failed. Please check your credentials and try again.';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: errorMessage,
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (username: string, email: string, password: string): Promise<{success: boolean, authToken?: string}> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[Auth Context] Registering new user:', username, email);
      const response = await axios.post('/api/auth/register', { username, email, password });
      
      // Store user data
      setUser(response.data);
      
      // Track the auth token
      let authToken: string | undefined = undefined;
      
      // Look for auth tokens in various places
      if (response.data.refresh_token) {
        console.log('[Auth Context] Found refresh_token in registration response');
        authToken = response.data.refresh_token;
        if (authToken) localStorage.setItem('auth_token', authToken);
      } else if (response.data.token) {
        console.log('[Auth Context] Found token in registration response');
        authToken = response.data.token;
        if (authToken) localStorage.setItem('auth_token', authToken);
      } else if (response.data.auth_token) {
        console.log('[Auth Context] Found auth_token in registration response');
        authToken = response.data.auth_token;
        if (authToken) localStorage.setItem('auth_token', authToken);
      } else if (response.headers['x-auth-token']) {
        console.log('[Auth Context] Found x-auth-token in response headers');
        authToken = response.headers['x-auth-token'];
        if (authToken) localStorage.setItem('auth_token', authToken);
      } else {
        console.warn('[Auth Context] No auth token found in registration response');
      }
      
      // Also check cookies for auth token if we didn't find one elsewhere
      if (!authToken) {
        try {
          const cookies = document.cookie.split('; ');
          const authCookie = cookies.find(cookie => 
            cookie.startsWith('auth_session=') || 
            cookie.startsWith('AuthSession=') || 
            cookie.startsWith('auth_token=')
          );
          
          if (authCookie) {
            console.log('[Auth Context] Found auth token in cookies after registration');
            authToken = authCookie.split('=')[1];
            localStorage.setItem('auth_token', authToken);
          }
        } catch (cookieError) {
          console.error('[Auth Context] Error reading cookies:', cookieError);
        }
      }
      
      // Create a fallback token if necessary for development/debugging
      if (!authToken && process.env.NODE_ENV === 'development') {
        console.warn('[Auth Context] Creating fallback development token');
        authToken = `dev_auth_${Date.now()}`;
        localStorage.setItem('auth_token', authToken);
      }
      
      toast({
        title: "Account created",
        description: "Your account has been created successfully!",
      });
      
      return { success: true, authToken };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again with different credentials.';
      console.error('[Auth Context] Registration error:', error);
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: errorMessage,
      });
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await axios.post('/api/auth/logout');
      
      // Clear user state
      setUser(null);
      
      // Also clear the localStorage token
      localStorage.removeItem('auth_token');
      
      // Success message
      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
    } catch (error) {
      console.error('Logout error:', error);
      
      // Even if the server request fails, still clear the local state to
      // ensure the user can log out reliably
      setUser(null);
      localStorage.removeItem('auth_token');
      
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: "There was a problem logging you out. Please try again.",
      });
    }
  };

  /**
   * Refresh the current user's data
   * 
   * Enhanced version that ensures completely fresh data by:
   * 1. Adding proper cache control headers
   * 2. Including all known auth tokens in the request
   * 3. Ensuring consistency in error handling
   */
  const refreshUser = async (): Promise<void> => {
    console.log('[AuthContext] Refreshing user state with no-cache');
    
    try {
      // Try to extract auth token from localStorage or cookies
      const storedToken = localStorage.getItem('auth_token');
      const cookies = document.cookie.split('; ');
      const authCookie = cookies.find(c => 
        c.startsWith('auth_session=') || 
        c.startsWith('AuthSession=') || 
        c.startsWith('auth_token=')
      );
      
      // Set up headers to force a fresh fetch and include all possible auth mechanisms
      const headers: Record<string, string> = {
        // Cache control headers to prevent any caching
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };
      
      // Add auth token from localStorage if available
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      
      // Request with these headers to ensure we get the current authentication state
      const response = await axios.get('/api/auth/me', {
        headers,
        // Also specify axios should not use cached response
        params: {
          // Add timestamp to force fresh request (breaks browser cache)
          '_': Date.now() 
        }
      });
      
      console.log('[AuthContext] User refresh successful:', response.data);
      
      // Check for standard success shape with user data
      if (response.data?.success && response.data?.user) {
        const userData = response.data.user;
        setUser(userData);
        console.log('[AuthContext] User state updated to:', 
                   userData.is_anonymous ? 'anonymous user' : 'authenticated user', 
                   'with ID:', userData.id);
      } 
      // Also support direct user data in response (no success wrapper)
      else if (response.data && response.data.id) {
        setUser(response.data);
        console.log('[AuthContext] User state updated to direct data with ID:', response.data.id);
      } 
      else {
        // If we get an empty response, clear the user state
        console.warn('[AuthContext] User refresh returned empty data, clearing user state');
        setUser(null);
      }
    } catch (error: unknown) {
      console.error('[AuthContext] Error refreshing user:', error);
      
      // On error, clear the user state to be safe
      setUser(null);
      
      // Additional error handling - clear token if specifically unauthorized
      // Type guard to safely access error properties
      const axiosError = error as { response?: { status: number } };
      
      if (axiosError?.response?.status === 401) {
        console.warn('[AuthContext] Unauthorized response, clearing auth token');
        localStorage.removeItem('auth_token');
      }
    }
  };

  // Migrate anonymous content to authenticated user
  const migrateAnonymousContent = async (sessionId: string, providedAuthToken?: string, retryCount = 0): Promise<MigrationResponse> => {
    try {
      if (!isAuthenticated || !user) {
        console.error('[Auth Context] Cannot migrate content - user not authenticated');
        
        // If we're not yet authenticated but in the process of loading, and this isn't our last retry,
        // wait a bit and try again
        if (isLoading && retryCount < 3) {
          console.log(`[Auth Context] Authentication still loading, will retry (${retryCount + 1}/3)...`);
          
          // Wait for authentication to complete and retry
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(migrateAnonymousContent(sessionId, providedAuthToken, retryCount + 1));
            }, 1000); // 1 second delay before retry
          });
        }
        
        // If we've exhausted retries or we're definitely not loading auth
        return {
          success: false,
          message: 'You must be logged in to migrate content',
          error: {
            code: 'AUTH_REQUIRED'
          }
        };
      }
      
      // Get auth token from multiple possible cookie names for maximum compatibility
      const allCookies = document.cookie.split('; ');
      console.log('[Auth Context] All cookies:', allCookies);
      
      // Use the provided auth token if it exists, otherwise try to find one in cookies
      let authToken = providedAuthToken || null;
      
      // If no token provided, look in cookies
      if (!authToken) {
        const cookieNames = ['auth_session', 'AuthSession', 'auth_token'];
        
        for (const cookieName of cookieNames) {
          const found = allCookies.find(row => row.startsWith(`${cookieName}=`));
          if (found) {
            authToken = found.split('=')[1];
            console.log(`[Auth Context] Found auth token in ${cookieName} cookie (first 10 chars):`, 
              authToken.substring(0, 10) + '...');
            break;
          }
        }
      } else {
        console.log('[Auth Context] Using provided auth token directly');
      }
      
      // Add debugging for auth token
      if (!authToken) {
        console.warn('[Auth Context] No auth token found in cookies, using local token caching');
        
        // Try to get token from localStorage (backup mechanism)
        const localToken = localStorage.getItem('auth_token');
        if (localToken) {
          console.log('[Auth Context] Using auth token from localStorage');
          authToken = localToken;
        }
      }
      
      // If we still don't have an auth token but we're authenticated, create a token
      if (!authToken && user && user.id) {
        console.log('[Auth Context] No auth token found but user is authenticated, creating temporary token');
        
        // Create a basic temporary token using the user ID as a fallback
        // This isn't secure for production but provides a mechanism for testing
        authToken = `temp_auth_${user.id}_${Date.now()}`;
        
        // Store this in localStorage as a backup
        localStorage.setItem('auth_token', authToken);
      }
      
      // Configure axios to include credentials and multiple authentication methods for maximum compatibility
      const config: {
        withCredentials: boolean;
        headers: Record<string, string>;
      } = {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      // Include auth token in Authorization header if available
      if (authToken) {
        config.headers['Authorization'] = `Bearer ${authToken}`;
        
        // Also set cookie directly as a last resort
        document.cookie = `auth_session=${authToken}; path=/; SameSite=Lax; max-age=3600`;
      }
      
      // Validate session ID format
      if (!sessionId.startsWith('anon_')) {
        console.error('[Auth Context] Invalid session ID format:', sessionId);
        return {
          success: false,
          message: 'Invalid anonymous session ID format',
          error: {
            code: 'INVALID_SESSION_ID'
          }
        };
      }
      
      // Log debug info
      console.log('[Auth Context] Attempting to migrate anonymous session:', sessionId);
      console.log('[Auth Context] User authenticated as:', user.username);
      
      // Include the user ID directly in the request for direct server-side verification
      // NOTE: The server schema expects a specific format with anonymousSessionId and options (optional)
      const requestPayload = {
        anonymousSessionId: sessionId,
        // Add additional fields in a compatible way with server schema
        options: {
          // These fields are used by the client but ignored by server validation
          userId: user.id,
          authToken: authToken,
          deleteAfterMigration: true
        }
      };
      
      console.log('[Auth Context] Sending migration request with payload:', {
        ...requestPayload,
        authToken: authToken ? `${authToken.substring(0, 10)}...` : null
      });
      
      // Use the migration endpoint compatible with our client implementation
      const response = await axios.post('/api/auth/migrate-anonymous-data', requestPayload, config);
      
      if (response.data.success) {
        // Import the clearAnonymousSession function to avoid circular dependencies
        const { clearAnonymousSession } = await import('@/lib/anonymous-session');
        
        console.log('[Auth Context] Migration successful, videos migrated:', response.data.data?.migratedVideos);
        
        // Check if we have migrated videos count (if not, default to 0)
        const migratedCount = response.data.data?.migratedVideos || 0;
        
        // Clear the anonymous session after successful migration and force refresh
        // Pass true to trigger page reload if needed (ensures a completely clean state)
        clearAnonymousSession(migratedCount > 0);
        
        toast({
          title: "Content migrated successfully",
          description: `${migratedCount} ${migratedCount === 1 ? 'video has' : 'videos have'} been added to your library.`,
        });
        
        // Forcefully refresh user data with no-cache headers to reflect any changes
        await refreshUser();
        
        return {
          success: true,
          message: `${migratedCount} ${migratedCount === 1 ? 'video' : 'videos'} migrated successfully`,
          data: response.data.data
        };
      } else {
        throw new Error(response.data.message || 'Migration failed');
      }
    } catch (error: any) {
      console.error('[Auth Context] Migration error:', error);
      
      // Extract and log the detailed error information
      if (error.response) {
        console.error('[Auth Context] Server response error:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
      }
      
      // Get error code if available
      const errorCode = error.response?.data?.error?.code || 'MIGRATION_ERROR';
      const errorMessage = error.response?.data?.message || error.message || 'Failed to migrate your content';
      
      toast({
        variant: "destructive",
        title: "Migration failed",
        description: errorMessage,
      });
      
      return {
        success: false,
        message: errorMessage,
        error: {
          code: errorCode,
          details: error.response?.data?.error
        }
      };
    }
  };

  // Context value
  const contextValue: AuthContextType = {
    user,
    isAuthenticated,
    isAnonymous,
    isLoading,
    error,
    login,
    register,
    logout,
    migrateAnonymousContent,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}