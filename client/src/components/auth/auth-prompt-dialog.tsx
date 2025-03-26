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
  const { signInWithGoogle, getLocalData } = useSupabase();
  const [anonymousVideoCount, setAnonymousVideoCount] = useState(0);

  const getAnonymousVideoCount = (): number => {
    const localData = getLocalData();
    return localData?.videos?.length || 0;
  };

  useEffect(() => {
    const fetchCount = () => {
      const count = getAnonymousVideoCount();
      setAnonymousVideoCount(count);
    };

    fetchCount();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setIsLoading(false);
    }
  };

  const handleGoToAuth = () => {
    setLocation('/auth');
    onClose();
  };

  const handleRemindLater = () => {
    const suppressUntil = Date.now() + 24 * 60 * 60 * 1000; 
    localStorage.setItem('suppress_auth_prompts_until', suppressUntil.toString());
    if (onContinueAsGuest) {
      onContinueAsGuest();
    }
    onClose();
  };

  const reachedLimit = anonymousVideoCount >= 3;
  let description = promptMessages[promptType].description;
  if (reachedLimit) {
    description = `You've reached the limit of 3 videos as a guest. ${promptMessages[promptType].description}`;
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
          {onContinueAsGuest && (
            <Button
              variant="ghost"
              onClick={handleRemindLater}
              className="sm:order-1"
            >
              Continue as Guest
            </Button>
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