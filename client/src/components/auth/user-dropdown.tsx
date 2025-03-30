/**
 * User Dropdown Component
 * 
 * Displays a dropdown menu for authenticated users with options to:
 * - View profile
 * - Manage account settings
 * - Log out
 * 
 * For anonymous users, displays login/register options.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { 
  User, 
  LogOut, 
  Settings, 
  Library, 
  HelpCircle,
  ChevronDown
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface UserDropdownProps {
  onLoginClick?: () => void;
}

export function UserDropdown({ onLoginClick }: UserDropdownProps) {
  const { user, isAuthenticated, isAnonymous, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  // Handle login click
  const handleLoginClick = () => {
    setIsOpen(false);
    if (onLoginClick) {
      onLoginClick();
    } else {
      setLocation('/auth');
    }
  };

  // Handle register click
  const handleRegisterClick = () => {
    setIsOpen(false);
    setLocation('/auth?tab=register');
  };

  // Handle logout click
  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    setLocation('/');
  };

  // Handle navigation clicks
  const handleNavigation = (path: string) => {
    setIsOpen(false);
    setLocation(path);
  };

  // Get user's initials for avatar fallback
  const getUserInitials = (): string => {
    if (!user) return 'G'; // Guest
    
    const username = user.username;
    if (!username) return '?';
    
    return username.substring(0, 2).toUpperCase();
  };

  // Get display name for the dropdown label
  const getDisplayName = (): string => {
    if (!user) return 'Guest';
    return user.username || 'User';
  };

  if (isAuthenticated) {
    // Authenticated user dropdown
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-2 gap-2 items-center">
            <Avatar className="h-6 w-6">
              <AvatarFallback>{getUserInitials()}</AvatarFallback>
            </Avatar>
            <span>{getDisplayName()}</span>
            <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => handleNavigation('/profile')}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => handleNavigation('/library')}>
            <Library className="mr-2 h-4 w-4" />
            <span>My Library</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => handleNavigation('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => handleNavigation('/help')}>
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>Help & Support</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  } else {
    // Anonymous user or not logged in
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-2 gap-2 items-center">
            <Avatar className="h-6 w-6">
              <AvatarFallback>G</AvatarFallback>
            </Avatar>
            <span>{isAnonymous ? "Guest" : "Sign In"}</span>
            <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {isAnonymous ? (
            <>
              <DropdownMenuLabel>Guest User</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLoginClick}>
                <User className="mr-2 h-4 w-4" />
                <span>Sign In</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRegisterClick}>
                <User className="mr-2 h-4 w-4" />
                <span>Create Account</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => handleNavigation('/help')}
                className="text-muted-foreground"
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                <span>Help & Support</span>
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={handleLoginClick}>
                <User className="mr-2 h-4 w-4" />
                <span>Sign In</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRegisterClick}>
                <User className="mr-2 h-4 w-4" />
                <span>Create Account</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}