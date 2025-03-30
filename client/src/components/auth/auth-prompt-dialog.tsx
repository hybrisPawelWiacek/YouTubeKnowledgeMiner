/**
 * Authentication Prompt Dialog
 * 
 * A strategic dialog that prompts anonymous users to create an account 
 * at key moments in the user journey. This component is shown when users:
 * 1. Reach 2 videos (warning about 3-video limit)
 * 2. Attempt to access library management features
 * 3. Try to use premium features like export
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { FcGoogle } from 'react-icons/fc';
import { Loader2, ChevronRight } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { getAnonymousVideoCountInfo } from '@/lib/anonymous-session';

export type AuthPromptType = 'save_video' | 'analyze_again' | 'access_library' | 'export';

interface AuthPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  promptType: AuthPromptType;
  onContinueAsGuest?: () => void;
}

// Prompt content customized by prompt type
const promptMessages = {
  save_video: {
    title: "Save Your Knowledge",
    description: "Your video analysis is ready! Create an account to save this insight and build your personal knowledge base that syncs across all your devices.",
    benefits: [
      "Access your analyzed videos anytime, anywhere",
      "Organize insights with collections and categories",
      "Never lose valuable knowledge extracted from videos"
    ],
    buttonText: "Save and Create Account",
    icon: "💾"
  },
  analyze_again: {
    title: "Unlock Unlimited Analysis",
    description: "You've discovered how powerful our AI analysis is! Create an account to analyze unlimited videos and build a searchable knowledge library.",
    benefits: [
      "Analyze unlimited videos with advanced AI",
      "Search across all your video transcripts and notes",
      "Extract key insights automatically with our AI"
    ],
    buttonText: "Create Account & Continue",
    icon: "🔍"
  },
  access_library: {
    title: "Your Personal Knowledge Hub",
    description: "Create an account to organize all your video insights in one searchable library. Your analyzed content will be stored securely in your account.",
    benefits: [
      "Create custom collections to organize videos",
      "Tag and categorize videos for easy retrieval",
      "Powerful search across all your saved content"
    ],
    buttonText: "Create Your Library",
    icon: "📚"
  },
  export: {
    title: "Enhanced Export Options",
    description: "Create an account to unlock advanced export options and save your insights in multiple formats.",
    benefits: [
      "Export to PDF, Markdown, and more formats",
      "Include custom formatting and branding",
      "Share insights with your team or colleagues"
    ],
    buttonText: "Unlock Export Features",
    icon: "📤"
  }
};

export function AuthPromptDialog({ 
  isOpen, 
  onClose, 
  promptType, 
  onContinueAsGuest 
}: AuthPromptDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, login } = useAuth();
  const [anonymousVideoCount, setAnonymousVideoCount] = useState(0);
  const [maxAllowedVideos, setMaxAllowedVideos] = useState(3);

  // Fetch video count when dialog opens
  useEffect(() => {
    if (isOpen) {
      const fetchVideoCount = async () => {
        try {
          const { count, maxAllowed } = await getAnonymousVideoCountInfo();
          setAnonymousVideoCount(count);
          setMaxAllowedVideos(maxAllowed);
        } catch (error) {
          console.error('Error fetching anonymous video count:', error);
          setAnonymousVideoCount(0);
        }
      };
      
      fetchVideoCount();
    }
  }, [isOpen]);

  // Handle Google Sign In (placeholder - needs to be replaced with your implementation)
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      // This would need to be replaced with your Google OAuth implementation
      console.log('Google sign-in clicked - not implemented in this basic version');
      
      // Redirect to auth page as fallback
      setLocation('/auth');
      onClose();
    } catch (error) {
      console.error('Error with sign in:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate to auth page
  const handleGoToAuth = () => {
    setLocation('/auth');
    onClose();
  };

  // Handle "remind me later" option
  const handleRemindLater = async () => {
    // Only allow "remind later" if they haven't reached the limit
    const { count, maxAllowed } = await getAnonymousVideoCountInfo();
    const limitReached = count >= maxAllowed;
    
    if (!limitReached) {
      // Suppress prompts for 24 hours
      const suppressUntil = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('suppress_auth_prompts_until', suppressUntil.toString());
      
      // Call the continue callback if provided
      if (onContinueAsGuest) {
        onContinueAsGuest();
      }
    }
    
    onClose();
  };

  // State for tracking limit status
  const [reachedLimit, setReachedLimit] = useState(false);
  
  // Check if user has reached the video limit
  useEffect(() => {
    const checkVideoLimit = async () => {
      try {
        const { count, maxAllowed } = await getAnonymousVideoCountInfo();
        setReachedLimit(count >= maxAllowed);
      } catch (error) {
        console.error("Error checking anonymous limit:", error);
        setReachedLimit(false);
      }
    };
    
    if (isOpen) {
      checkVideoLimit();
    }
  }, [isOpen]);
  
  // Customize message based on limit status
  let description = promptMessages[promptType].description;
  if (reachedLimit) {
    // More explicit message when limit is reached
    if (promptType === 'analyze_again') {
      description = `You've reached the limit of ${maxAllowedVideos} videos as a guest user. Create an account to analyze unlimited videos and access your library from any device.`;
    } else {
      description = `You've reached the limit of ${maxAllowedVideos} videos as a guest. ${promptMessages[promptType].description}`;
    }
  }

  // If user is already authenticated, don't show the dialog
  useEffect(() => {
    if (isAuthenticated && user && isOpen) {
      onClose();
    }
  }, [isAuthenticated, user, isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl" aria-hidden="true">{promptMessages[promptType].icon}</span>
            <DialogTitle>{promptMessages[promptType].title}</DialogTitle>
          </div>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Video Usage Indicator */}
        {promptType === 'analyze_again' && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Anonymous videos</span>
              <span className="font-medium">{anonymousVideoCount}/{maxAllowedVideos}</span>
            </div>
            <div className={`relative rounded-full overflow-hidden h-2 bg-muted ${reachedLimit ? "bg-destructive/20" : ""}`}>
              <div 
                className={`h-full bg-primary ${reachedLimit ? "bg-destructive" : ""}`}
                style={{ width: `${(anonymousVideoCount / maxAllowedVideos) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {reachedLimit 
                ? "You've reached the video limit for anonymous users" 
                : `${maxAllowedVideos - anonymousVideoCount} more videos available before reaching limit`
              }
            </p>
          </div>
        )}

        {/* Benefits Section */}
        <div className="bg-muted/50 p-4 rounded-lg mb-4">
          <p className="text-sm font-medium mb-2">Benefits:</p>
          <ul className="space-y-2">
            {promptMessages[promptType].benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="text-primary" aria-hidden="true">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 py-2">
          {/* Google Sign In Button */}
          <Button
            variant="outline"
            className="w-full bg-white text-black hover:bg-gray-100 border-gray-300 flex items-center justify-center gap-2 h-10"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FcGoogle className="h-5 w-5" />
            )}
            <span>{isLoading ? "Signing in..." : "Continue with Google"}</span>
          </Button>

          {/* Create Account Button */}
          <Button 
            variant="default" 
            className="w-full"
            onClick={handleGoToAuth}
          >
            <span>{promptMessages[promptType].buttonText}</span>
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Footer */}
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          {/* Continue as Guest Option */}
          {onContinueAsGuest && !reachedLimit && (
            <Button
              variant="ghost"
              onClick={handleRemindLater}
              className="sm:order-1"
            >
              Continue as Guest
            </Button>
          )}
          
          {/* Video Limit Indicator */}
          {reachedLimit && promptType === 'analyze_again' && (
            <div className="text-xs text-destructive mb-2 sm:mb-0">
              You've used {anonymousVideoCount}/{maxAllowedVideos} free videos
            </div>
          )}
          
          {/* Already have an account link */}
          <Button
            variant="link"
            onClick={handleGoToAuth}
            className="sm:order-2"
          >
            Already have an account? Sign in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}