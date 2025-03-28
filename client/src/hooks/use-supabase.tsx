import { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { retrieveSession, storeSession, clearSession } from '@/lib/demo-session';
import { logStateChange } from '@/lib/debug-utils';

// Define types for our context
type SupabaseContextType = {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
}

// Create a context with default values
const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  user: null,
  session: null,
  signOut: async () => {},
  refreshSession: async () => {},
  setUser: () => {},
  setSession: () => {},
  isInitialized: false,
  isLoading: true,
  error: null
});

// Create a provider component to wrap the app
export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Initialize Supabase client
  useEffect(() => {
    const initializeSupabase = async () => {
      try {
        logStateChange('SupabaseProvider', 'initializeSupabase-start', {});
        setIsLoading(true);

        // Fetch configuration from server
        const configResponse = await fetch('/api/supabase-auth/config');
        const { url, key, initialized, keyExists, serviceKeyExists } = await configResponse.json();

        if (!initialized || !keyExists) {
          // Log informative message but don't treat as error
          window.console.warn('Supabase not configured on the backend');
          setIsInitialized(false);
          setIsLoading(false);
          return;
        }

        // Create client
        const client = createClient(url, key);
        setSupabase(client);

        // Try to get existing session
        const { data, error } = await client.auth.getSession();

        if (error) {
          window.console.error('[Supabase] Auth session error:', error.message);
          logStateChange('SupabaseProvider', 'getSession-error', { error: error.message });
          throw error;
        }

        if (data?.session) {
          window.console.info('[Supabase] Found existing auth session');
          setSession(data.session);
          setUser(data.session.user);
          logStateChange('SupabaseProvider', 'auth-restored', { 
            userId: data.session.user.id, 
            provider: data.session.user.app_metadata?.provider 
          });
        } else {
          window.console.info('[Supabase] No existing auth session found');
          logStateChange('SupabaseProvider', 'no-auth-session', {});
        }

        // Subscribe to auth changes
        const { data: { subscription } } = client.auth.onAuthStateChange((event, newSession) => {
          window.console.info('[Supabase] Auth state change:', event);
          logStateChange('SupabaseProvider', 'auth-state-change', { event });

          if (event === 'SIGNED_IN' && newSession) {
            window.console.info('[Supabase] User signed in:', newSession.user.id);
            setSession(newSession);
            setUser(newSession.user);
            logStateChange('SupabaseProvider', 'user-signed-in', { 
              userId: newSession.user.id,
              provider: newSession.user.app_metadata?.provider
            });
          } else if (event === 'SIGNED_OUT') {
            window.console.info('[Supabase] User signed out');
            setSession(null);
            setUser(null);
            logStateChange('SupabaseProvider', 'user-signed-out', {});
          } else if (event === 'USER_UPDATED' && newSession) {
            window.console.info('[Supabase] User updated:', newSession.user.id);
            setSession(newSession);
            setUser(newSession.user);
            logStateChange('SupabaseProvider', 'user-updated', { userId: newSession.user.id });
          } else if (event === 'TOKEN_REFRESHED' && newSession) {
            window.console.info('[Supabase] Token refreshed for user:', newSession.user.id);
            setSession(newSession);
            setUser(newSession.user);
            logStateChange('SupabaseProvider', 'token-refreshed', { userId: newSession.user.id });
          }
        });

        setIsInitialized(true);
        setIsLoading(false);
        logStateChange('SupabaseProvider', 'initializeSupabase-success', {});

        // Cleanup subscription
        return () => {
          subscription.unsubscribe();
        };
      } catch (err: any) {
        window.console.error('[Supabase] Initialization error:', err.message);
        setError(err);
        setIsLoading(false);
        logStateChange('SupabaseProvider', 'initializeSupabase-error', { 
          error: err.message,
          stack: err.stack 
        });
      }
    };

    initializeSupabase();
  }, []);

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      logStateChange('SupabaseProvider', 'signOut-start', { userId: user?.id });

      if (user?.user_metadata?.is_demo) {
        window.console.info('[Supabase] Signing out demo user');
        // For demo users, we just need to clear the stored session
        clearSession();
        setUser(null);
        setSession(null);
        logStateChange('SupabaseProvider', 'signOut-demo-success', { userId: user?.id });
        return;
      }

      if (supabase) {
        window.console.info('[Supabase] Signing out Supabase user');
        const { error } = await supabase.auth.signOut();
        if (error) {
          window.console.error('[Supabase] Error signing out:', error.message);
          logStateChange('SupabaseProvider', 'signOut-error', { 
            error: error.message,
            userId: user?.id 
          });
          throw error;
        }
        logStateChange('SupabaseProvider', 'signOut-success', { userId: user?.id });
      }
    } catch (err: any) {
      window.console.error('[Supabase] Sign out error:', err.message);
      setError(err);
      logStateChange('SupabaseProvider', 'signOut-exception', { 
        error: err.message,
        stack: err.stack,
        userId: user?.id 
      });
      throw err;
    }
  }, [supabase, user]);

  // Refresh session function
  const refreshSession = useCallback(async () => {
    try {
      logStateChange('SupabaseProvider', 'refreshSession-start', {});

      if (!supabase) {
        window.console.warn('[Supabase] Cannot refresh session: Supabase client not initialized');
        return;
      }

      // Try to get stored demo session first
      const storedSession = retrieveSession();

      if (storedSession) {
        window.console.info('[Supabase] Restoring demo session');
        setSession(storedSession);
        setUser(storedSession.user);
        logStateChange('SupabaseProvider', 'refreshSession-demo-restored', { 
          userId: storedSession.user.id,
          isDemoUser: true
        });
        return;
      }

      // Otherwise try to refresh Supabase session
      window.console.info('[Supabase] Refreshing auth session');
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        window.console.error('[Supabase] Error refreshing session:', error.message);
        logStateChange('SupabaseProvider', 'refreshSession-error', { error: error.message });
        throw error;
      }

      if (data?.session) {
        window.console.info('[Supabase] Session refreshed successfully');
        setSession(data.session);
        setUser(data.session.user);
        logStateChange('SupabaseProvider', 'refreshSession-success', { 
          userId: data.session.user.id 
        });
      } else {
        window.console.info('[Supabase] No active session found during refresh');
        setSession(null);
        setUser(null);
        logStateChange('SupabaseProvider', 'refreshSession-no-session', {});
      }
    } catch (err: any) {
      window.console.error('[Supabase] Session refresh error:', err.message);
      setError(err);
      logStateChange('SupabaseProvider', 'refreshSession-exception', { 
        error: err.message,
        stack: err.stack 
      });
    }
  }, [supabase]);

  const value = useMemo(() => ({
    supabase,
    user,
    session,
    signOut,
    refreshSession,
    setUser,
    setSession,
    isInitialized,
    isLoading,
    error
  }), [supabase, user, session, signOut, refreshSession, isInitialized, isLoading, error]);

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

// Hook to access Supabase context
export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};