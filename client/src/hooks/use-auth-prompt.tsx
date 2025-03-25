import { useState, useCallback, useEffect } from 'react';
import { useSupabase } from './use-supabase';
import { AuthPromptType } from '@/components/auth/auth-prompt-dialog';

export function useAuthPrompt() {
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [promptType, setPromptType] = useState<AuthPromptType>('save_video');
  const { user, loading } = useSupabase();
  
  // Check if auth prompts are temporarily suppressed
  const areSuppressed = useCallback(() => {
    const suppressUntil = localStorage.getItem('suppress_auth_prompts_until');
    if (suppressUntil) {
      const suppressTime = parseInt(suppressUntil, 10);
      if (Date.now() < suppressTime) {
        return true;
      }
      // Reset if suppression has expired
      localStorage.removeItem('suppress_auth_prompts_until');
    }
    return false;
  }, []);
  
  // Function to prompt for authentication at strategic moments
  const promptAuth = useCallback((type: AuthPromptType): boolean => {
    // Only show prompt if user is not authenticated and prompts are not suppressed
    if (loading) return false;
    
    if (!user && !areSuppressed()) {
      setPromptType(type);
      setShowAuthPrompt(true);
      return true; // Prompt is showing
    }
    
    return false; // No prompt needed
  }, [user, loading, areSuppressed]);
  
  // Reset suppression when user logs in
  useEffect(() => {
    if (user) {
      localStorage.removeItem('suppress_auth_prompts_until');
    }
  }, [user]);
  
  // Close the prompt
  const closePrompt = useCallback(() => {
    setShowAuthPrompt(false);
  }, []);
  
  return {
    showAuthPrompt,
    promptType,
    promptAuth,
    closePrompt
  };
}