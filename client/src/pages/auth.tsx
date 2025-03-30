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
    
    // Check for anonymous session
    const checkAnonymousSession = async () => {
      const id = await getAnonymousSessionId();
      if (id) {
        setSessionId(id);
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
    // If there's an anonymous session, show migration dialog
    if (sessionId) {
      setMigrationAction('register');
      setShowMigrationDialog(true);
    } else {
      // Otherwise redirect to home page
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
        />
      )}
    </div>
  );
}