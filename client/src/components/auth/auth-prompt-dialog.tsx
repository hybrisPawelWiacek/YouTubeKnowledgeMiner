import { useState } from 'react';
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

// Messages for different prompt types
const promptMessages = {
  save_video: {
    title: "Save Your Progress",
    description: "Create an account to save your analyzed videos and access them anytime.",
    buttonText: "Save and Create Account"
  },
  analyze_again: {
    title: "Analyze More Videos",
    description: "Create an account to analyze unlimited videos and build your knowledge library.",
    buttonText: "Create Account"
  },
  access_library: {
    title: "Access Your Library",
    description: "Create an account to save videos to your library and organize your knowledge.",
    buttonText: "Create Account"
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
  const { signInWithGoogle } = useSupabase();

  // Handle Google sign in
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // The redirect will be handled by the OAuth provider
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setIsLoading(false);
    }
  };

  // Handle navigation to the auth page
  const handleGoToAuth = () => {
    setLocation('/auth');
    onClose();
  };

  // Handle "remind me later" (continue as guest)
  const handleRemindLater = () => {
    // Set a flag in localStorage to suppress prompts for some time
    const suppressUntil = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    localStorage.setItem('suppress_auth_prompts_until', suppressUntil.toString());
    
    if (onContinueAsGuest) {
      onContinueAsGuest();
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{promptMessages[promptType].title}</DialogTitle>
          <DialogDescription>
            {promptMessages[promptType].description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
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
          
          <Button
            variant="default"
            className="w-full"
            onClick={handleGoToAuth}
          >
            Sign Up with Email
          </Button>
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