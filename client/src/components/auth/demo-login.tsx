import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useSupabase } from '@/hooks/use-supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronsUp, BadgePlus, Beaker, Loader2 } from 'lucide-react';
import { storeSession } from '@/lib/demo-session';

// Define the demo user types for consistent typing
interface DemoUser {
  username: string;
  displayName: string;
  description: string;
}

export function DemoLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [_, setLocation] = useLocation();

  // Fetch the list of available demo users when the component mounts
  useEffect(() => {
    const fetchDemoUsers = async () => {
      try {
        const response = await fetch('/api/demo-auth/users');
        
        if (!response.ok) {
          throw new Error('Failed to fetch demo users');
        }
        
        const data = await response.json();
        
        if (data.success && data.data.users) {
          setDemoUsers(data.data.users);
        }
      } catch (error) {
        console.error('Error fetching demo users:', error);
        toast({
          title: 'Error',
          description: 'Failed to load demo user options',
          variant: 'destructive',
        });
      } finally {
        setIsFetching(false);
      }
    };
    
    fetchDemoUsers();
  }, []);
  
  // Custom hook to access the method that updates the current session
  const { setUser, setSession } = useSupabase();
  
  // Function to log in as a demo user
  const loginAsDemoUser = async (username: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/demo-auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to log in as demo user');
      }
      
      const { data } = await response.json();
      
      if (!data || !data.id) {
        throw new Error('Invalid response from server');
      }
      
      // Create a mock user and session similar to what we'd get from Supabase
      const demoUser = {
        id: data.id,
        email: data.email,
        user_metadata: {
          username: data.username,
          full_name: data.displayName || data.username,
          direct_auth: true,
          is_demo: true,
          demo_type: data.demoType
        },
        role: 'authenticated',
        aud: 'authenticated',
        app_metadata: {
          provider: 'demo'
        },
      };
      
      const mockSession = {
        user: demoUser,
        access_token: `demo_token_${data.id}`,
        refresh_token: 'demo_refresh_token',
        expires_in: 3600,
        expires_at: Date.now() + 3600000
      };
      
      // Update the user context
      setUser(demoUser as any);
      setSession(mockSession as any);
      
      // Store the demo session in localStorage for persistence across page refreshes
      storeSession(mockSession as any);
      
      console.log('[Demo Login] Demo user session stored successfully');
      
      // Temporarily preserve anonymous session for restoration on logout
      try {
        const { clearAnonymousSession } = await import('@/lib/anonymous-session');
        clearAnonymousSession(true); // true = preserve for later restoration
        console.log('[Demo Login] Anonymous session temporarily preserved for later restoration');
      } catch (error) {
        console.error('[Demo Login] Failed to preserve anonymous session:', error);
      }
      
      toast({
        title: 'Demo Login Successful',
        description: `You are now logged in as "${data.displayName || data.username}"`,
      });
      
      // Redirect to home page
      setLocation('/');
      
    } catch (error: any) {
      console.error('Demo login error:', error);
      toast({
        title: 'Demo Login Failed',
        description: error.message || 'Failed to log in as demo user',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Render loading state while fetching users
  if (isFetching) {
    return (
      <Card className="w-full mt-8 bg-zinc-900">
        <CardHeader>
          <CardTitle>Demo Accounts</CardTitle>
          <CardDescription>Loading available demo accounts...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  // If no demo users found or error occurred
  if (demoUsers.length === 0) {
    return null;
  }
  
  return (
    <Card className="w-full mt-8 bg-zinc-900">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Beaker className="mr-2 h-5 w-5 text-purple-500" />
          Demo Accounts
        </CardTitle>
        <CardDescription>
          Try out the application with these pre-configured demo accounts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {demoUsers.map((user) => (
          <div 
            key={user.username}
            className="border border-zinc-800 rounded-md p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-medium flex items-center">
                  {user.displayName || user.username}
                  {user.username === 'demo_power' ? (
                    <ChevronsUp className="ml-2 h-4 w-4 text-purple-500" />
                  ) : (
                    <BadgePlus className="ml-2 h-4 w-4 text-blue-500" />
                  )}
                </h3>
                <p className="text-sm text-zinc-400">{user.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loginAsDemoUser(user.username)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  'Log in'
                )}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}