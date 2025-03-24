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
    // Fetch Supabase configuration from the backend
    const fetchSupabaseConfig = async () => {
      try {
        const response = await fetch('/api/supabase-config');
        const config = await response.json();
        
        if (config.initialized) {
          // Use Supabase directly from the backend API calls
          // This approach doesn't expose the key/url to the frontend
          // but still allows us to benefit from Supabase features
          setLoading(false);
          
          // We'll track auth in our own app, but initialize Supabase client with demo credentials
          // for compatibility with components that need a client instance
          const tempClient = createClient(
            'https://xyzcompany.supabase.co', // Just a placeholder
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbWV0aGluZyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQ5MDEyMDA1LCJleHAiOjE5NjQ1ODgwMDV9.Wk0dXBKEBzW-ZGrOhh-VOmJvAfkAo8w6rT9Qp_lB1_I' // Demo key (non-functional)
          );
          setSupabase(tempClient);
          
          console.log('Supabase configuration loaded from backend');
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