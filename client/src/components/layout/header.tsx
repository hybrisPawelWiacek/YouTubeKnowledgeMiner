import { useSupabase } from "@/hooks/use-supabase";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { FolderOpen, Home, User, LogOut, ChevronDown, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getOrCreateAnonymousSessionId } from "@/lib/anonymous-session";
import { useQuery } from "@tanstack/react-query";
import { logStateChange, dumpStorageSnapshot } from "@/lib/debug-utils";

// Define maximum videos allowed for anonymous users
const MAX_ANONYMOUS_VIDEOS = 3;

export function Header() {
  const { user, signOut } = useSupabase();
  const [location] = useLocation();
  const { toast } = useToast();
  const [anonymousVideoCount, setAnonymousVideoCount] = useState(0);
  const [maxAllowedVideos, setMaxAllowedVideos] = useState(MAX_ANONYMOUS_VIDEOS);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch anonymous session video count from server when not authenticated
  const { data: videoCountData, isLoading: isVideoCountLoading } = useQuery({
    queryKey: ['/api/anonymous/videos/count'],
    queryFn: async () => {
      try {
        // Import to avoid circular dependencies
        const { getAnonymousVideoCountInfo } = await import('@/lib/anonymous-session');
        
        // Get count info using our utility function
        const countInfo = await getAnonymousVideoCountInfo();
        return countInfo;
      } catch (error) {
        console.error('Error fetching anonymous video count:', error);
        return { count: 0, maxAllowed: MAX_ANONYMOUS_VIDEOS };
      }
    },
    enabled: !user, // Only run this query for anonymous users
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnWindowFocus: true,
    retry: 1
  });

  // Track anonymous video count using session-based approach
  useEffect(() => {
    setIsLoading(isVideoCountLoading);
    
    if (!user && videoCountData) {
      if (typeof videoCountData.count === 'number') {
        console.log('[Header] Anonymous video count from server:', videoCountData.count);
        setAnonymousVideoCount(videoCountData.count);
        
        // Update max allowed videos if available from server
        if (typeof videoCountData.maxAllowed === 'number') {
          setMaxAllowedVideos(videoCountData.maxAllowed);
        }
      }
    } else if (user) {
      // Reset counter for authenticated users
      setAnonymousVideoCount(0);
    }
  }, [user, videoCountData, isVideoCountLoading]);

  const isActive = (path: string) => location === path;
  // Always show the counter for anonymous users, even if it's 0/3
  const showVideoCounter = !user;

  const handleSignOut = async () => {
    try {
      // Store the initial user state before logout for comparison
      const initialUserId = user?.id;
      const isDemo = user?.user_metadata?.is_demo === true;
      const isDirect = user?.user_metadata?.direct_auth === true;
      
      logStateChange('Header', 'signOut-start', { 
        userId: initialUserId,
        isDemo,
        isDirect
      });
      
      // Dump state before signOut
      dumpStorageSnapshot();
      
      console.log("===== HEADER: SIGN OUT BUTTON CLICKED =====");
      console.log("Current user before signOut:", user);
      console.log("Is demo user:", isDemo);
      console.log("All localStorage keys before signOut:", Object.keys(localStorage));
      
      // CRITICAL FIX: Directly preserve the anonymous session before starting logout
      // This ensures it's stored correctly regardless of any async timing issues
      const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
      const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
      
      // Check if there's an anonymous session to preserve
      const anonymousSessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      
      if (anonymousSessionId) {
        console.log(`[Header] Directly preserving anonymous session before logout: ${anonymousSessionId}`);
        
        // Preserve the session with metadata for better tracking
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY, anonymousSessionId);
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY + '_timestamp', Date.now().toString());
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY + '_source', 'header_pre_signout');
        
        try {
          localStorage.setItem(ANONYMOUS_PRESERVED_KEY + '_meta', JSON.stringify({
            preserved_at: new Date().toISOString(),
            preserved_by: 'Header.handleSignOut',
            user_id: user?.id,
            is_demo: isDemo
          }));
        } catch (metaError) {
          console.error("[Header] Error storing preservation metadata:", metaError);
        }
        
        console.log(`[Header] Anonymous session successfully preserved: ${anonymousSessionId}`);
      } else {
        console.log("[Header] No anonymous session found to preserve before logout");
      }
      
      // Check demo session health before logout
      const { checkDemoSessionHealth } = await import('@/lib/debug-utils');
      const sessionHealth = checkDemoSessionHealth();
      
      console.log("[Header] Demo session health before signOut:", sessionHealth);
      
      // Call the signOut function
      await signOut();
      
      // Wait a bit to make sure async operations complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log("===== HEADER: After signOut called =====");
      
      // Verify the preserved session still exists
      const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
      
      if (preservedSession) {
        console.log(`[Header] Found preserved anonymous session after signOut: ${preservedSession}`);
        
        // Explicitly restore the anonymous session
        console.log(`[Header] Directly restoring anonymous session: ${preservedSession}`);
        localStorage.setItem(ANONYMOUS_SESSION_KEY, preservedSession);
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', preservedSession);
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_last_accessed', Date.now().toString());
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_at', Date.now().toString());
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_by', 'header_post_signout');
        
        // Clean up preserved session to prevent double restore
        localStorage.removeItem(ANONYMOUS_PRESERVED_KEY);
        localStorage.removeItem(ANONYMOUS_PRESERVED_KEY + '_timestamp');
        localStorage.removeItem(ANONYMOUS_PRESERVED_KEY + '_source');
        localStorage.removeItem(ANONYMOUS_PRESERVED_KEY + '_meta');
        
        console.log(`[Header] Anonymous session successfully restored: ${preservedSession}`);
      } else if (anonymousSessionId) {
        console.log(`[Header] WARNING: Preserved session lost during signOut, recovering from memory: ${anonymousSessionId}`);
        
        // Emergency recovery from memory variable
        localStorage.setItem(ANONYMOUS_SESSION_KEY, anonymousSessionId);
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', anonymousSessionId);
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_emergency_restored', 'true');
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_last_accessed', Date.now().toString());
        
        console.log(`[Header] Anonymous session recovered from memory: ${anonymousSessionId}`);
      } else {
        console.log("[Header] No anonymous session to restore after signOut");
      }
      
      // Clean up any remaining authentication sessions
      if (localStorage.getItem('youtube-miner-demo-session') || localStorage.getItem('youtube-miner-supabase-session')) {
        console.log("[Header] Cleaning up remaining auth sessions");
        localStorage.removeItem('youtube-miner-demo-session');
        localStorage.removeItem('youtube-miner-supabase-session');
        localStorage.removeItem('youtube-miner-demo-session:timestamp');
      }
      
      // Dump state after signOut
      dumpStorageSnapshot();
      console.log("===== HEADER: SIGN OUT PROCESS COMPLETED =====");
      
      toast({
        title: "Signed out",
        description: "You have been successfully signed out",
      });
      
      // IMPORTANT: Instead of checking React state (which might not be updated yet),
      // check direct indicators of session persistence and handle gracefully
      
      // Try to restore anonymous session without page reload
      try {
        const { restorePreservedAnonymousSession } = await import('@/lib/anonymous-session');
        const restoredSession = restorePreservedAnonymousSession();
        
        if (restoredSession) {
          console.log("[Header] Successfully restored anonymous session after logout:", restoredSession);
          
          // Use history API to navigate to home without full page reload
          window.history.pushState({}, '', '/');
          // Dispatch a custom event to notify components about the navigation
          window.dispatchEvent(new CustomEvent('app-navigation', { 
            detail: { path: '/', source: 'header-signout' } 
          }));
        } else {
          console.log("[Header] No anonymous session restored, navigating to home");
          
          // Use history API to navigate to home without full page reload
          window.history.pushState({}, '', '/');
          // Dispatch a custom event to notify components about the navigation
          window.dispatchEvent(new CustomEvent('app-navigation', { 
            detail: { path: '/', source: 'header-signout-no-session' } 
          }));
        }
      } catch (error) {
        console.error("[Header] Error in post-logout anonymous session restoration:", error);
        
        // Even on error, try to navigate without a page reload
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new CustomEvent('app-navigation', { 
          detail: { path: '/', source: 'header-signout-error' } 
        }));
      }
    } catch (error) {
      console.error("Error signing out:", error);
      logStateChange('Header', 'signOut-error', { error });
      
      toast({
        title: "Sign out failed",
        description: "There was a problem signing you out",
        variant: "destructive",
      });
    }
  };

  return (
    <header className="bg-zinc-900 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
                <svg
                  className="text-primary h-8 w-8 mr-2"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                <h1 className="text-xl font-bold text-white hidden sm:block">YouTubeKnowledgeMiner</h1>
                <h1 className="text-xl font-bold text-white sm:hidden">YT Miner</h1>
            </Link>
            
            {/* Navigation links */}
            <nav className="ml-6 flex space-x-4">
              <Link href="/">
                <Button 
                  variant={isActive("/") ? "default" : "ghost"} 
                  size="sm"
                  className="flex items-center"
                >
                  <Home className="h-4 w-4 mr-1" />
                  <span>Home</span>
                </Button>
              </Link>
              <Link href="/library">
                <Button 
                  variant={isActive("/library") ? "default" : "ghost"} 
                  size="sm"
                  className="flex items-center"
                >
                  <FolderOpen className="h-4 w-4 mr-1" />
                  <span>Library</span>
                  {showVideoCounter && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {anonymousVideoCount}/{maxAllowedVideos}
                    </Badge>
                  )}
                </Button>
              </Link>
              <Link href="/explorer">
                <Button 
                  variant={isActive("/explorer") ? "default" : "ghost"} 
                  size="sm"
                  className="flex items-center"
                >
                  <Search className="h-4 w-4 mr-1" />
                  <span>Explorer</span>
                </Button>
              </Link>
            </nav>
          </div>

          <div className="flex items-center">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <div className="flex items-center">
                      {user.user_metadata?.avatar_url ? (
                        <img 
                          src={user.user_metadata.avatar_url} 
                          alt="Profile" 
                          className="w-8 h-8 rounded-full object-cover border border-primary/30"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white font-medium">
                            {user.email ? user.email[0].toUpperCase() : "U"}
                          </span>
                        </div>
                      )}
                      <span className="ml-2 text-sm text-gray-300 hidden sm:inline">
                        {user.user_metadata?.full_name || user.email}
                      </span>
                      <ChevronDown className="h-4 w-4 ml-1 text-gray-400" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <div className="px-3 py-2">
                    <div className="flex items-center space-x-3">
                      {user.user_metadata?.avatar_url ? (
                        <img 
                          src={user.user_metadata.avatar_url} 
                          alt="Profile" 
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white font-medium">
                            {user.email ? user.email[0].toUpperCase() : "U"}
                          </span>
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user.user_metadata?.full_name || 'User'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-none">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <DropdownMenuSeparator />
                  
                  <div className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Account Provider: {user.app_metadata?.provider || 'Email'}
                  </div>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem className="cursor-pointer flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    <span>My Profile</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="cursor-pointer flex items-center text-red-600 dark:text-red-400"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/auth">
                <Button variant="secondary" size="sm">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
