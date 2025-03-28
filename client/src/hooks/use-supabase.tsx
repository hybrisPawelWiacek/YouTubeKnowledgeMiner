import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { updateCurrentSession } from '@/lib/api';
import { getStoredSession, DEMO_SESSION_KEY } from '@/lib/demo-session';

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
  const { toast } = useToast();

  useEffect(() => {
    const fetchSupabaseConfig = async () => {
      try {
        // Get Supabase configuration from our API
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
          
          // Restore session in the following priority order:
          // 1. Demo session (if exists)
          // 2. Active Supabase session
          // 3. Stored Supabase session
          
          if (demoSession) {
            // Demo sessions take priority over other auth methods
            console.log('[Demo Session] Restoring demo user session');
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

  const signOut = async () => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log("===== SIGN OUT PROCESS STARTING =====");
      console.log("Current user state:", user);
      console.log("User metadata:", user?.user_metadata);
      console.log("Current session state:", session);
      console.log("All localStorage keys:", Object.keys(localStorage));
      
      // ====== CRITICAL FIX: PRE-SIGNOUT ANONYMOUS SESSION PRESERVATION ======
      // First preserve any anonymous session before we import any modules
      // This is crucial as module loading could trigger other actions
      
      // Directly check and save any anonymous session
      const anonymousSessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      if (anonymousSessionId) {
        console.log(`[SignOut] Preserving anonymous session before any imports: ${anonymousSessionId}`);
        
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
          
          console.log(`[SignOut] Successfully preserved anonymous session: ${anonymousSessionId}`);
        } catch (preserveError) {
          console.error("[SignOut] Error preserving anonymous session:", preserveError);
        }
      } else {
        console.log("[SignOut] No anonymous session found to preserve");
      }
      // ====== END CRITICAL FIX ======
      
      // Import helpers to avoid circular dependencies
      const { clearAnonymousSession } = await import('@/lib/anonymous-session');
      const { signOutDemoUser, isDemoUser, clearSession, DEMO_SESSION_KEY } = await import('@/lib/demo-session');
      
      // Check if the current user is a demo user
      const isDemo = isDemoUser(user);
      console.log("Is demo user:", isDemo);
      
      // Check localStorage for demo session
      const hasDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
      console.log("Has demo session in localStorage:", hasDemoSession);
      
      // Check if user was authenticated with direct method (but not a demo)
      const isDirectAuth = !isDemo && user?.user_metadata?.direct_auth === true;
      console.log("Is direct auth user:", isDirectAuth);
      
      if (isDemo || hasDemoSession) {
        // For demo users, use the specialized signout that handles demo sessions
        console.log("[SignOut] Detected demo user, using demo signout process");
        
        // Extra logging for diagnosis
        console.log("Demo session before clearing:", localStorage.getItem(DEMO_SESSION_KEY));
        
        try {
          // Use the proper async signout function
          const signoutSuccess = await signOutDemoUser(setUser, setSession);
          
          console.log("[SignOut] Demo user signout result:", signoutSuccess);
          
          // Verify session was cleared directly through localStorage
          const hasRemainingDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
          const hasRemainingSupabaseSession = localStorage.getItem(SUPABASE_SESSION_KEY) !== null;
          
          console.log("[SignOut] Session state after signout:", {
            hasRemainingDemoSession,
            hasRemainingSupabaseSession,
            allKeys: Object.keys(localStorage)
          });
          
          if (!signoutSuccess || hasRemainingDemoSession || hasRemainingSupabaseSession) {
            console.error("[SignOut] Demo user signout failed or sessions still exist, using emergency cleanup");
            
            // Emergency cleanup - force clear everything
            localStorage.removeItem(DEMO_SESSION_KEY);
            localStorage.removeItem(SUPABASE_SESSION_KEY);
            
            // Find and clear all session-related keys
            Object.keys(localStorage).forEach(key => {
              if (key.includes('session') || key.includes('supabase')) {
                localStorage.removeItem(key);
              }
            });
            
            // Force React state updates
            setUser(null);
            setSession(null);
            updateCurrentSession(null);
            
            console.log("[SignOut] Emergency cleanup completed");
          }
        } catch (demoSignoutError) {
          console.error("[SignOut] Error during demo signout:", demoSignoutError);
          
          // Emergency fallback for exceptions - much more thorough cleanup
          Object.keys(localStorage).forEach(key => {
            if (key.includes('session') || key.includes('supabase') || key.includes('youtube-miner')) {
              console.log(`[SignOut] Error recovery: removing key ${key}`);
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
        console.log("[SignOut] Detected direct auth user, clearing state");
        setUser(null);
        setSession(null);
        
        // Clear the session in our API module
        updateCurrentSession(null);
        
        // Try to restore any preserved anonymous session when signing out
        console.log("[SignOut] Attempting to restore anonymous session after direct auth signout");
        try {
          const { restorePreservedAnonymousSession } = await import('@/lib/anonymous-session');
          const restoredSession = restorePreservedAnonymousSession();
          
          if (restoredSession) {
            console.log("[SignOut] Successfully restored anonymous session:", restoredSession);
          } else {
            // If no preserved session exists, ensure we clean up properly
            console.log("[SignOut] No preserved anonymous session found, clearing anonymous data");
            clearAnonymousSession(false); // permanent clearing
          }
        } catch (restoreError) {
          console.error("[SignOut] Error restoring anonymous session:", restoreError);
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
        console.log(`[SignOut] Found current anonymous session before Supabase signout, preserving: ${currentAnonymousSession}`);
        
        // Directly preserve without async operations, which can lead to race conditions
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
        console.log(`[SignOut] Successfully preserved anonymous session before Supabase signout: ${currentAnonymousSession}`);
      } else {
        console.log("[SignOut] No anonymous session found to preserve before Supabase signout");
      }
      
      // Now proceed with standard Supabase signout
      console.log("[SignOut] Using standard Supabase signout");
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
      
      // Double-check if the preserved session still exists after Supabase operations
      const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
      
      if (preservedSession) {
        console.log(`[SignOut] Found preserved anonymous session after Supabase operations: ${preservedSession}`);
      } else if (currentAnonymousSession) {
        // If we had a session before but lost it, recreate the preserved key
        console.log(`[SignOut] Anonymous session was lost during Supabase operations, restoring preservation: ${currentAnonymousSession}`);
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
      }
      
      // Now explicitly restore the anonymous session
      try {
        // First check if we have a preserved session directly
        const sessionToRestore = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
        
        if (sessionToRestore) {
          console.log(`[SignOut] Directly restoring anonymous session: ${sessionToRestore}`);
          
          // Restore directly to avoid any async timing issues
          localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionToRestore);
          localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', sessionToRestore);
          localStorage.setItem(ANONYMOUS_SESSION_KEY + '_timestamp', Date.now().toString());
          localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_at', Date.now().toString());
          
          // Clean up preserved session
          localStorage.removeItem(ANONYMOUS_PRESERVED_KEY);
          
          console.log(`[SignOut] Successfully restored anonymous session directly: ${sessionToRestore}`);
        } else {
          // Fall back to the helper function if direct method doesn't work
          console.log("[SignOut] No direct anonymous session found, trying helper function");
          const { restorePreservedAnonymousSession } = await import('@/lib/anonymous-session');
          const restoredSession = restorePreservedAnonymousSession();
          
          if (restoredSession) {
            console.log("[SignOut] Successfully restored anonymous session via helper:", restoredSession);
          } else {
            // If no preserved session exists, ensure we clean up any stale data
            console.log("[SignOut] No preserved anonymous session found, clearing anonymous data");
            // Import dynamically to avoid circular dependencies
            const { clearAnonymousSession } = await import('@/lib/anonymous-session');
            clearAnonymousSession(false); // false means permanent clearing
          }
        }
      } catch (restoreError) {
        console.error("[SignOut] Error restoring anonymous session:", restoreError);
      }
      
      console.log("===== SIGN OUT PROCESS COMPLETED =====");
    } catch (error: any) {
      console.error("[SignOut] Error during signout:", error);
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