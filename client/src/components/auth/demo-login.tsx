import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useSupabase } from '@/hooks/use-supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronsUp, BadgePlus, Beaker, Loader2 } from 'lucide-react';
import { loginAsDemoUser as demoAuth } from '@/lib/demo-auth';

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

  // Custom hook to access the Supabase context methods
  const { setUser, setSession, setIsDemoUser } = useSupabase();

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
  
  // Function to log in as a demo user using the dedicated demo auth system
  const handleDemoLogin = async (username: string) => {
    setIsLoading(true);
    
    try {
      // Log the process
      console.log('🔍 [Demo Login] Starting login process for:', username);
      
      // Use our dedicated demo auth system
      const demoSession = await demoAuth(username);
      
      // Also set the user and session in the Supabase context
      // This allows the demo auth to work alongside the Supabase auth
      console.log('🔍 [Demo Login] Setting user in Supabase context');
      setUser(demoSession.user as any);
      
      console.log('🔍 [Demo Login] Setting session in Supabase context');
      setSession(demoSession as any);
      
      // Explicitly set the demo user state to true
      console.log('🔍 [Demo Login] Setting isDemoUser state to true');
      setIsDemoUser(true);
      
      toast({
        title: 'Demo Login Successful',
        description: `You are now logged in as "${demoSession.user.user_metadata?.full_name || demoSession.user.user_metadata?.username}"`,
      });
      
      // Redirect to home page
      console.log('🔍 [Demo Login] Redirecting to home page');
      setLocation('/');
      
    } catch (error: any) {
      console.error('❌ [Demo Login] Error:', error);
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
                onClick={() => handleDemoLogin(user.username)}
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