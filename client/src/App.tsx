import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import Library from "@/pages/library";
import Explorer from "@/pages/explorer";
import VideoDetailPage from "@/pages/video/[id]";
import { SupabaseProvider, useSupabase } from "@/hooks/use-supabase";
import { ErrorProvider } from "@/contexts/error-context";
import ErrorBoundary from "@/components/ui/error-boundary";

// Auth callback handler that processes OAuth redirects
function AuthCallback() {
  const [, setLocation] = useLocation();
  const { supabase } = useSupabase();
  
  useEffect(() => {
    // Handle the OAuth callback
    if (supabase) {
      // Supabase will automatically handle the token exchange
      // Just redirect back to home page or profile page
      setLocation("/");
    }
  }, [supabase, setLocation]);
  
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Processing Authentication...</h2>
        <p className="text-gray-600">Please wait while we complete your sign-in.</p>
      </div>
    </div>
  );
}

// This component handles anonymous session management
function SessionManager() {
  const { user, session } = useSupabase();
  const [initialized, setInitialized] = useState(false);
  
  useEffect(() => {
    const manageAnonymousSession = async () => {
      try {
        // Only initialize once to avoid multiple calls
        if (initialized) return;
        
        const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
        const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
        const ANONYMOUS_BACKUP_KEY = ANONYMOUS_SESSION_KEY + '_backup';
        
        // Log the initial state of storage for debugging
        console.log('[SessionManager] Initial storage state:', {
          anonymous: localStorage.getItem(ANONYMOUS_SESSION_KEY),
          preserved: localStorage.getItem(ANONYMOUS_PRESERVED_KEY),
          backup: localStorage.getItem(ANONYMOUS_BACKUP_KEY),
          demo: localStorage.getItem('youtube-miner-demo-session'),
          supabase: localStorage.getItem('youtube-miner-supabase-session'),
          hasUser: !!user,
          hasSession: !!session
        });
        
        // If user is logged in, we want to preserve any anonymous session
        if (user) {
          console.log('[SessionManager] User is logged in, preserving any anonymous session');
          const currentAnonymousSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
          
          if (currentAnonymousSession && !localStorage.getItem(ANONYMOUS_PRESERVED_KEY)) {
            console.log(`[SessionManager] Preserving anonymous session: ${currentAnonymousSession}`);
            localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
            
            // Store additional metadata to help with debugging
            localStorage.setItem(
              ANONYMOUS_PRESERVED_KEY + '_meta',
              JSON.stringify({
                preserved_at: new Date().toISOString(),
                preserved_by: 'SessionManager',
                user_id: user.id,
                is_demo: user.user_metadata?.is_demo || false
              })
            );
            
            // Store the time when we preserved it
            localStorage.setItem(ANONYMOUS_PRESERVED_KEY + '_timestamp', Date.now().toString());
            
            // Clear the current session since user is logged in and we've preserved it
            localStorage.removeItem(ANONYMOUS_SESSION_KEY);
          }
        } 
        // If user is not logged in, check if we need to restore a preserved session
        else if (!user) {
          console.log('[SessionManager] No user logged in, checking if anonymous session needs to be restored');
          
          const currentAnonymousSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
          const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
          
          // If we have a preserved session but no current anonymous session, restore it
          if (preservedSession && !currentAnonymousSession) {
            console.log(`[SessionManager] Restoring preserved session: ${preservedSession}`);
            
            // Directly restore the session
            localStorage.setItem(ANONYMOUS_SESSION_KEY, preservedSession);
            localStorage.setItem(ANONYMOUS_BACKUP_KEY, preservedSession);
            localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_at', Date.now().toString());
            localStorage.setItem(ANONYMOUS_SESSION_KEY + '_last_accessed', Date.now().toString());
            
            // Clear preserved session since we've restored it
            localStorage.removeItem(ANONYMOUS_PRESERVED_KEY);
            localStorage.removeItem(ANONYMOUS_PRESERVED_KEY + '_meta');
            localStorage.removeItem(ANONYMOUS_PRESERVED_KEY + '_timestamp');
            
            console.log('[SessionManager] Anonymous session restored successfully');
          }
          // If we don't have any session at all, initialize one
          else if (!currentAnonymousSession && !preservedSession) {
            // Import dynamically to avoid circular dependencies
            const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
            const newSession = getOrCreateAnonymousSessionId(true);
            console.log(`[SessionManager] Created new anonymous session: ${newSession}`);
          }
        }
        
        setInitialized(true);
      } catch (error) {
        console.error('[SessionManager] Error managing anonymous session:', error);
      }
    };
    
    manageAnonymousSession();
  }, [user, session, initialized]);
  
  // This component doesn't render anything
  return null;
}

function Router() {
  const [, setLocation] = useLocation();
  
  // Listen for custom navigation events to update the router location
  useEffect(() => {
    const handleAppNavigation = (event: Event) => {
      // Type assertion to access custom event details
      const customEvent = event as CustomEvent<{path: string, source: string}>;
      const path = customEvent.detail?.path;
      const source = customEvent.detail?.source;
      
      console.log(`[Router] Custom navigation event: path=${path}, source=${source}`);
      
      if (path) {
        // Update the router location
        setLocation(path);
      }
    };
    
    // Add event listener
    window.addEventListener('app-navigation', handleAppNavigation);
    
    // Cleanup function
    return () => {
      window.removeEventListener('app-navigation', handleAppNavigation);
    };
  }, [setLocation]);
  
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth" component={Auth} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/library" component={Library} />
        <Route path="/explorer" component={Explorer} />
        <Route path="/video/:id" component={VideoDetailPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        <ErrorProvider>
          <SessionManager />
          <Router />
          <Toaster />
        </ErrorProvider>
      </SupabaseProvider>
    </QueryClientProvider>
  );
}

export default App;
