/**
 * Auth Refresh Utilities
 * 
 * This module provides utilities to force-refresh the authentication state
 * when needed, particularly after logout operations.
 */

import { refreshSupabaseState } from '../hooks/use-supabase-internal';

/**
 * Force refresh the application's authentication state
 * This is used when the UI needs to be updated after auth state changes
 * without requiring a full page reload.
 */
export function refreshAuthState() {
  console.log("[Auth Refresh] Forcing refresh of authentication state");
  
  // Call the refresh function from use-supabase-internal
  refreshSupabaseState();
  
  // Dispatch a global event that components can listen for
  window.dispatchEvent(new Event('auth-state-refresh'));
  
  console.log("[Auth Refresh] Auth state refresh complete");
}