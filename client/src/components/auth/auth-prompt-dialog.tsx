import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { FcGoogle } from 'react-icons/fc';
import { Loader2 } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/hooks/use-supabase';

export type AuthPromptType = 'save_video' | 'analyze_again' | 'access_library';

interface AuthPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  promptType: AuthPromptType;
  onContinueAsGuest?: () => void;
}

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
  const { signInWithGoogle, hasReachedAnonymousLimit } = useSupabase();
  const [anonymousVideoCount, setAnonymousVideoCount] = useState(0);
  const [maxAllowedVideos] = useState(3);

  useEffect(() => {
    // Update video count from server when dialog opens
    if (isOpen) {
      // Fetch the anonymous video count from the server
      const fetchVideoCount = async () => {
        try {
          // Import session utilities to avoid circular dependencies
          const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
          const sessionId = getOrCreateAnonymousSessionId();
          
          // Fetch count from server
          const response = await fetch('/api/anonymous/videos/count', {
            method: 'GET',
            headers: {
              'x-anonymous-session': sessionId
            },
            credentials: 'include'
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data && typeof data.count === 'number') {
              setAnonymousVideoCount(data.count);
            }
          }
        } catch (error) {
          console.error('Error fetching anonymous video count:', error);
          // Set to zero if we couldn't get the count from the server
          setAnonymousVideoCount(0);
        }
      };
      
      fetchVideoCount();
    }
  }, [isOpen]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // The auth state change handler in useSupabase will trigger data migration
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setIsLoading(false);
    }
  };

  const handleGoToAuth = () => {
    setLocation('/auth');
    onClose();
  };

  const handleRemindLater = async () => {
    // Only allow "remind later" if they haven't reached the limit
    const limitReached = await hasReachedAnonymousLimit();
    if (!limitReached) {
      const suppressUntil = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      localStorage.setItem('suppress_auth_prompts_until', suppressUntil.toString());
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
        const limitReached = await hasReachedAnonymousLimit();
        setReachedLimit(limitReached);
      } catch (error) {
        console.error("Error checking anonymous limit:", error);
        setReachedLimit(false);
      }
    };
    
    if (isOpen) {
      checkVideoLimit();
    }
  }, [isOpen, hasReachedAnonymousLimit]);
  
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

        <div className="flex flex-col gap-4 py-2">
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

          {!reachedLimit && (
            <Button variant="default" className="w-full" onClick={handleGoToAuth}>
              {promptMessages[promptType].buttonText}
            </Button>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          {onContinueAsGuest && !reachedLimit && (
            <Button
              variant="ghost"
              onClick={handleRemindLater}
              className="sm:order-1"
            >
              Continue as Guest
            </Button>
          )}
          {reachedLimit && promptType === 'analyze_again' && (
            <div className="text-xs text-muted-foreground mb-2 sm:mb-0">
              You've used {anonymousVideoCount}/{maxAllowedVideos} free videos
            </div>
          )}
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