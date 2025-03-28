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
      
      // Check demo session health before logout
      const { checkDemoSessionHealth } = await import('@/lib/debug-utils');
      const sessionHealth = checkDemoSessionHealth();
      
      console.log("[Header] Demo session health before signOut:", sessionHealth);
      
      // Standard check for demo session existence
      const hasDemoSession = localStorage.getItem('youtube-miner-demo-session') !== null;
      console.log("[Header] Has demo session before signOut:", hasDemoSession);
      
      // Call the signOut function
      await signOut();
      
      // THIS IS THE CRUCIAL CHANGE: In React, state updates are asynchronous
      // Instead of checking the React state (which won't have updated yet),
      // we need to directly check localStorage and other indicators
      
      // Wait a bit longer to make sure any async operations complete
      await new Promise(resolve => setTimeout(resolve, 150));
      
      console.log("After signOut called");
      
      // Check again for demo session
      const hasDemoSessionAfter = localStorage.getItem('youtube-miner-demo-session') !== null;
      console.log("Has demo session after signOut:", hasDemoSessionAfter);
      
      // Use the health checker again to verify session state
      const sessionHealthAfter = checkDemoSessionHealth();
      console.log("[Header] Demo session health after signOut:", sessionHealthAfter);
      
      // Check localStorage directly for any remaining sessions
      const hasAnySessionData = Object.keys(localStorage).some(key => 
        key.includes('session') || key.includes('supabase')
      );
      
      // Force an additional clear if session persists
      if (hasDemoSessionAfter || hasAnySessionData) {
        console.log("WARNING: Session data still exists after signOut, forcing cleanup");
        localStorage.removeItem('youtube-miner-demo-session');
        localStorage.removeItem('youtube-miner-supabase-session');
        localStorage.removeItem('youtube-miner-demo-session:timestamp');
        
        // Additional cleanup for any other session-related data
        Object.keys(localStorage).forEach(key => {
          if (key.includes('session') || key.includes('supabase')) {
            console.log(`Removing persistent key: ${key}`);
            localStorage.removeItem(key);
          }
        });
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
      
      // Try to restore anonymous session before taking drastic measures
      try {
        const { restorePreservedAnonymousSession } = await import('@/lib/anonymous-session');
        const restoredSession = restorePreservedAnonymousSession();
        
        if (restoredSession) {
          console.log("[Header] Successfully restored anonymous session after logout:", restoredSession);
          // No need for page reload, the app will automatically update with anonymous state
          setTimeout(() => {
            window.location.href = '/';
          }, 150);
        } else if (hasDemoSessionAfter || hasAnySessionData) {
          console.log("WARNING: Session data persists after cleanup, forcing page reload");
          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          // Force navigation to home page to ensure clean state
          setTimeout(() => {
            window.location.href = '/';
          }, 150);
        }
      } catch (error) {
        console.error("[Header] Error in post-logout anonymous session restoration:", error);
        // Fall back to basic page reload if restoration fails
        setTimeout(() => {
          window.location.reload();
        }, 500);
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
