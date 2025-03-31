/**
 * Authentication Page
 * 
 * Provides UI for user authentication with tabs for:
 * - Login form
 * - Registration form
 * - Password reset form
 * 
 * Also handles anonymous to authenticated migration workflows.
 */

import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { MigrationDialog } from '@/components/auth/migration-dialog';
import { useAuth } from '@/contexts/auth-context';
import { getAnonymousSessionId } from '@/lib/anonymous-session';

// Tab types
type AuthTab = 'login' | 'register' | 'reset-password';

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  
  // State for anonymous session migration
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [migrationAction, setMigrationAction] = useState<'login' | 'register'>('login');
  const [migrationAuthToken, setMigrationAuthToken] = useState<string | null>(null);
  
  // Handle navigation when user is already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      // If user is already logged in, redirect to home page
      setLocation('/');
    }
  }, [isAuthenticated, user, setLocation]);

  // Set the initial active tab based on query parameter
  useEffect(() => {
    const params = new URLSearchParams(search);
    const tabParam = params.get('tab');
    
    if (tabParam === 'register') {
      setActiveTab('register');
    } else if (tabParam === 'reset') {
      setActiveTab('reset-password');
    } else {
      setActiveTab('login');
    }
    
    // Check for anonymous session from all possible sources
    const checkAnonymousSession = async () => {
      // Try to get the session ID from cookies first
      let id = getAnonymousSessionId();
      
      // Also check localStorage as a fallback
      if (!id) {
        const localStorageId = localStorage.getItem('ytk_anon_session_id');
        if (localStorageId) {
          console.log('[AuthPage] Found anonymous session in localStorage:', localStorageId);
          id = localStorageId;
        }
      }
      
      // If we found a session ID, set it in state and trigger other side effects
      if (id) {
        console.log('[AuthPage] Anonymous session found:', id);
        setSessionId(id);
        
        // Check if we should force migrate (from URL parameter)
        const shouldMigrate = params.get('migrate') === 'true';
        if (shouldMigrate) {
          console.log('[AuthPage] Auto-triggering migration from URL parameter');
          setMigrationAction(params.get('action') === 'register' ? 'register' : 'login');
          setShowMigrationDialog(true);
        }
      }
    };
    
    checkAnonymousSession();
  }, [search]);

  // Tab change handler
  const handleTabChange = (value: string) => {
    setActiveTab(value as AuthTab);
    
    // Update URL to reflect tab change
    const currentUrl = new URL(window.location.href);
    if (value === 'login') {
      currentUrl.searchParams.delete('tab');
    } else {
      currentUrl.searchParams.set('tab', value);
    }
    
    // Replace history state without full navigation
    window.history.replaceState({}, '', currentUrl.toString());
  };

  // Auth success handlers
  const handleLoginSuccess = () => {
    // If there's an anonymous session, show migration dialog
    if (sessionId) {
      setMigrationAction('login');
      setShowMigrationDialog(true);
    } else {
      // Otherwise redirect to home page
      setLocation('/');
    }
  };

  const handleRegisterSuccess = () => {
    // Check if there's actually an anonymous session to migrate
    // We need to re-check here because sessionId might not be set yet
    const storedSessionId = localStorage.getItem('ytk_anon_session_id') || getAnonymousSessionId();
    
    console.log('[AuthPage] Register success handler - checking for anonymous session:', storedSessionId);
    
    // Store the most up-to-date session ID
    if (storedSessionId && storedSessionId !== sessionId) {
      console.log('[AuthPage] Updating session ID from latest source:', storedSessionId);
      setSessionId(storedSessionId);
    }
    
    // If there's an anonymous session, prepare and show migration dialog
    if (storedSessionId || sessionId) {
      console.log('[AuthPage] Anonymous session found - preparing for migration');
      
      // Try to get the auth token from cookies or localStorage for migration
      try {
        // First check localStorage (most reliable) - the register form should have saved it
        const localToken = localStorage.getItem('auth_token');
        let authToken = null;
        
        if (localToken) {
          console.log('[AuthPage] Found auth token in localStorage for migration');
          authToken = localToken;
        } else {
          // Try cookies as fallback
          const allCookies = document.cookie.split('; ');
          const authCookie = allCookies.find(cookie => 
            cookie.startsWith('auth_session=') || 
            cookie.startsWith('AuthSession=') || 
            cookie.startsWith('auth_token=')
          );
          
          if (authCookie) {
            authToken = authCookie.split('=')[1];
            console.log('[AuthPage] Found auth token in cookies for migration');
          }
        }
        
        // If we found a token, log it and store it
        if (authToken) {
          console.log('[AuthPage] Auth token found for migration:', 
                      authToken.substring(0, 10) + '...');
          setMigrationAuthToken(authToken);
        } else {
          console.warn('[AuthPage] No auth token found in cookies or localStorage');
        }
      } catch (error) {
        console.error('[AuthPage] Error extracting auth token for migration:', error);
      }
      
      // Trigger the migration dialog
      console.log('[AuthPage] Showing migration dialog after registration');
      setMigrationAction('register');
      setShowMigrationDialog(true);
    } else {
      // No anonymous session to migrate, just redirect to home page
      console.log('[AuthPage] No anonymous session found - redirecting to home');
      setLocation('/');
    }
  };

  // Close migration dialog
  const handleCloseMigrationDialog = () => {
    setShowMigrationDialog(false);
    setLocation('/');
  };

  return (
    <div className="container max-w-md py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-2xl">
            {activeTab === 'login' ? 'Welcome Back' : 
             activeTab === 'register' ? 'Create Account' : 
             'Reset Password'}
          </CardTitle>
          <CardDescription className="text-center">
            {activeTab === 'login' ? 'Sign in to access your account' : 
             activeTab === 'register' ? 'Sign up to get started with YouTube Buddy' : 
             'Enter your email to receive a reset link'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs 
            value={activeTab} 
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-6">
              <LoginForm 
                onSuccess={handleLoginSuccess}
              />
            </TabsContent>
            <TabsContent value="register" className="pt-6">
              <RegisterForm 
                onSuccess={handleRegisterSuccess}
                sessionId={sessionId || undefined}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Migration Dialog */}
      {sessionId && (
        <MigrationDialog
          isOpen={showMigrationDialog}
          onClose={handleCloseMigrationDialog}
          sessionId={sessionId}
          authToken={migrationAuthToken || undefined}
        />
      )}
    </div>
  );
}