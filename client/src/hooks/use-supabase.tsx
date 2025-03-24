import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  user: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize Supabase client
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      setSupabase(client);
      
      // Check for existing session
      (async () => {
        try {
          const { data, error } = await client.auth.getSession();
          if (error) {
            throw error;
          }
          
          if (data.session) {
            const { data: userData } = await client.auth.getUser();
            setUser(userData.user);
          }
        } catch (error) {
          console.error('Error checking auth session:', error);
        } finally {
          setLoading(false);
        }
      })();
      
      // Subscribe to auth changes
      const { data: { subscription } } = client.auth.onAuthStateChange(
        async (event, session) => {
          if (session) {
            setUser(session.user);
          } else {
            setUser(null);
          }
          setLoading(false);
        }
      );
      
      return () => {
        subscription.unsubscribe();
      };
    } else {
      console.warn('Supabase credentials not found in environment variables');
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Success",
        description: "Signed in successfully",
      });
    } catch (error: any) {
      toast({
        title: "Authentication failed",
        description: error.message || "Failed to sign in",
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
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Signed out",
        description: "You have been signed out successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  return (
    <SupabaseContext.Provider
      value={{
        supabase,
        user,
        loading,
        signIn,
        signUp,
        signOut,
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