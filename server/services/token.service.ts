/**
 * Token Service
 * 
 * Manages authentication tokens for user sessions, password resets, and email verification.
 * Handles token generation, validation, and expiration.
 */

import { db } from '../db';
import { auth_tokens } from '../../shared/schema';
import { generateSecureToken } from './password.service';
import { eq, and, sql } from 'drizzle-orm';

// Token expiration times (in milliseconds)
const TOKEN_EXPIRY: Record<string, number> = {
  REFRESH: 7 * 24 * 60 * 60 * 1000, // 7 days
  RESET_PASSWORD: 1 * 60 * 60 * 1000, // 1 hour
  VERIFICATION: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Creates a new authentication token
 * @param userId - The user ID to associate with the token
 * @param type - The type of token (refresh, reset_password, verification)
 * @returns The created token string
 */
export async function createToken(
  userId: number, 
  type: 'refresh' | 'reset_password' | 'verification'
): Promise<string> {
  // Generate a secure random token
  const tokenString = generateSecureToken();
  
  // Calculate expiration time based on token type
  const typeKey = type.toUpperCase() as keyof typeof TOKEN_EXPIRY;
  const expiryMs = TOKEN_EXPIRY[typeKey];
  const expiresAt = new Date(Date.now() + expiryMs);
  
  // Store token in database
  await db.insert(auth_tokens).values({
    user_id: userId,
    token: tokenString,
    type: type,
    expires_at: expiresAt,
  });
  
  return tokenString;
}

/**
 * Verifies if a token is valid and not expired
 * @param token - The token string to verify
 * @param type - The expected token type
 * @returns The user ID associated with the token if valid, null otherwise
 */
export async function verifyToken(token: string, type: 'refresh' | 'reset_password' | 'verification'): Promise<number | null> {
  // Find token in database
  const result = await db
    .select()
    .from(auth_tokens)
    .where(
      and(
        eq(auth_tokens.token, token),
        eq(auth_tokens.type, type),
        eq(auth_tokens.revoked, false),
        // Use SQL timestamp comparison
        sql`${auth_tokens.expires_at} > NOW()`
      )
    );
  
  if (result.length === 0) {
    return null;
  }
  
  return result[0].user_id;
}

/**
 * Invalidates a specific token
 * @param token - The token string to invalidate
 */
export async function revokeToken(token: string): Promise<void> {
  await db
    .update(auth_tokens)
    .set({ 
      revoked: true, 
      revoked_at: new Date(),
      updated_at: new Date()
    })
    .where(eq(auth_tokens.token, token));
}

/**
 * Invalidates all tokens for a specific user and type
 * @param userId - The user ID
 * @param type - The token type to invalidate
 */
export async function revokeAllUserTokens(userId: number, type: 'refresh' | 'reset_password' | 'verification'): Promise<void> {
  await db
    .update(auth_tokens)
    .set({ 
      revoked: true, 
      revoked_at: new Date(),
      updated_at: new Date()
    })
    .where(
      and(
        eq(auth_tokens.user_id, userId),
        eq(auth_tokens.type, type)
      )
    );
}

/**
 * Clean up expired tokens from the database
 * This should be run periodically to remove old tokens
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await db
    .delete(auth_tokens)
    .where(
      and(
        eq(auth_tokens.revoked, true),
        sql`${auth_tokens.expires_at} < NOW()`
      )
    )
    .returning();
    
  return result.length;
}

/**
 * Finds a token in the database
 * @param token - The token string to find
 * @returns The token record if found, null otherwise
 */
export async function findToken(token: string) {
  const result = await db
    .select()
    .from(auth_tokens)
    .where(eq(auth_tokens.token, token));
  
  return result.length > 0 ? result[0] : null;
}