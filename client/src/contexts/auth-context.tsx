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
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  migrateAnonymousContent: (sessionId: string) => Promise<MigrationResponse>;
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
  register: async () => false,
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
      setUser(response.data);
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

  const register = async (username: string, email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post('/api/auth/register', { username, email, password });
      setUser(response.data);
      toast({
        title: "Account created",
        description: "Your account has been created successfully!",
      });
      return true;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again with different credentials.';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: errorMessage,
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: "There was a problem logging you out. Please try again.",
      });
    }
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
    } catch (error) {
      setUser(null);
    }
  };

  // Migrate anonymous content to authenticated user
  const migrateAnonymousContent = async (sessionId: string): Promise<MigrationResponse> => {
    try {
      if (!isAuthenticated || !user) {
        console.error('[Auth Context] Cannot migrate content - user not authenticated');
        return {
          success: false,
          message: 'You must be logged in to migrate content',
          error: {
            code: 'AUTH_REQUIRED'
          }
        };
      }
      
      // Get the auth token from cookies
      let authToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_session='))
        ?.split('=')[1];
      
      // Add debugging for auth token
      if (!authToken) {
        console.warn('[Auth Context] No auth token found in cookies');
      } else {
        console.log('[Auth Context] Found auth token in cookies (first 10 chars):', authToken.substring(0, 10) + '...');
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
      
      // Use the migration endpoint compatible with our client implementation
      const response = await axios.post('/api/auth/migrate-anonymous-data', { 
        anonymousSessionId: sessionId,
        // Include auth token in the request body as a fallback
        authToken: authToken
      }, config);
      
      if (response.data.success) {
        // Import the clearAnonymousSession function to avoid circular dependencies
        const { clearAnonymousSession } = await import('@/lib/anonymous-session');
        
        // Clear the anonymous session after successful migration
        clearAnonymousSession();
        
        console.log('[Auth Context] Migration successful, videos migrated:', response.data.data?.migratedVideos);
        
        // Check if we have migrated videos count (if not, default to 0)
        const migratedCount = response.data.data?.migratedVideos || 0;
        
        toast({
          title: "Content migrated successfully",
          description: `${migratedCount} ${migratedCount === 1 ? 'video has' : 'videos have'} been added to your library.`,
        });
        
        // Refresh user data to reflect any changes
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