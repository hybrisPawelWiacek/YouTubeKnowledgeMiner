/**
 * Demo Authentication Subsystem
 * 
 * This module provides specialized authentication for demo users
 * completely independent from the Supabase authentication system.
 * 
 * It follows a similar interface to the Supabase auth but operates
 * without requiring the Supabase client to be initialized.
 */

import { User, Session } from '@supabase/supabase-js';
import { updateCurrentSession } from '@/lib/api';

// Constants
const DEMO_SESSION_KEY = 'youtube-miner-demo-session';

// Types
export interface DemoUser {
  id: number;
  email: string;
  user_metadata: {
    username: string;
    full_name: string;
    direct_auth: boolean;
    is_demo: boolean;
    demo_type?: string;
  };
  role: string;
  aud: string;
  app_metadata: {
    provider: string;
  };
  created_at?: string;
  updated_at?: string;
  phone?: string;
  confirmed_at?: string;
  confirmation_sent_at?: string;
  recovery_sent_at?: string;
  email_confirmed_at?: string;
  banned_until?: string;
  reauthentication_sent_at?: string;
  [key: string]: any; // Allow additional properties
}

export interface DemoSession {
  user: DemoUser;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
}

// Check if a user is a demo user
export function isDemoUser(user?: User | null): boolean {
  return !!user?.user_metadata?.is_demo;
}

// Check if a user is authenticated with direct auth (includes demo users)
export function isDirectAuth(user?: User | null): boolean {
  return !!user?.user_metadata?.direct_auth;
}

/**
 * Create a demo user session
 * 
 * @param userData User data from the backend
 * @returns A demo session object
 */
export function createDemoSession(userData: any): DemoSession {
  console.log('🔑 [Demo Auth] Creating demo session for user:', userData.username);
  
  // Ensure the ID is numeric
  const userId = typeof userData.id === 'number' ? userData.id : parseInt(userData.id, 10);
  
  if (isNaN(userId)) {
    throw new Error('Invalid user ID format for demo session');
  }
  
  // Create a demo user object with all required fields
  const demoUser: DemoUser = {
    id: userId,
    email: userData.email || `${userData.username}@example.com`,
    user_metadata: {
      username: userData.username,
      full_name: userData.displayName || userData.username,
      direct_auth: true,
      is_demo: true,
      demo_type: userData.demoType || 'basic'
    },
    role: 'authenticated',
    aud: 'authenticated', 
    app_metadata: {
      provider: 'demo'
    },
    created_at: new Date().toISOString()
  };
  
  console.log('🔑 [Demo Auth] Demo user object created with ID:', demoUser.id);
  
  // Create a session with all required fields
  const session: DemoSession = {
    user: demoUser,
    access_token: `demo_token_${userId}_${Date.now()}`,
    refresh_token: 'demo_refresh_token',
    expires_in: 3600 * 24 * 7, // 1 week
    expires_at: Date.now() + (3600 * 24 * 7 * 1000), // 1 week from now
    token_type: 'bearer'
  };
  
  console.log('🔑 [Demo Auth] Demo session created with token:', 
    session.access_token.substring(0, 15) + '...');
  
  return session;
}

/**
 * Save a demo session to localStorage
 * 
 * @param session The demo session to save
 */
export function saveDemoSession(session: DemoSession): void {
  console.log('🔑 [Demo Auth] Saving demo session to localStorage');
  
  try {
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
    
    // Also update the application's current session
    updateCurrentSession(session);
    
    console.log('🔑 [Demo Auth] Demo session saved successfully');
  } catch (error) {
    console.error('❌ [Demo Auth] Error saving demo session:', error);
  }
}

/**
 * Get the stored demo session from localStorage
 * 
 * @returns The demo session or null if not found
 */
export function getDemoSession(): DemoSession | null {
  console.log('🔑 [Demo Auth] Trying to get demo session from localStorage');
  
  try {
    const sessionData = localStorage.getItem(DEMO_SESSION_KEY);
    if (!sessionData) {
      console.log('🔑 [Demo Auth] No demo session found in localStorage');
      return null;
    }
    
    const session = JSON.parse(sessionData) as DemoSession;
    
    // Basic validation
    if (!session || !session.user || !session.user.id) {
      console.log('❌ [Demo Auth] Invalid demo session format in localStorage');
      localStorage.removeItem(DEMO_SESSION_KEY);
      return null;
    }
    
    // Check if this really is a demo user
    if (!isDemoUser(session.user)) {
      console.log('❌ [Demo Auth] Stored session is not for a demo user');
      localStorage.removeItem(DEMO_SESSION_KEY);
      return null;
    }
    
    console.log('🔑 [Demo Auth] Successfully retrieved demo session for:', 
      session.user.email, 'ID:', session.user.id);
    
    return session;
  } catch (error) {
    console.error('❌ [Demo Auth] Error parsing demo session:', error);
    localStorage.removeItem(DEMO_SESSION_KEY);
    return null;
  }
}

/**
 * Clear the demo session from localStorage
 */
export function clearDemoSession(): void {
  console.log('🔑 [Demo Auth] Clearing demo session');
  localStorage.removeItem(DEMO_SESSION_KEY);
}

/**
 * Login as a demo user using the API
 * 
 * @param username The demo username to login as
 * @returns A promise that resolves to the demo session or rejects with an error
 */
export async function loginAsDemoUser(username: string): Promise<DemoSession> {
  console.log('🔑 [Demo Auth] Starting login process for demo user:', username);
  
  const response = await fetch('/api/demo-auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    console.error('❌ [Demo Auth] API error:', errorData);
    throw new Error(errorData.message || 'Failed to log in as demo user');
  }
  
  const { data } = await response.json();
  
  if (!data || !data.id) {
    console.error('❌ [Demo Auth] Invalid API response format');
    throw new Error('Invalid response from server');
  }
  
  // Create and save the demo session
  const session = createDemoSession(data);
  saveDemoSession(session);
  
  console.log('🔑 [Demo Auth] Successfully logged in as demo user:', 
    data.username, 'ID:', data.id);
  
  return session;
}

/**
 * Sign out a demo user
 * 
 * This function clears all demo auth data and session information
 */
export function signOutDemoUser(): void {
  console.log('🔑 [Demo Auth] Signing out demo user');
  
  // 1. Clear the demo session in localStorage
  clearDemoSession();
  
  // 2. Clear the session in our API module
  updateCurrentSession(null);
  
  // 3. Clear any other potential demo auth related data
  // This provides a more complete cleanup similar to the Supabase auth
  localStorage.removeItem('demo-auth-token');
  localStorage.removeItem('demo-refresh-token');
  localStorage.removeItem('demo-user-data');
  
  // 4. Import and use anonymous session clearing here would create a circular dependency
  // So we directly remove the anonymous session key instead
  const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
  localStorage.removeItem(ANONYMOUS_SESSION_KEY);
  console.log('🔑 [Demo Auth] Anonymous session cleared during sign out');
}