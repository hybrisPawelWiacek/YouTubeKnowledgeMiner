import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { updateCurrentSession } from '@/lib/api';

// Key for storing temporary data for anonymous users
const LOCAL_STORAGE_KEY = 'youtube-miner-anonymous-data';

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  getLocalData: () => any;
  setLocalData: (data: any) => void;
  migrateLocalData: () => Promise<void>;
  hasReachedAnonymousLimit: () => Promise<boolean>;
};

const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  user: null,
  session: null,
  loading: true,
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  getLocalData: () => ({}),
  setLocalData: () => {},
  migrateLocalData: async () => {},
  hasReachedAnonymousLimit: async () => false,
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
        const response = await fetch('/api/supabase-config');
        const config = await response.json();

        if (config.initialized) {
          const client = createClient(
            config.url || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyzcompany.supabase.co',
            config.anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9'
          );
          setSupabase(client);

          const { data: { session } } = await client.auth.getSession();
          if (session) {
            setSession(session);
            setUser(session.user);
            // Update the session in the API module for authenticated requests
            updateCurrentSession(session);
          }

          const { data: { subscription } } = client.auth.onAuthStateChange(
            (event, currentSession) => {
              console.log('Auth state changed:', event);
              setSession(currentSession);
              setUser(currentSession?.user || null);
              
              // Keep our API module's session state in sync
              updateCurrentSession(currentSession);

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
              }
            }
          );

          setLoading(false);
          console.log('Supabase configuration loaded from backend');

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
      
      // Check if user was authenticated with direct method
      const isDirectAuth = user?.user_metadata?.direct_auth === true;
      
      if (isDirectAuth) {
        // For direct auth users, just clear the user state
        setUser(null);
        setSession(null);
        
        // Clear the session in our API module
        updateCurrentSession(null);
        
        // Clear any anonymous session when signing out
        console.log("Clearing anonymous session data on direct auth signout");
        clearAnonymousSession();
        
        toast({
          title: "Signed out",
          description: "You've been successfully signed out",
        });
        return;
      }
      
      // Otherwise use standard Supabase signout
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
      
      // Clear any anonymous session when signing out
      // This ensures users who sign out completely start fresh
      console.log("Clearing anonymous session data on supabase signout");
      clearAnonymousSession();
    } catch (error: any) {
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
        signUp,
        signOut,
        resetPassword,
        getLocalData,
        setLocalData,
        migrateLocalData,
        hasReachedAnonymousLimit,
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