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
    // Check for auth token - needed for migration
    const authToken = localStorage.getItem('auth_token');
    
    // Check for anonymous session data to migrate
    const oldLocalStorageId = localStorage.getItem('ytk_anon_session_id');
    const oldCookieId = getAnonymousSessionId();
    const oldVideoCountStr = localStorage.getItem('anonymous_video_count');
    const oldVideoCount = oldVideoCountStr ? parseInt(oldVideoCountStr, 10) : 0;
    
    console.log('[AuthPage] Login success handler - authentication complete');
    console.log('[AuthPage] Auth token present:', !!authToken);
    console.log('[AuthPage] Anonymous data check:', { 
      oldLocalStorageId, 
      oldCookieId,
      oldVideoCount 
    });
    
    // First check if we have an auth token
    if (authToken) {
      console.log('[AuthPage] Found auth token for migration');
      setMigrationAuthToken(authToken);
    } else {
      // No auth token means login failed or token wasn't stored correctly
      console.warn('[AuthPage] No auth token found after login - redirecting to home');
      setLocation('/');
      return;
    }
    
    // Next, determine if there's any session data to migrate
    const hasSessionData = oldLocalStorageId || oldCookieId;
    const hasVideos = oldVideoCount > 0;
    
    // If there's no session data or no videos, skip migration
    if (!hasSessionData || !hasVideos) {
      console.log('[AuthPage] No anonymous session data to migrate - redirecting to home');
      setLocation('/');
      return;
    }
    
    // We've made it here, so we have auth token and session data with videos
    console.log('[AuthPage] Anonymous session with videos found - preparing for migration');
    
    // Update session ID state with any ID we found (prioritize localStorage)
    const migrationSessionId = oldLocalStorageId || oldCookieId;
    if (migrationSessionId && migrationSessionId !== sessionId) {
      console.log('[AuthPage] Setting session ID for migration:', migrationSessionId);
      setSessionId(migrationSessionId);
    }
    
    // Trigger the migration dialog
    console.log('[AuthPage] Showing migration dialog after login');
    setMigrationAction('login');
    setShowMigrationDialog(true);
  };

  const handleRegisterSuccess = () => {
    // Check for auth token - needed for migration
    const authToken = localStorage.getItem('auth_token');
    
    // Check for anonymous session data to migrate
    // IMPORTANT: we use localStorage directly here instead of getAnonymousSessionId()
    // because the cookies might have been cleared but the localStorage entry could still exist
    const oldLocalStorageId = localStorage.getItem('ytk_anon_session_id');
    const oldCookieId = getAnonymousSessionId();
    const oldVideoCountStr = localStorage.getItem('anonymous_video_count');
    
    // Convert video count to number or default to 0 if not found
    const oldVideoCount = oldVideoCountStr ? parseInt(oldVideoCountStr, 10) : 0;
    
    console.log('[AuthPage] Register success handler - authentication complete');
    console.log('[AuthPage] Auth token present:', !!authToken);
    console.log('[AuthPage] Anonymous data check:', { 
      oldLocalStorageId, 
      oldCookieId,
      oldVideoCount 
    });
    
    // First, store the auth token for migration if found
    if (authToken) {
      console.log('[AuthPage] Found auth token for migration');
      setMigrationAuthToken(authToken);
    } else {
      // No auth token means registration failed or token wasn't stored correctly
      console.warn('[AuthPage] No auth token found after registration - redirecting to home');
      setLocation('/');
      return;
    }
    
    // Next, determine if there's any session data to migrate:
    // 1. Do we have a session ID?
    // 2. Is there a known video count > 0?
    const hasSessionData = oldLocalStorageId || oldCookieId;
    const hasVideos = oldVideoCount > 0;
    
    // If there's no session data or no videos, skip migration
    if (!hasSessionData || !hasVideos) {
      console.log('[AuthPage] No anonymous session data to migrate - redirecting to home');
      setLocation('/');
      return;
    }
    
    // We've made it here, so we have:
    // 1. A valid auth token
    // 2. Anonymous session data that might have videos
    console.log('[AuthPage] Anonymous session with videos found - preparing for migration');
    
    // Update session ID state with any ID we found (prioritize localStorage)
    const migrationSessionId = oldLocalStorageId || oldCookieId;
    if (migrationSessionId && migrationSessionId !== sessionId) {
      console.log('[AuthPage] Setting session ID for migration:', migrationSessionId);
      setSessionId(migrationSessionId);
    }
    
    // Trigger the migration dialog
    console.log('[AuthPage] Showing migration dialog after registration');
    setMigrationAction('register');
    setShowMigrationDialog(true);
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