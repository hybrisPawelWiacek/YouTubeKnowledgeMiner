/**
 * Authentication Hook
 * 
 * This hook provides authentication functions and state across the application.
 * It handles user login, registration, session management, and authentication state.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getOrCreateAnonymousSessionId } from '@/lib/anonymous-session';

// Define the shape of the authenticated user
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  isVerified: boolean;
  role: string;
  createdAt: string;
  lastLogin: string;
}

// Define the context shape
interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (data: Partial<AuthUser>) => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

// Create context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  resetPassword: async () => {},
  updateProfile: async () => {},
  checkAuth: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Check if the user is authenticated on mount
  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to check authentication status
  const checkAuth = async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await apiRequest('GET', '/api/auth/me', undefined);
      const data = await response.json();
      
      if (data && data.isAuthenticated && data.user) {
        setUser(data.user);
        return true;
      } else {
        setUser(null);
        return false;
      }
    } catch (error) {
      console.error('Error checking authentication status:', error);
      setUser(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to log in a user
  const login = async (emailOrUsername: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      
      const response = await apiRequest('POST', '/api/auth/login', {
        email: emailOrUsername,
        password,
      });
      
      const data = await response.json();
      
      if (data && data.user) {
        setUser(data.user);
        
        toast({
          title: 'Login successful',
          description: `Welcome back, ${data.user.username}!`,
        });
        
        // Migrate anonymous data if available
        const anonymousSessionId = getOrCreateAnonymousSessionId();
        if (anonymousSessionId) {
          try {
            await apiRequest('POST', '/api/auth/migrate', { 
              anonymousSessionId 
            });
            
            toast({
              title: 'Data migrated',
              description: 'Your anonymous data has been migrated to your account',
            });
          } catch (error) {
            console.error('Error migrating anonymous data:', error);
          }
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to login. Please check your credentials.';
      
      toast({
        title: 'Login failed',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to register a new user
  const register = async (email: string, username: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      
      const response = await apiRequest('POST', '/api/auth/register', {
        email,
        username,
        password,
      });
      
      const data = await response.json();
      
      toast({
        title: 'Registration successful',
        description: data.message || 'Account created. Please check your email for verification.',
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to register. Please try again.';
      
      toast({
        title: 'Registration failed',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to log out the current user
  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      await apiRequest('POST', '/api/auth/logout', undefined);
      
      setUser(null);
      
      toast({
        title: 'Logout successful',
        description: 'You have been logged out successfully.',
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to logout. Please try again.';
      
      toast({
        title: 'Logout failed',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to request a password reset
  const resetPassword = async (email: string): Promise<void> => {
    try {
      setIsLoading(true);
      
      await apiRequest('POST', '/api/auth/request-password-reset', { email });
      
      toast({
        title: 'Password reset requested',
        description: 'If an account with that email exists, you will receive a password reset link.',
      });
    } catch (error: any) {
      // Even on error, we show the same message for security
      toast({
        title: 'Password reset requested',
        description: 'If an account with that email exists, you will receive a password reset link.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to update user profile
  const updateProfile = async (data: Partial<AuthUser>): Promise<void> => {
    try {
      setIsLoading(true);
      
      const response = await apiRequest('PATCH', '/api/auth/profile', data);
      const updatedUser = await response.json();
      
      setUser(prevUser => ({
        ...prevUser!,
        ...updatedUser,
      }));
      
      toast({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully.',
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to update profile. Please try again.';
      
      toast({
        title: 'Profile update failed',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate if user is authenticated
  const isAuthenticated = !!user;

  // Return the provider with all auth functions and state
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        register,
        logout,
        resetPassword,
        updateProfile,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}