import { useSupabase } from "@/hooks/use-supabase";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { FolderOpen, Home, User, LogOut, ChevronDown } from "lucide-react";
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

export function Header() {
  const { user, signOut, getLocalData } = useSupabase();
  const [location] = useLocation();
  const { toast } = useToast();
  const [anonymousVideoCount, setAnonymousVideoCount] = useState(0);
  const [maxAllowedVideos] = useState(3); // Maximum videos allowed for anonymous users

  // Track anonymous video count
  useEffect(() => {
    if (!user) {
      const localData = getLocalData();
      setAnonymousVideoCount(localData.videos?.length || 0);

      // Setup localStorage change listener
      const handleStorageChange = () => {
        const updatedData = getLocalData();
        setAnonymousVideoCount(updatedData.videos?.length || 0);
      };

      window.addEventListener('storage', handleStorageChange);
      
      // Also poll for changes every 5 seconds (as localStorage events don't fire in the same tab)
      const interval = setInterval(() => {
        const updatedData = getLocalData();
        setAnonymousVideoCount(updatedData.videos?.length || 0);
      }, 5000);

      return () => {
        window.removeEventListener('storage', handleStorageChange);
        clearInterval(interval);
      };
    }
  }, [user, getLocalData]);

  const isActive = (path: string) => location === path;
  const showVideoCounter = !user && anonymousVideoCount > 0;

  const handleSignOut = async () => {
    try {
      await signOut();
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
