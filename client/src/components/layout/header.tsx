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
import { useAuth } from "@/contexts/auth-context";

// Define maximum videos allowed for anonymous users
const MAX_ANONYMOUS_VIDEOS = 3;

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();
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
    enabled: !isAuthenticated, // Only run this query for anonymous users
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnWindowFocus: true,
    retry: 1
  });

  // Track anonymous video count using session-based approach
  useEffect(() => {
    setIsLoading(isVideoCountLoading);
    
    if (!isAuthenticated && videoCountData) {
      if (typeof videoCountData.count === 'number') {
        console.log('[Header] Anonymous video count from server:', videoCountData.count);
        setAnonymousVideoCount(videoCountData.count);
        
        // Update max allowed videos if available from server
        if (typeof videoCountData.maxAllowed === 'number') {
          setMaxAllowedVideos(videoCountData.maxAllowed);
        }
      }
    } else if (isAuthenticated) {
      // Reset counter for authenticated users
      setAnonymousVideoCount(0);
    }
  }, [isAuthenticated, videoCountData, isVideoCountLoading]);

  const isActive = (path: string) => location === path;
  // Always show the counter for anonymous users, even if it's 0/3
  const showVideoCounter = !isAuthenticated;

  const handleSignOut = async () => {
    try {
      await logout();
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
                <h1 className="text-xl font-bold text-white hidden sm:block">YouTube Buddy</h1>
                <h1 className="text-xl font-bold text-white sm:hidden">YT Buddy</h1>
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
            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-white font-medium">
                          {user.username ? user.username[0].toUpperCase() : user.email ? user.email[0].toUpperCase() : "U"}
                        </span>
                      </div>
                      <span className="ml-2 text-sm text-gray-300 hidden sm:inline">
                        {user.username || user.email}
                      </span>
                      <ChevronDown className="h-4 w-4 ml-1 text-gray-400" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <div className="px-3 py-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-white font-medium">
                          {user.username ? user.username[0].toUpperCase() : user.email ? user.email[0].toUpperCase() : "U"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user.username || 'User'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-none">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <DropdownMenuSeparator />
                  
                  <div className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Account Type: {user.role || 'Registered User'}
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
