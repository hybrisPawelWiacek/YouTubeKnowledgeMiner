import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Environment variables for Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabaseClient: SupabaseClient | null = null;

// Initialize Supabase client only if the environment variables are available
if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized successfully');
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
  }
}

/**
 * Check if Supabase is properly configured
 * @returns boolean indicating if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseClient && supabaseUrl && supabaseKey);
}

/**
 * Get the Supabase client instance
 * @returns The Supabase client instance
 * @throws Error if Supabase is not configured
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Please check environment variables.');
  }
  return supabaseClient;
}

/**
 * Verify a Supabase session token
 * @param token Supabase JWT token to verify
 * @returns User data if token is valid, null otherwise
 */
export async function verifyToken(token: string): Promise<any> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('Error verifying token:', error);
      return null;
    }
    
    return data.user;
  } catch (error) {
    console.error('Exception verifying token:', error);
    return null;
  }
}

/**
 * Create a new user in Supabase
 * @param email User's email
 * @param password User's password
 * @param metadata Additional user metadata
 * @returns Created user data
 */
export async function createUser(email: string, password: string, metadata?: any) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error creating user in Supabase:', error);
    throw error;
  }
}

/**
 * Sends a password reset email to the user
 * @param email User's email
 * @param redirectTo URL to redirect to after password reset
 */
export async function sendPasswordResetEmail(email: string, redirectTo?: string) {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

/**
 * Send a magic link to the user's email for passwordless sign-in
 * @param email User's email
 * @param redirectTo URL to redirect to after sign-in
 */
export async function sendMagicLink(email: string, redirectTo?: string) {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo
      }
    });
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error sending magic link:', error);
    throw error;
  }
}

// For backward compatibility, re-export vector functions from the new module
export { initializeVectorFunctions } from './vector-search';

export default {
  isSupabaseConfigured,
  getSupabaseClient,
  verifyToken,
  createUser,
  sendPasswordResetEmail,
  sendMagicLink
};