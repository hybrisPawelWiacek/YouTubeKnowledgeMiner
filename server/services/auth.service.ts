/**
 * Authentication Service
 * 
 * This service handles all authentication-related functionality including:
 * - User registration and email verification
 * - User login and session management
 * - Password reset functionality
 * - Security token generation and validation
 * 
 * Security Implementation Notes:
 * - All passwords are hashed using bcrypt with a work factor of 12
 * - User sessions use cryptographically secure tokens
 * - Email verification and password reset tokens use cryptographically secure random strings
 * - All tokens have appropriate expiration times
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { storage } from '../storage';
import { RegisterRequest, User, UserSession } from '@shared/schema';
import { createLogger } from './logger';

const logger = createLogger('auth');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Should be set in environment
const BCRYPT_ROUNDS = 12; // Work factor for bcrypt

/**
 * Authentication Error Classes
 */
export class AuthError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'AUTH_ERROR', status = 401) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid email/username or password') {
    super(message, 'INVALID_CREDENTIALS', 401);
    Object.setPrototypeOf(this, InvalidCredentialsError.prototype);
  }
}

export class UserNotFoundError extends AuthError {
  constructor(message = 'User not found') {
    super(message, 'USER_NOT_FOUND', 404);
    Object.setPrototypeOf(this, UserNotFoundError.prototype);
  }
}

export class UserAlreadyExistsError extends AuthError {
  constructor(message = 'User already exists') {
    super(message, 'USER_EXISTS', 409);
    Object.setPrototypeOf(this, UserAlreadyExistsError.prototype);
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message = 'Invalid or expired token') {
    super(message, 'INVALID_TOKEN', 401);
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

export class EmailNotVerifiedError extends AuthError {
  constructor(message = 'Email not verified') {
    super(message, 'EMAIL_NOT_VERIFIED', 403);
    Object.setPrototypeOf(this, EmailNotVerifiedError.prototype);
  }
}

export class SessionError extends AuthError {
  constructor(message = 'Session error') {
    super(message, 'SESSION_ERROR', 401);
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

/**
 * Password management functions
 */

/**
 * Hash a password using bcrypt
 * @param password The plain text password to hash
 * @returns Object containing the hash and salt
 */
async function hashPassword(password: string): Promise<{ hash: string, salt: string }> {
  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    
    // Hash the password with the salt
    const hash = await bcrypt.hash(password, salt);
    
    return { hash, salt };
  } catch (error) {
    logger.error('Error hashing password', { error });
    throw new Error('Password hashing failed');
  }
}

/**
 * Verify a password against a stored hash
 * @param password The plain text password to verify
 * @param storedHash The stored hash to verify against
 * @returns True if the password matches, false otherwise
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, storedHash);
  } catch (error) {
    logger.error('Error verifying password', { error });
    return false;
  }
}

/**
 * Token generation functions
 */

/**
 * Generate a random token for email verification or password reset
 * @returns A random token string
 */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a JWT token for user authentication
 * @param userId The user ID to include in the token
 * @param expiresIn Time until the token expires (e.g., '14d')
 * @returns The JWT token string
 */
function generateJwtToken(userId: number, expiresIn = '14d'): string {
  try {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
  } catch (error) {
    logger.error('Error generating JWT token', { error });
    throw new Error('Failed to generate authentication token');
  }
}

/**
 * Verify a JWT token and extract the user ID
 * @param token The JWT token to verify
 * @returns The user ID from the token payload
 * @throws InvalidTokenError if the token is invalid or expired
 */
function verifyJwtToken(token: string): number {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    return decoded.userId;
  } catch (error) {
    throw new InvalidTokenError('Invalid or expired authentication token');
  }
}

/**
 * Authentication API functions
 */

/**
 * Register a new user
 * @param username The username for the new user
 * @param email The email address for the new user
 * @param password The password for the new user
 * @param anonymousSessionId Optional anonymous session ID to migrate data from
 * @returns The newly created user object
 * @throws UserAlreadyExistsError if a user with the same email or username already exists
 */
export async function registerUser(
  username: string,
  email: string,
  password: string,
  anonymousSessionId?: string
): Promise<User> {
  logger.info('User registration attempt', { username, email });
  
  try {
    // Check if a user with this email or username already exists
    const existingUser = await storage.getUserByEmailOrUsername(email, username);
    
    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        throw new UserAlreadyExistsError('A user with this email already exists');
      } else {
        throw new UserAlreadyExistsError('Username is already taken');
      }
    }
    
    // Hash the password
    const { hash, salt } = await hashPassword(password);
    
    // Generate a verification token
    const verificationToken = generateSecureToken();
    
    // Create the user
    const newUser = await storage.createUser({
      username,
      email,
      password_hash: hash,
      password_salt: salt,
      verification_token: verificationToken,
      is_verified: false, // Require email verification
      role: 'user', // Default role
    });
    
    // If we have an anonymous session ID, migrate the data
    if (anonymousSessionId) {
      await migrateAnonymousData(anonymousSessionId, newUser.id);
    }
    
    // In production, you would send a verification email here
    logger.info('User registered successfully', {
      userId: newUser.id,
      username: newUser.username,
      requiresVerification: true,
    });
    
    // For development, log the verification token directly
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Verification token for ${email}: ${verificationToken}`);
      logger.debug('Dev email verification token', { email, token: verificationToken });
    }
    
    return newUser;
  } catch (error) {
    // Rethrow AuthErrors (like UserAlreadyExistsError)
    if (error instanceof AuthError) {
      throw error;
    }
    
    // Log other errors and throw a generic one
    logger.error('Error registering user', { 
      error: error instanceof Error ? error.message : String(error),
      username, 
      email 
    });
    throw new Error('Failed to register user');
  }
}

/**
 * Verify a user's email address using a verification token
 * @param token The verification token sent to the user's email
 * @returns The verified user object
 * @throws InvalidTokenError if the token is invalid or expired
 */
export async function verifyEmail(token: string): Promise<User> {
  logger.info('Email verification attempt', { token });
  
  try {
    // Find the user with this verification token
    const user = await storage.getUserByVerificationToken(token);
    
    if (!user) {
      throw new InvalidTokenError('Invalid verification token');
    }
    
    // Update the user to be verified and clear the token
    const updatedUser = await storage.updateUser(user.id, {
      is_verified: true,
      verification_token: null,
    });
    
    logger.info('Email verified successfully', { userId: user.id, email: user.email });
    
    return updatedUser;
  } catch (error) {
    // Rethrow AuthErrors
    if (error instanceof AuthError) {
      throw error;
    }
    
    logger.error('Error verifying email', { 
      error: error instanceof Error ? error.message : String(error),
      token 
    });
    throw new Error('Failed to verify email');
  }
}

/**
 * Request a password reset for a user
 * @param email The email address of the user
 * @returns The user object with the reset token set
 * @throws UserNotFoundError if no user with the email exists
 */
export async function requestPasswordReset(email: string): Promise<User> {
  logger.info('Password reset requested', { email });
  
  try {
    // Find the user by email
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      throw new UserNotFoundError(`No account found with email: ${email}`);
    }
    
    // Generate a reset token
    const resetToken = generateSecureToken();
    
    // Set the token expiration (24 hours from now)
    const resetTokenExpires = new Date();
    resetTokenExpires.setHours(resetTokenExpires.getHours() + 24);
    
    // Update the user with the reset token
    const updatedUser = await storage.updateUser(user.id, {
      reset_token: resetToken,
      reset_token_expires: resetTokenExpires,
    });
    
    // In production, you would send a password reset email here
    logger.info('Password reset token generated', { userId: user.id, email });
    
    // For development, log the reset token directly
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Password reset token for ${email}: ${resetToken}`);
      logger.debug('Dev password reset token', { email, token: resetToken });
    }
    
    return updatedUser;
  } catch (error) {
    // Rethrow AuthErrors
    if (error instanceof AuthError) {
      throw error;
    }
    
    logger.error('Error requesting password reset', { 
      error: error instanceof Error ? error.message : String(error),
      email 
    });
    throw new Error('Failed to request password reset');
  }
}

/**
 * Reset a user's password using a reset token
 * @param token The reset token sent to the user's email
 * @param newPassword The new password for the user
 * @returns The updated user object
 * @throws InvalidTokenError if the token is invalid or expired
 */
export async function resetPassword(token: string, newPassword: string): Promise<User> {
  logger.info('Password reset attempt', { token });
  
  try {
    // Find the user with this reset token
    const user = await storage.getUserByResetToken(token);
    
    if (!user) {
      throw new InvalidTokenError('Invalid password reset token');
    }
    
    // Check if the token has expired
    if (!user.reset_token_expires || new Date() > user.reset_token_expires) {
      throw new InvalidTokenError('Password reset token has expired');
    }
    
    // Hash the new password
    const { hash, salt } = await hashPassword(newPassword);
    
    // Update the user with the new password and clear the reset token
    const updatedUser = await storage.updateUser(user.id, {
      password_hash: hash,
      password_salt: salt,
      reset_token: null,
      reset_token_expires: null,
    });
    
    // Invalidate all existing sessions for this user for security
    await invalidateAllUserSessions(user.id);
    
    logger.info('Password reset successfully', { userId: user.id, email: user.email });
    
    return updatedUser;
  } catch (error) {
    // Rethrow AuthErrors
    if (error instanceof AuthError) {
      throw error;
    }
    
    logger.error('Error resetting password', { 
      error: error instanceof Error ? error.message : String(error),
      token 
    });
    throw new Error('Failed to reset password');
  }
}

/**
 * Authenticate a user with email/username and password
 * @param identifier The email or username of the user
 * @param password The password of the user
 * @param requireVerified Whether to require email verification (defaults to true)
 * @returns The authenticated user object
 * @throws InvalidCredentialsError if the credentials are invalid
 * @throws EmailNotVerifiedError if the email is not verified and verification is required
 */
export async function authenticateUser(
  identifier: string,
  password: string,
  requireVerified: boolean = true
): Promise<User> {
  logger.info('Authentication attempt', { identifier });
  
  try {
    // Determine if identifier is an email (contains @)
    const isEmail = identifier.includes('@');
    
    // Get the user by email or username
    const user = isEmail
      ? await storage.getUserByEmail(identifier)
      : await storage.getUserByUsername(identifier);
    
    if (!user) {
      throw new InvalidCredentialsError();
    }
    
    // Verify the password
    const passwordValid = await verifyPassword(password, user.password_hash);
    
    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }
    
    // Check if email verification is required and user is verified
    if (requireVerified && !user.is_verified) {
      throw new EmailNotVerifiedError();
    }
    
    // Update last login timestamp
    const updatedUser = await storage.updateUser(user.id, {
      last_login: new Date(),
    });
    
    logger.info('Authentication successful', { userId: user.id, username: user.username });
    
    return updatedUser;
  } catch (error) {
    // Rethrow AuthErrors
    if (error instanceof AuthError) {
      throw error;
    }
    
    logger.error('Error during authentication', { 
      error: error instanceof Error ? error.message : String(error),
      identifier 
    });
    throw new Error('Authentication failed');
  }
}

/**
 * Create a new session for an authenticated user
 * @param userId The ID of the user
 * @param userAgent Optional user agent string
 * @param ipAddress Optional IP address
 * @returns The created session object
 */
export async function createUserSession(
  userId: number,
  userAgent?: string,
  ipAddress?: string
): Promise<UserSession> {
  try {
    // Generate a session token
    const sessionToken = generateSecureToken();
    
    // Set session expiration (defaults to 14 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);
    
    // Create the session in the database
    const session = await storage.createUserSession({
      user_id: userId,
      session_token: sessionToken,
      expires_at: expiresAt,
      user_agent: userAgent || null,
      ip_address: ipAddress || null,
    });
    
    logger.info('User session created', { userId, sessionId: session.id });
    
    return session;
  } catch (error) {
    logger.error('Error creating user session', { 
      error: error instanceof Error ? error.message : String(error),
      userId 
    });
    throw new Error('Failed to create user session');
  }
}

/**
 * Validate a user session token and retrieve the associated user
 * @param token The session token to validate
 * @returns Object containing the user and session information
 * @throws SessionError if the token is invalid or expired
 */
export async function validateUserSession(token: string): Promise<{ user: User; session: UserSession }> {
  try {
    // Find the session by token
    const session = await storage.getUserSessionByToken(token);
    
    if (!session) {
      throw new SessionError('Invalid session token');
    }
    
    // Check if session has expired
    if (new Date() > session.expires_at) {
      await invalidateUserSession(token);
      throw new SessionError('Session has expired');
    }
    
    // Get the user associated with the session
    const user = await storage.getUser(session.user_id);
    
    if (!user) {
      throw new SessionError('User associated with session not found');
    }
    
    // Update the session's last active timestamp
    await storage.updateUserSessionLastActive(session.id);
    
    return { user, session };
  } catch (error) {
    // Rethrow SessionError
    if (error instanceof SessionError) {
      throw error;
    }
    
    logger.error('Error validating user session', { 
      error: error instanceof Error ? error.message : String(error),
      token: token.substring(0, 5) + '...' // Log just a fragment for security
    });
    throw new SessionError('Session validation failed');
  }
}

/**
 * Invalidate a user session (logout)
 * @param token The session token to invalidate
 * @returns True if the session was invalidated, false otherwise
 */
export async function invalidateUserSession(token: string): Promise<boolean> {
  try {
    const result = await storage.deleteUserSessionByToken(token);
    return result > 0;
  } catch (error) {
    logger.error('Error invalidating user session', { 
      error: error instanceof Error ? error.message : String(error),
      token: token.substring(0, 5) + '...' // Log just a fragment for security
    });
    return false;
  }
}

/**
 * Invalidate all sessions for a user
 * @param userId The user ID whose sessions should be invalidated
 * @returns The number of sessions that were invalidated
 */
export async function invalidateAllUserSessions(userId: number): Promise<number> {
  try {
    const count = await storage.deleteAllUserSessions(userId);
    logger.info('All user sessions invalidated', { userId, count });
    return count;
  } catch (error) {
    logger.error('Error invalidating all user sessions', { 
      error: error instanceof Error ? error.message : String(error),
      userId 
    });
    return 0;
  }
}

/**
 * Create or validate an anonymous session
 * @param sessionId The client-provided session ID
 * @param userAgent Optional user agent string
 * @param ipAddress Optional IP address
 * @returns The anonymous session object
 */
export async function getOrCreateAnonymousSession(
  sessionId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ session_id: string; video_count: number }> {
  try {
    // Check if the session already exists
    let session = await storage.getAnonymousSessionBySessionId(sessionId);
    
    if (session) {
      // Update last active time for existing session
      await storage.updateAnonymousSessionLastActive(sessionId);
      
      logger.debug('Anonymous session found and updated', { sessionId });
      
      return { 
        session_id: session.session_id,
        video_count: session.video_count
      };
    }
    
    // Create a new session if it doesn't exist
    session = await storage.createAnonymousSession({
      session_id: sessionId,
      user_agent: userAgent || null,
      ip_address: ipAddress || null,
    });
    
    logger.info('New anonymous session created', { sessionId });
    
    return { 
      session_id: session.session_id,
      video_count: session.video_count
    };
  } catch (error) {
    logger.error('Error with anonymous session', { 
      error: error instanceof Error ? error.message : String(error),
      sessionId 
    });
    throw new Error('Failed to process anonymous session');
  }
}

/**
 * Migrate data from an anonymous session to a registered user
 * @param anonymousSessionId The anonymous session ID
 * @param userId The user ID to migrate data to
 * @returns The number of migrated items
 */
export async function migrateAnonymousData(anonymousSessionId: string, userId: number): Promise<number> {
  try {
    // Migrate videos from anonymous session to registered user
    const migratedCount = await storage.migrateVideosFromAnonymousSession(anonymousSessionId, userId);
    
    logger.info('Migrated anonymous data', { anonymousSessionId, userId, migratedCount });
    
    // Clear the anonymous session data after successful migration
    await storage.clearAnonymousSessionData(anonymousSessionId);
    
    return migratedCount;
  } catch (error) {
    logger.error('Error migrating anonymous data', { 
      error: error instanceof Error ? error.message : String(error),
      anonymousSessionId,
      userId 
    });
    throw new Error('Failed to migrate anonymous data');
  }
}

/**
 * User management functions
 */

/**
 * Update a user's profile information
 * @param userId The ID of the user to update
 * @param data The data to update
 * @returns The updated user object
 * @throws UserNotFoundError if the user doesn't exist
 */
export async function updateUserProfile(userId: number, data: Partial<User>): Promise<User> {
  try {
    // Get the current user to ensure they exist
    const currentUser = await storage.getUser(userId);
    
    if (!currentUser) {
      throw new UserNotFoundError(`User with ID ${userId} not found`);
    }
    
    // Check if the email is being changed and verify it's not already in use
    if (data.email && data.email !== currentUser.email) {
      const existingUser = await storage.getUserByEmail(data.email);
      
      if (existingUser && existingUser.id !== userId) {
        throw new UserAlreadyExistsError('A user with this email already exists');
      }
      
      // New email requires verification
      data.is_verified = false;
      data.verification_token = generateSecureToken();
      
      // In production, send verification email here
      logger.info('User email changed, verification required', { userId, newEmail: data.email });
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`New verification token for ${data.email}: ${data.verification_token}`);
      }
    }
    
    // Check if username is being changed and verify it's not already in use
    if (data.username && data.username !== currentUser.username) {
      const existingUser = await storage.getUserByUsername(data.username);
      
      if (existingUser && existingUser.id !== userId) {
        throw new UserAlreadyExistsError('Username is already taken');
      }
    }
    
    // Update the user
    const updatedUser = await storage.updateUser(userId, data);
    
    logger.info('User profile updated', { userId });
    
    return updatedUser;
  } catch (error) {
    // Rethrow AuthErrors
    if (error instanceof AuthError) {
      throw error;
    }
    
    logger.error('Error updating user profile', { 
      error: error instanceof Error ? error.message : String(error),
      userId 
    });
    throw new Error('Failed to update user profile');
  }
}

/**
 * Change a user's password
 * @param userId The ID of the user
 * @param currentPassword The current password for verification
 * @param newPassword The new password to set
 * @returns The updated user object
 * @throws InvalidCredentialsError if the current password is incorrect
 * @throws UserNotFoundError if the user doesn't exist
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<User> {
  try {
    // Get the current user to ensure they exist
    const user = await storage.getUser(userId);
    
    if (!user) {
      throw new UserNotFoundError(`User with ID ${userId} not found`);
    }
    
    // Verify the current password
    const passwordValid = await verifyPassword(currentPassword, user.password_hash);
    
    if (!passwordValid) {
      throw new InvalidCredentialsError('Current password is incorrect');
    }
    
    // Hash the new password
    const { hash, salt } = await hashPassword(newPassword);
    
    // Update the user with the new password
    const updatedUser = await storage.updateUser(userId, {
      password_hash: hash,
      password_salt: salt,
    });
    
    // Invalidate all existing sessions for security
    await invalidateAllUserSessions(userId);
    
    logger.info('User password changed', { userId });
    
    return updatedUser;
  } catch (error) {
    // Rethrow AuthErrors
    if (error instanceof AuthError) {
      throw error;
    }
    
    logger.error('Error changing password', { 
      error: error instanceof Error ? error.message : String(error),
      userId 
    });
    throw new Error('Failed to change password');
  }
}

// Export all functions as a service object
export const authService = {
  registerUser,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  authenticateUser,
  createUserSession,
  validateUserSession,
  invalidateUserSession,
  invalidateAllUserSessions,
  getOrCreateAnonymousSession,
  migrateAnonymousData,
  updateUserProfile,
  changePassword,
  generateJwtToken,
  verifyJwtToken,
  hashPassword,
  verifyPassword,
};