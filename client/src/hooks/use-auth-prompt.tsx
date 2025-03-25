import { useState, useCallback, useEffect } from 'react';
import { useSupabase } from './use-supabase';
import { AuthPromptType } from '@/components/auth/auth-prompt-dialog';

// Constants for frequency control
const PROMPT_FREQUENCY = {
  SESSION_LIMIT: 3,         // Max prompts per session
  MIN_INTERVAL: 5 * 60000,  // 5 minutes between prompts
  SUPPRESSION_TIME: {
    DEFAULT: 24 * 60 * 60 * 1000,  // 24 hours
    EXTENDED: 3 * 24 * 60 * 60 * 1000  // 3 days
  },
  ENGAGEMENT_THRESHOLD: 3  // Number of actions needed before showing first prompt
};

type PromptRecord = {
  timestamp: number;
  type: AuthPromptType;
};

export function useAuthPrompt() {
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [promptType, setPromptType] = useState<AuthPromptType>('save_video');
  const { user, loading } = useSupabase();
  
  // Get engagement count (track user activity)
  const getEngagementCount = useCallback((): number => {
    const count = localStorage.getItem('user_engagement_count');
    return count ? parseInt(count, 10) : 0;
  }, []);
  
  // Increment engagement count
  const incrementEngagement = useCallback(() => {
    const currentCount = getEngagementCount();
    localStorage.setItem('user_engagement_count', (currentCount + 1).toString());
    return currentCount + 1;
  }, [getEngagementCount]);
  
  // Get prompt history
  const getPromptHistory = useCallback((): PromptRecord[] => {
    const history = localStorage.getItem('auth_prompt_history');
    return history ? JSON.parse(history) : [];
  }, []);
  
  // Add to prompt history
  const addToPromptHistory = useCallback((type: AuthPromptType) => {
    const history = getPromptHistory();
    const updatedHistory = [
      ...history,
      { timestamp: Date.now(), type }
    ].slice(-PROMPT_FREQUENCY.SESSION_LIMIT); // Keep only most recent prompts
    
    localStorage.setItem('auth_prompt_history', JSON.stringify(updatedHistory));
  }, [getPromptHistory]);
  
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
  
  // Check if we've prompted too frequently
  const isTooFrequent = useCallback(() => {
    const history = getPromptHistory();
    
    if (history.length === 0) return false;
    
    const lastPrompt = history[history.length - 1];
    const timeSinceLastPrompt = Date.now() - lastPrompt.timestamp;
    
    // Check if we're within minimum interval
    return timeSinceLastPrompt < PROMPT_FREQUENCY.MIN_INTERVAL;
  }, [getPromptHistory]);
  
  // Check if user has enough engagement for prompts
  const hasMinimumEngagement = useCallback(() => {
    return getEngagementCount() >= PROMPT_FREQUENCY.ENGAGEMENT_THRESHOLD;
  }, [getEngagementCount]);
  
  // Suppress prompts for a longer period
  const setExtendedSuppression = useCallback(() => {
    const suppressUntil = Date.now() + PROMPT_FREQUENCY.SUPPRESSION_TIME.EXTENDED;
    localStorage.setItem('suppress_auth_prompts_until', suppressUntil.toString());
  }, []);
  
  // Determine if this specific prompt type has been shown already
  const hasSeenPromptType = useCallback((type: AuthPromptType): boolean => {
    const history = getPromptHistory();
    return history.some(record => record.type === type);
  }, [getPromptHistory]);
  
  // Function to prompt for authentication at strategic moments
  const promptAuth = useCallback((type: AuthPromptType): boolean => {
    // Only show prompt if user is not authenticated
    if (loading || user) return false;
    
    // Skip if prompts are suppressed
    if (areSuppressed()) return false;
    
    // Track engagement
    const engagement = incrementEngagement();
    
    // Don't show prompts until minimum engagement threshold is reached
    if (!hasMinimumEngagement() && type !== 'save_video') {
      return false;
    }
    
    // Don't prompt too frequently
    if (isTooFrequent()) return false;
    
    // Special case: If user has dismissed multiple prompts, suppress for longer
    if (getPromptHistory().length >= PROMPT_FREQUENCY.SESSION_LIMIT) {
      // If this would be the 4th prompt in a session, apply extended suppression
      if (!hasSeenPromptType(type)) {
        setExtendedSuppression();
        return false;
      }
    }
    
    // All checks passed, show the prompt
    setPromptType(type);
    setShowAuthPrompt(true);
    addToPromptHistory(type);
    return true; // Prompt is showing
  }, [
    user, 
    loading, 
    areSuppressed, 
    isTooFrequent, 
    hasMinimumEngagement, 
    incrementEngagement,
    hasSeenPromptType,
    setExtendedSuppression,
    addToPromptHistory
  ]);
  
  // Reset counts and history when user logs in
  useEffect(() => {
    if (user) {
      localStorage.removeItem('suppress_auth_prompts_until');
      localStorage.removeItem('auth_prompt_history');
      localStorage.removeItem('user_engagement_count');
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
    closePrompt,
    incrementEngagement  // Export this so components can track engagement
  };
}