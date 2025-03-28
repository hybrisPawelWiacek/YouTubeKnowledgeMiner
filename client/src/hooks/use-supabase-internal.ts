/**
 * Internal hook utilities for Supabase authentication
 * 
 * This module exposes internal methods that help coordinate auth state
 * updates across the application.
 */

// Callback storage - this will hold the refresh function registered by SupabaseProvider
let refreshCallback: (() => void) | null = null;

/**
 * Register a callback that can be used to refresh the Supabase state
 * This is called by the SupabaseProvider to register its refresh function
 * 
 * @param callback The function to call when a refresh is needed
 */
export function registerRefreshCallback(callback: () => void) {
  console.log('[Supabase Internal] Registering refresh callback');
  refreshCallback = callback;
}

/**
 * Force refresh the Supabase authentication state
 * This can be called from anywhere to trigger a refresh of the auth state
 */
export function refreshSupabaseState() {
  console.log('[Supabase Internal] Refreshing Supabase state');
  
  if (refreshCallback) {
    console.log('[Supabase Internal] Calling registered refresh callback');
    refreshCallback();
  } else {
    console.warn('[Supabase Internal] No refresh callback registered');
  }
}