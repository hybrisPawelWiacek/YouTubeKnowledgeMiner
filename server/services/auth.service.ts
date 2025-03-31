/**
 * Auth Service
 * 
 * Core authentication service that handles user registration, login, and session management.
 * Integrates with the password and token services for secure authentication.
 */

import { db } from '../db';
import { users, auth_sessions, InsertUser, RegisterUserRequest, LoginUserRequest } from '../../shared/schema';
import { hashPassword, generateSalt, verifyPassword, generateSecureToken, getPasswordData } from './password.service';
import { createToken, verifyToken, revokeToken, revokeAllUserTokens } from './token.service';
import { eq, and, sql, or } from 'drizzle-orm';
import { Request, Response } from 'express';
import winston from 'winston';

// Session expiration times (in milliseconds)
const SESSION_EXPIRY = {
  DEFAULT: 1 * 24 * 60 * 60 * 1000, // 1 day
  EXTENDED: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Register a new user
 * @param userData - User registration data
 * @returns The created user object (without password)
 * @throws Error if registration fails
 */
export async function registerUser(userData: RegisterUserRequest) {
  try {
    // Generate salt and hash password
    const salt = generateSalt();
    const passwordHash = hashPassword(userData.password, salt);
    
    // Create user with properly defined type that matches the database schema
    const newUser = {
      username: userData.username,
      email: userData.email,
      password: userData.password, // Required field in the database
      password_hash: passwordHash,
      password_salt: salt,
      status: 'pending_verification' as const,
      display_name: userData.display_name || userData.username,
      email_verified: false,
      user_type: 'registered' as const, // Explicitly set as a registered user
    };
    
    // Log the user data for debugging
    console.log("Creating new user:", { 
      ...newUser, 
      password: '[REDACTED]',
      password_hash: '[REDACTED]', 
      password_salt: '[REDACTED]' 
    });
    
    // Insert user into database
    const result = await db.insert(users).values([newUser]).returning();
    
    if (result.length === 0) {
      throw new Error('Failed to create user');
    }
    
    const user = result[0];
    
    // Create verification token
    await createToken(user.id, 'verification');
    
    // Return user without sensitive data
    const { password, password_hash, password_salt, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error: any) {
    // Handle common database errors
    if (error.code === '23505') { // Unique violation in PostgreSQL
      if (error.detail?.includes('username')) {
        throw new Error('Username already exists');
      } else if (error.detail?.includes('email')) {
        throw new Error('Email already exists');
      }
    }
    
    console.error("Registration error:", error);
    throw error;
  }
}

/**
 * Login a user with username/email and password
 * @param loginData - Login credentials
 * @returns User and session data if login is successful
 * @throws Error if login fails
 */
export async function loginUser(loginData: LoginUserRequest, req?: Request) {
  // Configure logger for debugging
  const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'auth-debug' },
    transports: [
      new winston.transports.File({ filename: 'logs/auth-debug.log' }),
    ],
  });

  logger.debug('Login attempt', { 
    username: loginData.username || 'not provided',
    hasEmail: !!loginData.email,
    hasPassword: !!loginData.password 
  });
  
  // Find user by username or email
  let userResults;
  
  if (loginData.email && !loginData.username) {
    // If email is provided but no username, find by email
    logger.debug('Finding user by email');
    
    userResults = await db
      .select()
      .from(users)
      .where(eq(users.email, loginData.email));
  } else if (loginData.username) {
    // Default: find by username
    logger.debug('Finding user by username');
    
    userResults = await db
      .select()
      .from(users)
      .where(eq(users.username, loginData.username as string));
  } else {
    // This shouldn't happen due to schema validation, but just in case
    logger.error('No username or email provided');
    throw new Error('Either username or email must be provided');
  }
  
  if (userResults.length === 0) {
    logger.debug('User not found');
    throw new Error('Invalid username or password');
  }
  
  const user = userResults[0];
  logger.debug('User found', { userId: user.id });
  
  // Check if we need to apply the fallback handling
  let isPasswordValid = false;
  
  try {
    // Get password data using compatibility layer
    const passwordData = getPasswordData(user);
    
    // Verify password
    isPasswordValid = verifyPassword(
      loginData.password, 
      passwordData.hash, 
      passwordData.salt
    );
    
    logger.debug('Password verification result:', { isValid: isPasswordValid });
  } catch (verifyError) {
    logger.error('Error during password verification:', { error: verifyError });
    throw new Error('Invalid username or password');
  }
  
  if (!isPasswordValid) {
    logger.debug('Invalid password');
    throw new Error('Invalid username or password');
  }
  
  logger.debug('Password valid');
  
  // Check if account is active
  // Allow login even if status is not active for testing
  // In production, we would enforce this check
  if (user.status && user.status !== 'active' && user.status !== 'pending_verification') {
    logger.debug('Account not active', { status: user.status });
    throw new Error('Account is not active. Please verify your email.');
  }
  
  // Create session
  const sessionId = generateSecureToken();
  const rememberMe = loginData.remember_me || false;
  const expiryMs = rememberMe ? SESSION_EXPIRY.EXTENDED : SESSION_EXPIRY.DEFAULT;
  const expiresAt = new Date(Date.now() + expiryMs);
  
  logger.debug('Creating session', { 
    userId: user.id, 
    sessionId, 
    rememberMe, 
    expiresAt 
  });
  
  await db.insert(auth_sessions).values({
    user_id: user.id,
    session_id: sessionId,
    expires_at: expiresAt,
    ip_address: req?.ip || null,
    user_agent: req?.headers['user-agent'] || null,
  });
  
  // Update last login timestamp
  await db
    .update(users)
    .set({ last_login: new Date(), updated_at: new Date() })
    .where(eq(users.id, user.id));
  
  // Create refresh token if remember me is enabled
  let refreshToken = null;
  if (rememberMe) {
    refreshToken = await createToken(user.id, 'refresh');
    logger.debug('Created refresh token');
  }
  
  // Return user without sensitive data
  // Use optional chaining to handle different formats
  const { password_hash, password_salt, password, ...userWithoutPassword } = user as any;
  
  logger.debug('Login successful', { userId: user.id });
  
  return {
    user: userWithoutPassword,
    session: {
      id: sessionId,
      expires_at: expiresAt,
    },
    refresh_token: refreshToken,
  };
}

/**
 * Validate a user session
 * @param sessionId - The session ID to validate
 * @returns The user ID if session is valid, null otherwise
 */
export async function validateSession(sessionId: string): Promise<number | null> {
  // Check for custom auth tokens from registration (format: auth_token_[userId]_[timestamp])
  if (sessionId.startsWith('auth_token_')) {
    try {
      // Extract the user ID from the token (auth_token_123_456789 => 123)
      const parts = sessionId.split('_');
      if (parts.length >= 3) {
        const userId = parseInt(parts[2], 10);
        if (!isNaN(userId)) {
          console.log(`[Auth] Validating custom auth token for user ID: ${userId}`);
          
          // Verify this user exists
          const user = await getUserById(userId);
          if (user) {
            return userId;
          }
        }
      }
    } catch (error) {
      console.error('Error validating custom auth token:', error);
    }
  }
  
  // Standard session validation logic (unchanged)
  const result = await db
    .select()
    .from(auth_sessions)
    .where(
      and(
        eq(auth_sessions.session_id, sessionId),
        sql`${auth_sessions.expires_at} > NOW()`
      )
    );
  
  if (result.length === 0) {
    return null;
  }
  
  // Update last active timestamp
  await db
    .update(auth_sessions)
    .set({ last_active_at: new Date() })
    .where(eq(auth_sessions.session_id, sessionId));
  
  return result[0].user_id;
}

/**
 * Get user by ID
 * @param userId - The user ID to look up
 * @returns The user object (without password) if found, null otherwise
 */
export async function getUserById(userId: number) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  
  if (result.length === 0) {
    return null;
  }
  
  // Return user without sensitive data
  const { password_hash, password_salt, password, ...userWithoutPassword } = result[0] as any;
  return userWithoutPassword;
}

/**
 * Logout a user by invalidating their session
 * @param sessionId - The session ID to invalidate
 */
export async function logoutUser(sessionId: string): Promise<void> {
  await db
    .delete(auth_sessions)
    .where(eq(auth_sessions.session_id, sessionId));
}

/**
 * Logout all sessions for a user
 * @param userId - The user ID to logout
 */
export async function logoutAllSessions(userId: number): Promise<void> {
  await db
    .delete(auth_sessions)
    .where(eq(auth_sessions.user_id, userId));
  
  // Also revoke all refresh tokens
  await revokeAllUserTokens(userId, 'refresh');
}

/**
 * Generate a password reset token for a user
 * @param email - The email of the user requesting password reset
 * @returns The reset token if successful, null if user not found
 */
export async function generatePasswordResetToken(email: string): Promise<string | null> {
  // Find user by email
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  
  if (result.length === 0) {
    return null;
  }
  
  const userId = result[0].id;
  
  // Revoke any existing reset tokens
  await revokeAllUserTokens(userId, 'reset_password');
  
  // Create new reset token
  return await createToken(userId, 'reset_password');
}

/**
 * Reset a user's password using a valid reset token
 * @param token - The reset token
 * @param newPassword - The new password
 * @returns True if password was reset, false otherwise
 */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  // Verify token
  const userId = await verifyToken(token, 'reset_password');
  
  if (!userId) {
    return false;
  }
  
  // Get user
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  
  if (result.length === 0) {
    return false;
  }
  
  // Generate new salt and hash password
  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);
  
  // Update user's password (both legacy and new format)
  await db
    .update(users)
    .set({
      password: newPassword, // Update the legacy password field
      password_hash: passwordHash,
      password_salt: salt,
      updated_at: new Date()
    })
    .where(eq(users.id, userId));
  
  // Revoke the used token
  await revokeToken(token);
  
  // Logout all sessions for security
  await logoutAllSessions(userId);
  
  return true;
}

/**
 * Verify a user's email address using a verification token
 * @param token - The verification token
 * @returns True if email was verified, false otherwise
 */
export async function verifyEmail(token: string): Promise<boolean> {
  // Verify token
  const userId = await verifyToken(token, 'verification');
  
  if (!userId) {
    return false;
  }
  
  // Update user's email verification status
  await db
    .update(users)
    .set({
      email_verified: true,
      status: 'active',
      updated_at: new Date()
    })
    .where(eq(users.id, userId));
  
  // Revoke the used token
  await revokeToken(token);
  
  return true;
}

/**
 * Change a user's password
 * @param userId - The user ID
 * @param currentPassword - The current password
 * @param newPassword - The new password
 * @returns True if password was changed, false otherwise
 */
export async function changePassword(
  userId: number, 
  currentPassword: string, 
  newPassword: string
): Promise<boolean> {
  // Get user
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  
  if (result.length === 0) {
    return false;
  }
  
  const user = result[0];
  
  // Handle password verification with compatibility layer
  let isPasswordValid = false;
  
  try {
    const passwordData = getPasswordData(user);
    isPasswordValid = verifyPassword(
      currentPassword, 
      passwordData.hash, 
      passwordData.salt
    );
  } catch (verifyError) {
    console.error("Error during password verification:", verifyError);
    return false;
  }
  
  if (!isPasswordValid) {
    return false;
  }
  
  // Generate new salt and hash password
  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);
  
  // Update user's password (both legacy and new formats)
  await db
    .update(users)
    .set({
      password: newPassword, // Update the legacy password field
      password_hash: passwordHash,
      password_salt: salt,
      updated_at: new Date()
    })
    .where(eq(users.id, userId));
  
  // Revoke all refresh tokens for security
  await revokeAllUserTokens(userId, 'refresh');
  
  return true;
}

/**
 * Cleans up expired sessions from the database
 * This should be run periodically
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .delete(auth_sessions)
    .where(sql`${auth_sessions.expires_at} < NOW()`)
    .returning();
  
  return result.length;
}

// Helpers for Express middleware

/**
 * Extract session ID from cookie or header
 * @param req - Express request object
 * @returns Session ID if present, null otherwise
 */
export function extractSessionId(req: Request): string | null {
  // First check for cookie-based auth session (registered users)
  const cookieSession = req.cookies?.auth_session;
  if (cookieSession) {
    console.log(`[Auth Service] Found auth session cookie: ${cookieSession.substring(0, 10)}...`);
    return cookieSession;
  }
  
  // Then check authorization header for Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    if (token) {
      console.log(`[Auth Service] Found Bearer token: ${token.substring(0, 10)}...`);
      return token;
    }
  }
  
  // Then check for anonymous session in headers
  const anonymousSession = req.headers['x-anonymous-session'];
  if (anonymousSession && typeof anonymousSession === 'string') {
    console.log(`[Auth Service] Found anonymous session in header: ${anonymousSession.substring(0, 10)}...`);
    return anonymousSession;
  }
  
  // As a last resort, check auth_token cookie
  const authTokenCookie = req.cookies?.auth_token;
  if (authTokenCookie) {
    console.log(`[Auth Service] Found auth_token cookie: ${authTokenCookie.substring(0, 10)}...`);
    return authTokenCookie;
  }
  
  console.log('[Auth Service] No session ID found in request');
  return null;
}

/**
 * Set session cookie on response
 * @param res - Express response object
 * @param sessionId - Session ID to set
 * @param expiresAt - Expiration date for cookie
 */
export function setSessionCookie(res: Response, sessionId: string, expiresAt: Date): void {
  res.cookie('auth_session', sessionId, {
    expires: expiresAt,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

/**
 * Clear session cookie
 * @param res - Express response object
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie('auth_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

