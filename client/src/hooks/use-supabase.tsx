import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { updateCurrentSession } from '@/lib/api';
import { getStoredSession, DEMO_SESSION_KEY } from '@/lib/demo-session';
import { registerRefreshCallback } from './use-supabase-internal';

// Key for storing temporary data for anonymous users
const LOCAL_STORAGE_KEY = 'youtube-miner-anonymous-data';

// Key for storing the last used Supabase session for persistence
const SUPABASE_SESSION_KEY = 'youtube-miner-supabase-session';

// Constants for anonymous session management
const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  getLocalData: () => any;
  setLocalData: (data: any) => void;
  migrateLocalData: () => Promise<void>;
  hasReachedAnonymousLimit: () => Promise<boolean>;
  // Add setters for demo auth integration
  setUser: (user: User) => void;
  setSession: (session: Session) => void;
};

const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  user: null,
  session: null,
  loading: true,
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signInWithMagicLink: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  getLocalData: () => ({}),
  setLocalData: () => {},
  migrateLocalData: async () => {},
  hasReachedAnonymousLimit: async () => false,
  // Add setters for demo auth integration
  setUser: () => {},
  setSession: () => {},
});

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoSessionInitialized, setDemoSessionInitialized] = useState(false);
  const { toast } = useToast();
  
  // Callback to manually refresh the auth state
  const refreshAuthState = useCallback(() => {
    console.log('[SupabaseProvider] Auth state refresh requested');
    
    // Log the current state of all authentication-related localStorage
    console.log('[SupabaseProvider] Current auth state:', {
      demoSession: localStorage.getItem(DEMO_SESSION_KEY),
      supabaseSession: localStorage.getItem(SUPABASE_SESSION_KEY),
      anonymousSession: localStorage.getItem(ANONYMOUS_SESSION_KEY),
      anonymousPreserved: localStorage.getItem(ANONYMOUS_PRESERVED_KEY),
      anonymousBackup: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_backup'),
      anonymousRestoreInfo: {
        timestamp: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_restored_at'),
        by: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_restored_by')
      },
      currentUser: user ? {
        id: user.id,
        email: user.email,
        isDemo: user.user_metadata?.is_demo || false
      } : null
    });
    
    // Check for demo session first (highest priority)
    const demoSession = getStoredSession();
    if (demoSession) {
      console.log('[SupabaseProvider] Restoring demo session', {
        id: demoSession.user.id,
        username: demoSession.user.user_metadata?.username,
        isDemo: demoSession.user.user_metadata?.is_demo || false
      });
      setUser(demoSession.user);
      setSession(demoSession);
      updateCurrentSession(demoSession);
      
      // Log success message
      console.log('[SupabaseProvider] Successfully restored demo session');
      return;
    }
    
    // Check for anonymous session next (medium priority, only if no user)
    const anonymousSessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
    if (anonymousSessionId && !user) {
      console.log('[SupabaseProvider] Restoring anonymous session', { anonymousSessionId });
      
      // For anonymous users, we don't have a user object, just ensure we have no user set
      setUser(null);
      setSession(null);
      
      // No need to update current session as the API handles anonymous sessions via cookies
      console.log('[SupabaseProvider] Anonymous session active, cleared user and session state');
    }
    
    // If Supabase client exists, try to refresh the session (lowest priority, overrides anonymous)
    if (supabase) {
      console.log('[SupabaseProvider] Checking Supabase session');
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          console.log('[SupabaseProvider] Setting Supabase session', { 
            id: session.user.id, 
            email: session.user.email 
          });
          setUser(session.user);
          setSession(session);
          updateCurrentSession(session);
        } else {
          console.log('[Auth Refresh] No Supabase session found');
        }
      });
    }
  }, [supabase]);

  // First useEffect - specifically for demo session initialization 
  // This needs to run before any async fetches
  useEffect(() => {
    const initDemoSession = () => {
      try {
        console.log('[Auth] Checking for demo user session on initial load');
        const demoSession = getStoredSession();
        
        if (demoSession) {
          console.log('[Auth] Demo session found during initial load', {
            id: demoSession.user.id,
            username: demoSession.user.user_metadata?.username,
            is_demo: demoSession.user.user_metadata?.is_demo
          });
          
          // Set React state
          setUser(demoSession.user);
          setSession(demoSession);
          
          // Make sure the API module knows about this session
          updateCurrentSession(demoSession);
          
          // Mark as complete to skip redundant initialization
          setDemoSessionInitialized(true);
          setLoading(false);
          
          return true;
        }
      } catch (error) {
        console.error('[Auth] Error initializing demo session:', error);
      }
      
      return false;
    };
    
    // Run demo initialization immediately
    initDemoSession();
  }, []); 
  
  // Second useEffect for standard Supabase flow - only runs if demo init didn't succeed
  useEffect(() => {
    // Skip if demo session was already initialized
    if (demoSessionInitialized) {
      console.log('[Auth] Skipping Supabase initialization as demo session was loaded');
      return;
    }
    
    const fetchSupabaseConfig = async () => {
      try {
        // Get Supabase configuration from our API
        console.log('[Auth] Fetching Supabase config (no demo session found)');
        const response = await fetch('/api/supabase-auth/config');
        const { data, success } = await response.json();

        if (success && data.initialized) {
          console.log('Initializing Supabase with URL:', data.url?.substring(0, 20) + '...');
          
          // Create the Supabase client with configuration from the server
          const client = createClient(
            data.url,
            data.anonKey
          );
          setSupabase(client);

          // Try to get existing session
          const { data: { session } } = await client.auth.getSession();
          
          // Check for a stored demo session first (they have priority)
          const demoSession = getStoredSession();
          
          // If no demo session, check for a stored Supabase session in localStorage
          const storedSessionStr = !demoSession ? localStorage.getItem(SUPABASE_SESSION_KEY) : null;
          let storedSession = null;
          
          try {
            if (storedSessionStr) {
              storedSession = JSON.parse(storedSessionStr);
              console.log('Found stored Supabase session, checking if still valid');
            }
          } catch (e) {
            console.error('Error parsing stored Supabase session:', e);
            localStorage.removeItem(SUPABASE_SESSION_KEY);
          }
          
          // Debug current storage state for session diagnosis
          console.log('[Auth] Current storage state:', {
            hasDemo: !!demoSession,
            hasSupabase: !!storedSession,
            demoSessionKey: localStorage.getItem('youtube-miner-demo-session') ? 'exists' : 'missing',
            supabaseSessionKey: localStorage.getItem(SUPABASE_SESSION_KEY) ? 'exists' : 'missing',
          });
          
          // Restore session in the following priority order:
          // 1. Demo session (if exists)
          // 2. Active Supabase session
          // 3. Stored Supabase session
          
          if (demoSession) {
            // Demo sessions take priority over other auth methods
            console.log('[Demo Session] Restoring demo user session');
            console.log('[Demo Session] Demo user details:', {
              id: demoSession.user.id,
              username: demoSession.user.user_metadata?.username,
              is_demo: demoSession.user.user_metadata?.is_demo,
              expires_at: demoSession.expires_at ? new Date(demoSession.expires_at).toISOString() : 'none'
            });
            setSession(demoSession);
            setUser(demoSession.user);
            updateCurrentSession(demoSession);
          } else if (session) {
            console.log('Active Supabase session found');
            setSession(session);
            setUser(session.user);
            updateCurrentSession(session);
            
            // Update the stored session
            localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
          } else if (storedSession && storedSession.expires_at > Date.now()) {
            console.log('Restoring Supabase session from storage');
            // Try to restore the session in Supabase
            const { data, error } = await client.auth.setSession({
              access_token: storedSession.access_token,
              refresh_token: storedSession.refresh_token
            });
            
            if (error) {
              console.error('Error restoring Supabase session:', error);
              localStorage.removeItem(SUPABASE_SESSION_KEY);
            } else if (data.session) {
              setSession(data.session);
              setUser(data.session.user);
              updateCurrentSession(data.session);
            }
          } else if (storedSession) {
            // Session expired, remove it
            console.log('Stored Supabase session expired, removing');
            localStorage.removeItem(SUPABASE_SESSION_KEY);
          }

          // Set up auth state change listener
          const { data: { subscription } } = client.auth.onAuthStateChange(
            (event, currentSession) => {
              console.log('Auth state changed:', event);
              setSession(currentSession);
              setUser(currentSession?.user || null);
              
              // Keep our API module's session state in sync
              updateCurrentSession(currentSession);

              // Store or remove session based on event
              if (currentSession) {
                localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(currentSession));
              } else if (event === 'SIGNED_OUT') {
                localStorage.removeItem(SUPABASE_SESSION_KEY);
              }

              // Handle specific auth events
              if (event === 'SIGNED_IN') {
                toast({
                  title: "Signed in",
                  description: "You've been successfully signed in",
                });

                setTimeout(() => {
                  migrateLocalData();
                }, 1000);
              } else if (event === 'SIGNED_OUT') {
                toast({
                  title: "Signed out",
                  description: "You've been successfully signed out",
                });
              } else if (event === 'TOKEN_REFRESHED') {
                console.log('Token refreshed successfully');
              } else if (event === 'USER_UPDATED') {
                toast({
                  title: "Profile updated",
                  description: "Your user profile has been updated",
                });
              }
            }
          );

          setLoading(false);
          console.log('Supabase configuration and auth state initialized');

          return () => {
            subscription.unsubscribe();
          };
        } else {
          console.warn('Supabase not configured on the backend');
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching Supabase config:', error);
        setLoading(false);
      }
    };

    fetchSupabaseConfig();
  }, []);

  const signIn = async (emailOrUsername: string, password: string) => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }

    try {
      // Determine if input is likely an email or username
      const isEmail = emailOrUsername.includes('@');
      
      if (isEmail) {
        // If it looks like an email, try Supabase authentication first
        const { error } = await supabase.auth.signInWithPassword({
          email: emailOrUsername,
          password,
        });

        if (error) {
          // If Supabase auth fails, try direct auth as fallback
          console.log('Supabase auth failed, trying direct auth:', error.message);
          await tryDirectAuth(emailOrUsername, password);
        }
      } else {
        // If it's a username, try direct auth first since Supabase requires email
        const directAuthSuccess = await tryDirectAuth(emailOrUsername, password);
        
        if (!directAuthSuccess) {
          // If direct auth fails and it's not an email format, let the user know
          throw new Error('Login failed. If you registered with email, please use your full email to sign in.');
        }
      }
    } catch (error: any) {
      toast({
        title: "Authentication failed",
        description: error.message || "Failed to sign in",
        variant: "destructive",
      });
    }
  };
  
  // Helper function for direct database authentication
  const tryDirectAuth = async (emailOrUsername: string, password: string): Promise<boolean> => {
    try {
      // Extract username from email or use directly if it's already a username
      const username = emailOrUsername.includes('@') ? emailOrUsername.split('@')[0] : emailOrUsername;
      
      console.log("Attempting direct authentication for username:", username);
      
      // Try to login using the direct database route
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log("Received user data from direct auth:", userData);
        
        // Ensure the ID is properly loaded as a number
        const userId = typeof userData.id === 'number' ? userData.id : parseInt(userData.id, 10);
        
        if (isNaN(userId)) {
          console.error("Direct auth returned invalid user ID:", userData.id);
          toast({
            title: "Authentication Error",
            description: "Invalid user ID returned from server",
            variant: "destructive",
          });
          return false;
        }
        
        console.log("Using numeric user ID for direct auth:", userId, "type:", typeof userId);
        
        // Manually set up user state for direct authentication
        // Use the actual numeric ID from the database instead of a string prefix
        const directUser: User = {
          // Store the actual numeric ID to ensure proper database queries
          id: userId,
          email: userData.email,
          user_metadata: {
            username: userData.username,
            full_name: userData.username,
            // Store a marker that this is a direct auth user (if needed for UI purposes)
            direct_auth: true
          },
          role: 'authenticated',
          aud: 'authenticated',
          app_metadata: {
            provider: 'direct'
          },
        } as unknown as User;
        
        // Manually set the local user and create a mock session
        // This allows the app to work without Supabase verification
        const mockSession = {
          user: directUser,
          access_token: `mock_token_${userId}`,
          refresh_token: 'mock_refresh_token',
          expires_in: 3600,
          expires_at: Date.now() + 3600000
        } as Session;
        
        console.log("Setting up direct auth session with user ID:", userId);
        console.log("Direct user object:", directUser);
        console.log("Mock session:", mockSession);
        
        setUser(directUser);
        setSession(mockSession);
        
        // Update the global session state for API calls
        updateCurrentSession(mockSession);
        
        toast({
          title: "Development mode login",
          description: `Logged in with direct authentication as user ID: ${userId}`,
        });
        
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Direct auth failed:", errorData);
      }
      
      return false;
    } catch (error) {
      console.error('Direct auth error:', error);
      return false;
    }
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      toast({
        title: "Google Authentication Failed",
        description: error.message || "Failed to sign in with Google",
        variant: "destructive",
      });
    }
  };
  
  const signInWithMagicLink = async (email: string) => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }
    
    if (!email || !email.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use our server-side endpoint to send the magic link
      const response = await fetch('/api/supabase-auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send magic link');
      }
      
      toast({
        title: "Magic Link Sent",
        description: "Check your email for a login link",
      });
      
    } catch (error: any) {
      toast({
        title: "Magic Link Failed",
        description: error.message || "Failed to send magic link email",
        variant: "destructive",
      });
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: username,
          }
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Account created",
        description: "Please check your email for verification",
      });
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    }
  };

  // Helper function to create a consistent logger
  const createLogger = (prefix: string) => ({
    info: (message: string, data?: any) => {
      console.log(`[${prefix}] ${message}`, data !== undefined ? data : '');
    },
    error: (message: string, error?: any) => {
      console.error(`[${prefix}] ${message}`, error !== undefined ? error : '');
    },
    warn: (message: string, data?: any) => {
      console.warn(`[${prefix}] ${message}`, data !== undefined ? data : '');
    },
    debug: (message: string, data?: any) => {
      if (typeof console.debug === 'function') {
        console.debug(`[${prefix}] ${message}`, data !== undefined ? data : '');
      } else {
        console.log(`[${prefix}:Debug] ${message}`, data !== undefined ? data : '');
      }
    }
  });

  const signOut = async () => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }

    // Create a logger specifically for signout operations
    const logger = createLogger('Auth:SignOut');

    try {
      
      // Log the start of the sign-out process
      logger.info("===== SIGN OUT PROCESS STARTING =====");
      logger.debug("Current user state:", user);
      logger.debug("User metadata:", user?.user_metadata);
      logger.debug("Current session state:", session ? {
        expires_at: session.expires_at,
        user_id: session.user.id
      } : null);
      logger.debug("Authentication-related localStorage keys:", 
        Object.keys(localStorage).filter(key => 
          key.includes('session') || 
          key.includes('supabase') || 
          key.includes('anonymous') || 
          key.includes('ytk_')
        )
      );
      
      // ====== CRITICAL FIX: PRE-SIGNOUT ANONYMOUS SESSION PRESERVATION ======
      // First preserve any anonymous session before we import any modules
      // This is crucial as module loading could trigger other actions
      
      // Directly check and save any anonymous session
      const anonymousSessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      if (anonymousSessionId) {
        logger.info(`Preserving anonymous session before any imports: ${anonymousSessionId}`);
        
        try {
          // Store the session for restoration after sign-out
          localStorage.setItem(ANONYMOUS_PRESERVED_KEY, anonymousSessionId);
          localStorage.setItem(ANONYMOUS_PRESERVED_KEY + '_timestamp', Date.now().toString());
          localStorage.setItem(ANONYMOUS_PRESERVED_KEY + '_source', 'signout_hook_pre');
          localStorage.setItem(
            ANONYMOUS_PRESERVED_KEY + '_meta',
            JSON.stringify({
              preserved_at: new Date().toISOString(),
              preserved_by: 'useSupabase.signOut',
              user_id: user?.id,
              is_demo: user?.user_metadata?.is_demo || false
            })
          );
          
          logger.info(`Successfully preserved anonymous session: ${anonymousSessionId}`);
        } catch (preserveError) {
          logger.error("Error preserving anonymous session:", preserveError);
        }
      } else {
        logger.info("No anonymous session found to preserve");
      }
      // ====== END CRITICAL FIX ======
      
      // Import helpers to avoid circular dependencies
      const { clearAnonymousSession } = await import('@/lib/anonymous-session');
      const { signOutDemoUser, isDemoUser, clearSession, DEMO_SESSION_KEY } = await import('@/lib/demo-session');
      
      // Check if the current user is a demo user
      const isDemo = isDemoUser(user);
      logger.info("Checking user type", { isDemo });
      
      // Check localStorage for demo session
      const hasDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
      logger.debug("Demo session check", { hasDemoSession });
      
      // Check if user was authenticated with direct method (but not a demo)
      const isDirectAuth = !isDemo && user?.user_metadata?.direct_auth === true;
      logger.debug("User authentication type", { isDemo, isDirectAuth, hasDemoSession });
      
      if (isDemo || hasDemoSession) {
        // For demo users, use the specialized signout that handles demo sessions
        logger.info("Detected demo user, using demo signout process");
        
        // Extra logging for diagnosis
        const demoSessionData = localStorage.getItem(DEMO_SESSION_KEY);
        logger.debug("Demo session state before clearing", {
          exists: !!demoSessionData,
          truncated: demoSessionData ? demoSessionData.substring(0, 50) + '...' : null
        });
        
        try {
          // Use the proper async signout function
          const signoutSuccess = await signOutDemoUser(setUser, setSession);
          
          logger.info("Demo user signout result", { success: signoutSuccess });
          
          // Verify session was cleared directly through localStorage
          const hasRemainingDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
          const hasRemainingSupabaseSession = localStorage.getItem(SUPABASE_SESSION_KEY) !== null;
          
          logger.debug("Session state after signout", {
            hasRemainingDemoSession,
            hasRemainingSupabaseSession,
            authRelatedKeys: Object.keys(localStorage).filter(key => 
              key.includes('session') || key.includes('supabase') || key.includes('ytk_')
            )
          });
          
          if (!signoutSuccess || hasRemainingDemoSession || hasRemainingSupabaseSession) {
            logger.warn("Demo user signout failed or sessions still exist, using emergency cleanup");
            
            // Emergency cleanup - force clear everything
            localStorage.removeItem(DEMO_SESSION_KEY);
            localStorage.removeItem(SUPABASE_SESSION_KEY);
            
            // Find and clear all session-related keys
            Object.keys(localStorage).forEach(key => {
              if (key.includes('session') || key.includes('supabase')) {
                logger.debug(`Emergency cleanup: removing key ${key}`);
                localStorage.removeItem(key);
              }
            });
            
            // Force React state updates
            setUser(null);
            setSession(null);
            updateCurrentSession(null);
            
            logger.info("Emergency cleanup completed");
          }
        } catch (demoSignoutError) {
          logger.error("Error during demo signout", demoSignoutError);
          
          // Emergency fallback for exceptions - much more thorough cleanup
          Object.keys(localStorage).forEach(key => {
            if (key.includes('session') || key.includes('supabase') || key.includes('youtube-miner')) {
              logger.debug(`Error recovery: removing key ${key}`);
              localStorage.removeItem(key);
            }
          });
          
          // Force React state updates
          setUser(null);
          setSession(null);
          updateCurrentSession(null);
        }
        
        toast({
          title: "Signed out",
          description: "You've been successfully signed out from the demo account",
        });
        return;
      } else if (isDirectAuth) {
        // For direct auth users, just clear the user state
        logger.info("Detected direct auth user, clearing state");
        setUser(null);
        setSession(null);
        
        // Clear the session in our API module
        updateCurrentSession(null);
        
        // Trigger a global auth state refresh
        logger.debug("Triggering global auth state refresh for direct auth user");
        window.dispatchEvent(new Event('auth-state-refresh'));
        
        // Try to restore any preserved anonymous session when signing out
        logger.info("Attempting to restore anonymous session after direct auth signout");
        try {
          const { restorePreservedAnonymousSession } = await import('@/lib/anonymous-session');
          const restoredSession = restorePreservedAnonymousSession();
          
          if (restoredSession) {
            logger.info("Successfully restored anonymous session", { sessionId: restoredSession });
          } else {
            // If no preserved session exists, ensure we clean up properly
            logger.warn("No preserved anonymous session found, clearing anonymous data");
            clearAnonymousSession(false); // permanent clearing
          }
        } catch (restoreError) {
          logger.error("Error restoring anonymous session", restoreError);
          clearAnonymousSession(false); // fallback to permanent clearing
        }
        
        toast({
          title: "Signed out",
          description: "You've been successfully signed out",
        });
        return;
      }
      
      // Before Supabase signout, directly check and preserve any anonymous session
      // Use the constants defined at the module level
      
      // Direct check for anonymous session before any potential logout operations
      const currentAnonymousSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      
      if (currentAnonymousSession) {
        logger.info("Found current anonymous session before Supabase signout", { 
          sessionId: currentAnonymousSession
        });
        
        // Directly preserve without async operations, which can lead to race conditions
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
        logger.debug("Successfully preserved anonymous session before Supabase signout", { 
          sessionId: currentAnonymousSession
        });
      } else {
        logger.info("No anonymous session found to preserve before Supabase signout");
      }
      
      // Now proceed with standard Supabase signout
      logger.info("Using standard Supabase signout");
      const { error } = await supabase.auth.signOut();

      if (error) {
        logger.error("Supabase signout error", error);
        throw error;
      }
      
      // CRITICAL FIX: Explicitly update the React state
      // This ensures the signout is reflected in the UI immediately without relying on Supabase's event system
      logger.debug("Explicitly clearing React state");
      setUser(null);
      setSession(null);
      updateCurrentSession(null);
      
      // Trigger an auth state refresh to ensure the UI updates
      logger.debug("Triggering global auth state refresh");
      window.dispatchEvent(new Event('auth-state-refresh'));
      
      // Double-check if the preserved session still exists after Supabase operations
      const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
      
      if (preservedSession) {
        logger.debug("Found preserved anonymous session after Supabase operations", { 
          sessionId: preservedSession
        });
      } else if (currentAnonymousSession) {
        // If we had a session before but lost it, recreate the preserved key
        logger.warn("Anonymous session was lost during Supabase operations, restoring preservation", {
          sessionId: currentAnonymousSession
        });
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
      }
      
      // Now explicitly restore the anonymous session
      try {
        // First check if we have a preserved session directly
        const sessionToRestore = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
        
        if (sessionToRestore) {
          logger.info("Directly restoring anonymous session", { sessionId: sessionToRestore });
          
          // Restore directly to avoid any async timing issues
          localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionToRestore);
          localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', sessionToRestore);
          localStorage.setItem(ANONYMOUS_SESSION_KEY + '_timestamp', Date.now().toString());
          localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_at', Date.now().toString());
          localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_by', 'signout_direct');
          
          // Clean up preserved session
          localStorage.removeItem(ANONYMOUS_PRESERVED_KEY);
          
          logger.info("Successfully restored anonymous session directly", { 
            sessionId: sessionToRestore,
            timestamp: Date.now()
          });
        } else {
          // Fall back to the helper function if direct method doesn't work
          logger.info("No direct anonymous session found, trying helper function");
          const { restorePreservedAnonymousSession } = await import('@/lib/anonymous-session');
          const restoredSession = restorePreservedAnonymousSession();
          
          if (restoredSession) {
            logger.info("Successfully restored anonymous session via helper", { 
              sessionId: restoredSession
            });
          } else {
            // If no preserved session exists, ensure we clean up any stale data
            logger.warn("No preserved anonymous session found, clearing anonymous data");
            // Import dynamically to avoid circular dependencies
            const { clearAnonymousSession } = await import('@/lib/anonymous-session');
            clearAnonymousSession(false); // false means permanent clearing
          }
        }
      } catch (restoreError) {
        logger.error("Error restoring anonymous session", restoreError);
      }
      
      logger.info("===== SIGN OUT PROCESS COMPLETED =====");
    } catch (error: any) {
      logger.error("Error during signout", error);
      toast({
        title: "Error",
        description: error.message || "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const resetPassword = async (email: string) => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Password reset email sent",
        description: "Please check your email for a password reset link",
      });
    } catch (error: any) {
      toast({
        title: "Password reset failed",
        description: error.message || "Failed to send password reset email",
        variant: "destructive",
      });
    }
  };

  // Retrieve anonymous user data - now deprecated as server tracks all data
  const getLocalData = () => {
    console.warn('getLocalData is deprecated - server now tracks all user data through sessions');
    try {
      // Check for legacy data for migration purposes only
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      return data ? JSON.parse(data) : { videos: [], collections: [], videoCount: 0 };
    } catch (error) {
      console.error('Error retrieving local data:', error);
      return { videos: [], collections: [], videoCount: 0 };
    }
  };

  // Save anonymous user data - now deprecated as server tracks all data
  const setLocalData = (data: any) => {
    console.warn('setLocalData is deprecated - server now tracks all user data through sessions');
    try {
      // This is a no-op now, but we keep the function for backward compatibility
      // with components that might still call it
    } catch (error) {
      console.error('Error in deprecated setLocalData:', error);
    }
  };

  const migrateLocalData = async () => {
    if (!user || !supabase) return;

    try {
      // Import here to avoid circular dependencies
      const { clearAnonymousSession, hasAnonymousSession } = await import('@/lib/anonymous-session');
      
      // Check for both legacy local storage data and newer anonymous session data
      const localData = getLocalData();
      const hasAnonymousSessionData = hasAnonymousSession();

      // Handle old format local data (previous implementation)
      if (Object.keys(localData).length > 0 && localData.videos && localData.videos.length > 0) {
        console.log("Found legacy local data to migrate:", localData.videos.length, "videos");
        
        const response = await fetch('/api/import-anonymous-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userData: localData,
            userId: user.id
          })
        });

        if (response.ok) {
          localStorage.removeItem(LOCAL_STORAGE_KEY);

          toast({
            title: "Data Migration Complete",
            description: "Your previously saved data has been added to your account",
          });
        } else {
          const error = await response.json();
          throw new Error(error.message || 'Legacy data migration failed');
        }
      }
      
      // Handle anonymous session data
      if (hasAnonymousSessionData) {
        console.log("Found anonymous session data to migrate");
        
        // Get the current session ID
        const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
        const sessionId = getOrCreateAnonymousSessionId();
        
        // Call the server endpoint to migrate videos from anonymous session to user account
        const response = await fetch('/api/migrate-anonymous-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-anonymous-session': sessionId
          },
          body: JSON.stringify({
            userId: user.id
          }),
          credentials: 'include'
        });
        
        if (response.ok) {
          const result = await response.json();
          const migratedCount = result.migratedCount || 0;
          
          console.log(`Successfully migrated ${migratedCount} videos from anonymous session to user account`);
          
          if (migratedCount > 0) {
            toast({
              title: "Videos Imported",
              description: `Successfully imported ${migratedCount} videos from your guest session`,
            });
          }
          
          // Clear anonymous session after successful migration
          clearAnonymousSession();
        } else {
          console.error("Error migrating anonymous session data:", await response.text());
          toast({
            title: "Import Failed",
            description: "An error occurred while importing your data",
            variant: "destructive",
          });
        }
        
        toast({
          title: "Anonymous data cleared",
          description: "You're now using your authenticated account",
        });
      }
    } catch (error: any) {
      console.error('Error migrating data:', error);
      toast({
        title: "Data Migration Error",
        description: error.message || "Failed to migrate your anonymous data",
        variant: "destructive",
      });
    }
  };

  // Function to check if anonymous user has reached the video limit
  const hasReachedAnonymousLimit = async () => {
    try {
      // Import here to avoid circular dependencies
      const { hasReachedAnonymousLimit: checkAnonymousLimit, hasReachedAnonymousLimitSync } = await import('@/lib/anonymous-session');
      
      // Use the async function that checks with server first
      return await checkAnonymousLimit();
    } catch (error) {
      console.error("Error checking anonymous limit:", error);
      
      // Fall back to sync version that uses only local cache if async version fails
      const { hasReachedAnonymousLimitSync } = require('@/lib/anonymous-session');
      return hasReachedAnonymousLimitSync();
    }
  };
  
  // Register the refresh callback so it can be called from anywhere in the application
  useEffect(() => {
    // Create a consistent logging style 
    const logger = {
      info: (message: string, data?: any) => {
        console.log(`[Auth] ${message}`, data !== undefined ? data : '');
      },
      warn: (message: string, data?: any) => {
        console.warn(`[Auth] ${message}`, data !== undefined ? data : '');
      },
      error: (message: string, data?: any) => {
        console.error(`[Auth] ${message}`, data !== undefined ? data : '');
      }
    };
    
    logger.info('Registering auth refresh callback');
    registerRefreshCallback(refreshAuthState);
    
    // Listen for auth state refresh events
    const handleAuthStateRefresh = () => {
      logger.info('Received auth state refresh event');
      refreshAuthState();
    };
    
    window.addEventListener('auth-state-refresh', handleAuthStateRefresh);
    
    return () => {
      window.removeEventListener('auth-state-refresh', handleAuthStateRefresh);
    };
  }, [refreshAuthState]);

  return (
    <SupabaseContext.Provider
      value={{
        supabase,
        user,
        session,
        loading,
        signIn,
        signInWithGoogle,
        signInWithMagicLink,
        signUp,
        signOut,
        resetPassword,
        getLocalData,
        setLocalData,
        migrateLocalData,
        hasReachedAnonymousLimit,
        // Export the user state setters for demo auth
        setUser,
        setSession,
      }}
    >
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
}