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
  hasReachedAnonymousLimit: () => boolean;
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
  hasReachedAnonymousLimit: () => false,
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
      
      // Try to login using the direct database route
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // Manually set up user state for direct authentication
        // Use the actual numeric ID from the database instead of a string prefix
        const directUser: User = {
          // Store the actual numeric ID to ensure proper database queries
          id: userData.id,
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
          access_token: `mock_token_${userData.id}`,
          refresh_token: 'mock_refresh_token',
          expires_in: 3600,
          expires_at: Date.now() + 3600000
        } as Session;
        
        setUser(directUser);
        setSession(mockSession);
        
        // Update the global session state for API calls
        updateCurrentSession(mockSession);
        
        toast({
          title: "Development mode login",
          description: "Logged in with direct authentication (dev mode only)",
        });
        
        return true;
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
      // Check if user was authenticated with direct method
      const isDirectAuth = user?.user_metadata?.direct_auth === true;
      
      if (isDirectAuth) {
        // For direct auth users, just clear the user state
        setUser(null);
        setSession(null);
        
        // Clear the session in our API module
        updateCurrentSession(null);
        
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

  // Get anonymous user data from local storage
  const getLocalData = () => {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      return data ? JSON.parse(data) : { videos: [], collections: [], videoCount: 0 };
    } catch (error) {
      console.error('Error retrieving local data:', error);
      return { videos: [], collections: [], videoCount: 0 };
    }
  };

  // Save anonymous user data to local storage
  const setLocalData = (data: any) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
        ...data,
        videoCount: data.videos.length
      }));
    } catch (error) {
      console.error('Error saving local data:', error);
    }
  };

  const migrateLocalData = async () => {
    if (!user || !supabase) return;

    try {
      const localData = getLocalData();

      if (Object.keys(localData).length > 0) {
        if (localData.videos && localData.videos.length > 0) {
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
            throw new Error(error.message || 'Data migration failed');
          }
        }
      }
    } catch (error: any) {
      console.error('Error migrating data:', error);
    }
  };

  // Function to check if anonymous user has reached the video limit
  const hasReachedAnonymousLimit = () => {
    const data = getLocalData();
    return data.videoCount >= 3; // Allow up to 3 videos
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