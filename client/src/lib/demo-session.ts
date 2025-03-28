/**
 * Demo user session management utilities
 * 
 * This module handles demo user session persistence and cleanup
 * to ensure proper logout and session restoration between page refreshes.
 */

import { Session, User } from '@supabase/supabase-js';
import { updateCurrentSession } from './api';

// Key for storing the demo user session in localStorage
export const DEMO_SESSION_KEY = 'youtube-miner-demo-session';
// Key for Supabase session - we need to clean this up during logout too
// Importing from use-supabase.tsx would create circular dependencies
export const SUPABASE_SESSION_KEY = 'youtube-miner-supabase-session';

/**
 * Store a demo user session in localStorage
 * This ensures the session persists across page refreshes
 */
export function storeSession(session: Session): void {
  try {
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
    console.log('[Demo Session] Stored demo session in localStorage');
  } catch (error) {
    console.error('[Demo Session] Error storing demo session:', error);
  }
}

/**
 * Get a stored demo user session from localStorage
 * Returns null if no session exists or if the session is invalid
 */
export function getStoredSession(): Session | null {
  try {
    const storedSession = localStorage.getItem(DEMO_SESSION_KEY);
    if (!storedSession) {
      return null;
    }

    const session = JSON.parse(storedSession) as Session;
    
    // Validate that this is a demo user session
    if (!session?.user?.user_metadata?.is_demo) {
      console.warn('[Demo Session] Retrieved session is not a demo user session');
      return null;
    }
    
    // Validate expiration (though demos don't technically expire)
    if (session.expires_at && session.expires_at < Date.now()) {
      console.warn('[Demo Session] Retrieved demo session is expired');
      clearSession();
      return null;
    }
    
    console.log('[Demo Session] Retrieved valid demo session from localStorage');
    return session;
  } catch (error) {
    console.error('[Demo Session] Error retrieving demo session:', error);
    return null;
  }
}

/**
 * Clear all demo user session data from localStorage
 * This is called during logout to ensure clean state
 */
export function clearSession(): void {
  try {
    // Clear our demo-specific storage
    localStorage.removeItem(DEMO_SESSION_KEY);
    
    // Make sure we also clear the Supabase session, as it might contain demo user info
    localStorage.removeItem(SUPABASE_SESSION_KEY);
    
    console.log('[Demo Session] Cleared all demo session data');
  } catch (error) {
    console.error('[Demo Session] Error clearing demo session:', error);
  }
}

/**
 * Determine if the provided user is a demo user
 */
export function isDemoUser(user: User | null): boolean {
  return !!user?.user_metadata?.is_demo;
}

/**
 * Sign out a demo user completely, clearing state
 * This handles all necessary cleanup
 * @param setUser React state setter for user
 * @param setSession React state setter for session
 */
export function signOutDemoUser(
  setUser: (user: User | null) => void,
  setSession: (session: Session | null) => void
): void {
  // Clear React state
  setUser(null);
  setSession(null);
  
  // Clear API module session
  updateCurrentSession(null);
  
  // Clear stored session data
  clearSession();
  
  console.log('[Demo Session] Demo user signed out successfully');
}