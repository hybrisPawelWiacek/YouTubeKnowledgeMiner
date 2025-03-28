import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { updateCurrentSession } from '@/lib/api';
import { getDemoSession, signOutDemoUser, DemoUser, DemoSession } from '@/lib/demo-auth';

// Key for storing temporary data for anonymous users
const LOCAL_STORAGE_KEY = 'youtube-miner-anonymous-data';

// Key for storing the last used Supabase session for persistence
const SUPABASE_SESSION_KEY = 'youtube-miner-supabase-session';

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemoUser: boolean;
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
  setIsDemoUser: (isDemoUser: boolean) => void;
};

const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  user: null,
  session: null,
  loading: true,
  isDemoUser: false,
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
  setIsDemoUser: () => {},
});

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Track if this is a demo user
  const [isDemoUser, setIsDemoUser] = useState(false);
  const { toast } = useToast();

  // Effect to update isDemoUser whenever user changes
  useEffect(() => {
    // Check if the current user is a demo user
    if (user?.user_metadata?.is_demo === true) {
      setIsDemoUser(true);
    } else {
      setIsDemoUser(false);
    }
  }, [user]);

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
          
          console.log('🔍 [Session Restore] Starting session restore...');
          console.log('🔍 [Session Restore] Available localStorage keys:', Object.keys(localStorage));
          
          // Check for a stored session in localStorage
          const storedSessionStr = localStorage.getItem(SUPABASE_SESSION_KEY);
          // Also check for a session in the default Supabase key (for backwards compatibility)
          const supabaseAuthToken = localStorage.getItem('supabase.auth.token');
          let storedSession = null;
          
          console.log('🔍 [Session Restore] Primary key session exists:', storedSessionStr ? 'Yes' : 'No');
          console.log('🔍 [Session Restore] Legacy key session exists:', supabaseAuthToken ? 'Yes' : 'No');
          
          try {
            // First check our app's custom key
            if (storedSessionStr) {
              console.log('🔍 [Session Restore] Found stored session in app key, parsing...');
              storedSession = JSON.parse(storedSessionStr);
              console.log('🔍 [Session Restore] Parsed session user:', 
                storedSession?.user?.email,
                'Direct auth:', storedSession?.user?.user_metadata?.direct_auth ? 'Yes' : 'No',
                'Demo user:', storedSession?.user?.user_metadata?.is_demo ? 'Yes' : 'No'
              );
            } 
            // Then check if there's a session in the default Supabase key
            else if (supabaseAuthToken) {
              console.log('🔍 [Session Restore] Found legacy session in Supabase key, attempting to parse...');
              
              // The format might vary, handle both possibilities
              const parsedToken = JSON.parse(supabaseAuthToken);
              
              // Check if it uses the 'currentSession' format or direct session format
              if (parsedToken.currentSession) {
                console.log('🔍 [Session Restore] Legacy session uses currentSession format');
                storedSession = parsedToken.currentSession;
              } else {
                console.log('🔍 [Session Restore] Legacy session uses direct format');
                storedSession = parsedToken;
              }
              
              console.log('🔍 [Session Restore] Legacy session user:', 
                storedSession?.user?.email,
                'Direct auth:', storedSession?.user?.user_metadata?.direct_auth ? 'Yes' : 'No',
                'Demo user:', storedSession?.user?.user_metadata?.is_demo ? 'Yes' : 'No'
              );
              
              // Migrate to our custom key for consistency
              console.log('🔍 [Session Restore] Migrating legacy session to primary key');
              localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(storedSession));
              
              // Don't remove the old key yet for compatibility
              // localStorage.removeItem('supabase.auth.token');
            }
            
            if (storedSession) {
              // Check if this is a demo user session
              const isDemoUser = storedSession?.user?.user_metadata?.is_demo === true;
              const isDirectAuth = storedSession?.user?.user_metadata?.direct_auth === true;
              
              console.log('🔍 [Session Restore] Stored session - Demo user:', isDemoUser ? 'Yes' : 'No', 
                'Direct auth:', isDirectAuth ? 'Yes' : 'No');
              
              if (isDemoUser) {
                console.log('🔍 [Session Restore] Processing demo user session');
                
                // Extra validation for demo users to prevent ghost sessions
                const hasValidToken = storedSession.access_token && 
                  storedSession.access_token.startsWith('demo_token_');
                
                console.log('🔍 [Session Restore] Demo token valid:', hasValidToken ? 'Yes' : 'No');
                console.log('🔍 [Session Restore] Demo user ID present:', storedSession.user?.id ? 'Yes' : 'No');
                
                // If this appears to be an incomplete or invalid demo session, remove it
                if (!hasValidToken || !storedSession.user?.id) {
                  console.warn('❌ [Session Restore] Invalid demo user session found, removing it');
                  localStorage.removeItem(SUPABASE_SESSION_KEY);
                  localStorage.removeItem('supabase.auth.token'); // Also clear legacy key
                  storedSession = null;
                }
              }
            }
          } catch (e) {
            console.error('Error parsing stored session:', e);
            localStorage.removeItem(SUPABASE_SESSION_KEY);
            localStorage.removeItem('supabase.auth.token'); // Also clear legacy key
          }
          
          // Use the active session from Supabase or try to restore from stored session
          if (session) {
            console.log('Active Supabase session found');
            setSession(session);
            setUser(session.user);
            updateCurrentSession(session);
            
            // Update the stored session
            localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
          } else if (storedSession && (storedSession.expires_at > Date.now() || storedSession?.user?.user_metadata?.is_demo === true)) {
            console.log('🔍 [Session Restore] Attempting to restore session from storage');
            
            // Check if this is a demo user session that we should restore directly
            const isDemoUser = storedSession?.user?.user_metadata?.is_demo === true;
            const isDirectAuth = storedSession?.user?.user_metadata?.direct_auth === true;
            
            console.log('🔍 [Session Restore] Session contains - Demo user:', isDemoUser ? 'Yes' : 'No',
              'Direct auth:', isDirectAuth ? 'Yes' : 'No',
              'User ID:', storedSession?.user?.id,
              'Email:', storedSession?.user?.email);
              
            // For demo users, bypass expiration - they can stay logged in indefinitely
            if (isDemoUser) {
              console.log('🔍 [Session Restore] Handling DEMO USER session restoration');
              
              // Extra validation for demo users
              const hasValidToken = storedSession.access_token && 
                storedSession.access_token.startsWith('demo_token_');
              
              if (!hasValidToken) {
                console.error('❌ [Session Restore] Invalid demo token format, regenerating token');
                // Regenerate token instead of failing completely
                storedSession.access_token = `demo_token_${storedSession.user.id}_${Date.now()}`;
                storedSession.refresh_token = 'demo_refresh_token';
                storedSession.expires_at = Date.now() + 3600000; // 1 hour from now
              }
              
              // Log details of the demo session
              console.log('🔍 [Session Restore] Restoring demo user:',
                'ID:', storedSession.user.id,
                'Email:', storedSession.user.email,
                'Token:', storedSession.access_token.substring(0, 15) + '...');
              
              // For demo users, we don't need to validate with Supabase, just restore from localStorage
              console.log('🔍 [Session Restore] Setting session for demo user');
              setSession(storedSession);
              
              console.log('🔍 [Session Restore] Setting user for demo user');
              setUser(storedSession.user);
              
              console.log('🔍 [Session Restore] Updating API session for demo user');
              updateCurrentSession(storedSession);
              
              // Ensure the session is saved in both possible storage locations
              console.log('🔍 [Session Restore] Re-saving demo session to localStorage with both keys');
              localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(storedSession));
              localStorage.setItem('supabase.auth.token', JSON.stringify({
                currentSession: storedSession,
                expiresAt: storedSession.expires_at
              }));
            } else {
              // For regular Supabase users, try to restore the session with Supabase
              console.log('🔍 [Session Restore] Restoring regular Supabase session');
              const { data, error } = await client.auth.setSession({
                access_token: storedSession.access_token,
                refresh_token: storedSession.refresh_token
              });
              
              if (error) {
                console.error('❌ [Session Restore] Error restoring session:', error);
                localStorage.removeItem(SUPABASE_SESSION_KEY);
                localStorage.removeItem('supabase.auth.token');
              } else if (data.session) {
                console.log('🔍 [Session Restore] Successfully restored Supabase session for user:', 
                  data.session.user.email);
                setSession(data.session);
                setUser(data.session.user);
                updateCurrentSession(data.session);
                
                // Ensure it's stored properly
                localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(data.session));
              }
            }
          } else if (storedSession) {
            // Session expired, remove it
            console.log('Stored session expired, removing');
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
      // Import here to avoid circular dependencies
      const { clearAnonymousSession } = await import('@/lib/anonymous-session');
      
      // Check if user was authenticated with direct method (includes demo users)
      const isDirectAuth = user?.user_metadata?.direct_auth === true;
      const isDemoUser = user?.user_metadata?.is_demo === true;
      
      console.log(`Signing out user. Direct auth: ${isDirectAuth}, Demo user: ${isDemoUser}`);
      
      // **** FORCEFUL CLEANUP APPROACH ****
      // Clear ALL possible authentication-related states regardless of user type
      
      // Clear the anonymous session
      console.log('Clearing anonymous session during sign out');
      clearAnonymousSession();
      
      // 1. Clear React state
      setUser(null);
      setSession(null);
      setIsDemoUser(false);
      
      // 2. Clear ALL possible localStorage keys
      localStorage.removeItem(SUPABASE_SESSION_KEY);
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('sb-refresh-token');
      localStorage.removeItem('sb-auth-token');
      localStorage.removeItem('sb-provider-token');
      
      // 3. Clear the session in our API module
      updateCurrentSession(null);
      
      // Handle demo/direct auth users differently
      if (isDirectAuth) {
        toast({
          title: "Signed out",
          description: "You've been successfully signed out",
        });
        
        // Force a complete page refresh for demo users as a failsafe
        if (isDemoUser) {
          console.log("Forcing page reload for demo user logout");
          // Small delay to allow toast to display
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
        
        return;
      }
      
      // For standard Supabase users, also call the Supabase signOut method
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error from Supabase signOut:", error);
        // Continue anyway since we've already cleared all local state
      }
      
      toast({
        title: "Signed out",
        description: "You've been successfully signed out",
      });
      
    } catch (error: any) {
      console.error("Error in signOut function:", error);
      
      // Even if there's an error, try to clear the state as a failsafe
      setUser(null);
      setSession(null);
      setIsDemoUser(false);
      localStorage.removeItem(SUPABASE_SESSION_KEY);
      localStorage.removeItem('supabase.auth.token');
      updateCurrentSession(null);
      
      toast({
        title: "Error",
        description: error.message || "Failed to sign out",
        variant: "destructive",
      });
      
      // Force reload as a last resort
      setTimeout(() => {
        window.location.reload();
      }, 1000);
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
        isDemoUser,
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
        setIsDemoUser,
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