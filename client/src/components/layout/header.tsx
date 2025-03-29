import { useSupabase } from "@/hooks/use-supabase";
import { useAuth } from "@/hooks/use-auth";
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

// Define maximum videos allowed for anonymous users
const MAX_ANONYMOUS_VIDEOS = 3;

export function Header() {
  const { user: supabaseUser, signOut: supabaseSignOut } = useSupabase();
  const { user: authUser, isAuthenticated, logout: authLogout } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const [anonymousVideoCount, setAnonymousVideoCount] = useState(0);
  const [maxAllowedVideos, setMaxAllowedVideos] = useState(MAX_ANONYMOUS_VIDEOS);
  const [isLoading, setIsLoading] = useState(true);
  
  // Get the active user from either auth system
  // Get the active user from either auth system, with type checking
  const user = authUser || supabaseUser;
  
  // Helper function to safely check for metadata
  const getUserName = () => {
    if (supabaseUser?.user_metadata?.full_name) {
      return supabaseUser.user_metadata.full_name;
    } else if (authUser?.username) {
      return authUser.username;
    } else if (supabaseUser?.email) {
      return supabaseUser.email;
    } else if (authUser?.email) {
      return authUser.email;
    }
    return 'User';
  };
  
  // Helper function to safely get avatar
  const getUserAvatar = () => {
    return supabaseUser?.user_metadata?.avatar_url || null;
  };
  
  // Helper function to get email
  const getUserEmail = () => {
    return authUser?.email || supabaseUser?.email || '';
  };
  
  // Helper function to get first letter for avatar
  const getAvatarLetter = () => {
    const email = getUserEmail();
    return email ? email[0].toUpperCase() : 'U';
  };
  
  // Helper function to get auth provider
  const getAuthProvider = () => {
    if (supabaseUser?.app_metadata?.provider) {
      return supabaseUser.app_metadata.provider;
    }
    return authUser ? 'Custom' : 'Email';
  };

  // Fetch anonymous session video count from server when not authenticated
  const { data: videoCountData, isLoading: isVideoCountLoading } = useQuery({
    queryKey: ['/api/videos/count'],
    queryFn: async () => {
      try {
        // Import to avoid circular dependencies
        const { getAnonymousVideoCountInfo } = await import('@/lib/anonymous-session');
        
        // Get count info using our utility function with a direct API call
        const sessionId = getOrCreateAnonymousSessionId();
        const headers = { 'x-anonymous-session': sessionId };
        
        // Add cache-busting to prevent 304 responses
        const cacheBuster = `?_t=${Date.now()}`;
        const response = await fetch(`/api/videos/count${cacheBuster}`, {
          method: 'GET',
          headers,
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching video count: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[Header] Video count response:', data);
        
        if (data && typeof data.count === 'number') {
          return {
            count: data.count,
            maxAllowed: typeof data.max_allowed === 'number' ? data.max_allowed : MAX_ANONYMOUS_VIDEOS
          };
        }
        
        return { count: 0, maxAllowed: MAX_ANONYMOUS_VIDEOS };
      } catch (error) {
        console.error('Error fetching anonymous video count:', error);
        return { count: 0, maxAllowed: MAX_ANONYMOUS_VIDEOS };
      }
    },
    enabled: !user, // Only run this query for anonymous users
    refetchInterval: 10000, // Refetch every 10 seconds
    refetchOnWindowFocus: true,
    staleTime: 5000, // Consider data stale after 5 seconds
    retry: 2
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
      // Try to sign out using both auth systems
      if (authUser) {
        await authLogout();
      } else if (supabaseUser) {
        await supabaseSignOut();
      }
      
      toast({
        title: "Signed out",
        description: "You have been successfully signed out",
      });
    } catch (error) {
      console.error("Error signing out:", error);
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
                      {getUserAvatar() ? (
                        <img 
                          src={getUserAvatar()!} 
                          alt="Profile" 
                          className="w-8 h-8 rounded-full object-cover border border-primary/30"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white font-medium">
                            {getAvatarLetter()}
                          </span>
                        </div>
                      )}
                      <span className="ml-2 text-sm text-gray-300 hidden sm:inline">
                        {getUserName()}
                      </span>
                      <ChevronDown className="h-4 w-4 ml-1 text-gray-400" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <div className="px-3 py-2">
                    <div className="flex items-center space-x-3">
                      {getUserAvatar() ? (
                        <img 
                          src={getUserAvatar()!} 
                          alt="Profile" 
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white font-medium">
                            {getAvatarLetter()}
                          </span>
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {getUserName()}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-none">
                          {getUserEmail()}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <DropdownMenuSeparator />
                  
                  <div className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Account Provider: {getAuthProvider()}
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
