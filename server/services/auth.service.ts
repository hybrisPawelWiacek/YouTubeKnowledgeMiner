import { db } from '../db';
import { storage } from '../storage';
import { eq, and } from 'drizzle-orm';
import { 
  users, user_sessions, 
  type User, type UserSession, type InsertUser, 
  type InsertUserSession, type RegisterRequest 
} from '@shared/schema';
import * as crypto from 'crypto';
import { log } from '../vite';
import { createLogger } from './logger';

// Create a dedicated auth logger that writes to auth-specific log files
const logger = createLogger('auth');

/**
 * Authentication Service
 * 
 * Handles user authentication, registration, and session management
 */
export class AuthService {
  /**
   * Generate a secure random token
   * @param length The length of the token to generate
   * @returns A random string token
   */
  private generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash a password with a salt using PBKDF2
   * @param password The plain text password
   * @param salt The salt to use (will be generated if not provided)
   * @returns An object containing the password hash and salt
   */
  private async hashPassword(password: string, existingSalt?: string): Promise<{ hash: string, salt: string }> {
    const salt = existingSalt || crypto.randomBytes(16).toString('hex');
    
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
        if (err) return reject(err);
        resolve({
          hash: derivedKey.toString('hex'),
          salt
        });
      });
    });
  }

  /**
   * Verify a password against a stored hash
   * @param password The plain text password to verify
   * @param storedHash The stored password hash
   * @param salt The salt used to hash the password
   * @returns True if the password matches, false otherwise
   */
  private async verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
    const { hash } = await this.hashPassword(password, salt);
    return hash === storedHash;
  }

  /**
   * Create a new user account
   * @param userData The user registration data
   * @returns The newly created user
   * @throws Error if username or email already exists
   */
  async register(userData: RegisterRequest): Promise<User> {
    logger.info(`Registering new user with username: ${userData.username}`);
    
    try {
      // Check if username already exists
      const existingUsername = await storage.getUserByUsername(userData.username);
      if (existingUsername) {
        logger.warn(`Registration failed: Username ${userData.username} already exists`);
        throw new Error('Username already exists');
      }
      
      // Check if email already exists
      const existingEmail = await db.query.users.findFirst({
        where: eq(users.email, userData.email)
      });
      
      if (existingEmail) {
        logger.warn(`Registration failed: Email ${userData.email} already exists`);
        throw new Error('Email already exists');
      }
      
      // Hash the password
      const { hash, salt } = await this.hashPassword(userData.password);
      
      // Generate verification token
      const verificationToken = this.generateToken();
      
      // Create the user record
      const newUser = await storage.createUser({
        username: userData.username,
        email: userData.email,
        password_hash: hash,
        password_salt: salt,
        is_verified: false, // Require email verification
        verification_token: verificationToken
      } as InsertUser);
      
      logger.info(`User registered successfully: ${newUser.id} (${newUser.username})`);
      
      return newUser;
    } catch (error) {
      logger.error(`Registration error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Authenticate a user by email/username and password
   * @param emailOrUsername The user's email or username
   * @param password The user's password
   * @returns The authenticated user or null if authentication fails
   */
  async login(emailOrUsername: string, password: string): Promise<User | null> {
    logger.info(`Login attempt for: ${emailOrUsername}`);
    
    try {
      // Determine if input is an email or username
      const isEmail = emailOrUsername.includes('@');
      
      // Find the user by email or username
      let user: User | undefined;
      
      if (isEmail) {
        // Find by email
        user = await db.query.users.findFirst({
          where: eq(users.email, emailOrUsername)
        });
      } else {
        // Find by username
        user = await storage.getUserByUsername(emailOrUsername);
      }
      
      // If user not found, return null
      if (!user) {
        logger.warn(`Login failed: User not found for ${emailOrUsername}`);
        return null;
      }
      
      // Verify password
      const passwordValid = await this.verifyPassword(
        password, 
        user.password_hash, 
        user.password_salt
      );
      
      if (!passwordValid) {
        logger.warn(`Login failed: Invalid password for ${emailOrUsername}`);
        return null;
      }
      
      // Update last login timestamp
      await db.update(users)
        .set({ last_login: new Date() })
        .where(eq(users.id, user.id));
      
      logger.info(`User logged in successfully: ${user.id} (${user.username})`);
      
      return user;
    } catch (error) {
      logger.error(`Login error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Create a new session for a user
   * @param userId The user ID to create a session for
   * @param userAgent The user agent string from the request
   * @param ipAddress The IP address of the request
   * @returns The created session
   */
  async createSession(userId: number, userAgent?: string, ipAddress?: string): Promise<UserSession> {
    logger.info(`Creating session for user ${userId}`);
    
    try {
      // Generate a session token
      const sessionToken = this.generateToken(64);
      
      // Set session expiry (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Create session in database
      const session = await db.insert(user_sessions)
        .values({
          user_id: userId,
          session_token: sessionToken,
          expires_at: expiresAt,
          user_agent: userAgent,
          ip_address: ipAddress
        } as InsertUserSession)
        .returning();
      
      logger.info(`Session created successfully for user ${userId}: ${session[0].id}`);
      
      return session[0];
    } catch (error) {
      logger.error(`Session creation error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get a user session by token
   * @param token The session token
   * @returns The session or null if not found or expired
   */
  async getSessionByToken(token: string): Promise<UserSession | null> {
    try {
      const session = await db.query.user_sessions.findFirst({
        where: eq(user_sessions.session_token, token)
      });
      
      if (!session) {
        return null;
      }
      
      // Check if session is expired
      if (new Date() > session.expires_at) {
        // Delete expired session
        await db.delete(user_sessions)
          .where(eq(user_sessions.id, session.id));
        
        logger.info(`Expired session removed: ${session.id}`);
        return null;
      }
      
      // Update last active timestamp
      await db.update(user_sessions)
        .set({ last_active_at: new Date() })
        .where(eq(user_sessions.id, session.id));
      
      return session;
    } catch (error) {
      logger.error(`Error getting session by token: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Get a user by session token
   * @param token The session token
   * @returns The user associated with the session or null if not found
   */
  async getUserBySessionToken(token: string): Promise<User | null> {
    try {
      const session = await this.getSessionByToken(token);
      
      if (!session) {
        return null;
      }
      
      const user = await storage.getUser(session.user_id);
      
      return user || null;
    } catch (error) {
      logger.error(`Error getting user by session token: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Invalidate a user session
   * @param token The session token to invalidate
   * @returns True if the session was found and deleted, false otherwise
   */
  async invalidateSession(token: string): Promise<boolean> {
    try {
      const result = await db.delete(user_sessions)
        .where(eq(user_sessions.session_token, token))
        .returning();
      
      if (result.length === 0) {
        return false;
      }
      
      logger.info(`Session invalidated: ${result[0].id}`);
      return true;
    } catch (error) {
      logger.error(`Error invalidating session: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Invalidate all sessions for a user
   * @param userId The user ID to invalidate sessions for
   * @returns The number of sessions invalidated
   */
  async invalidateAllUserSessions(userId: number): Promise<number> {
    try {
      const result = await db.delete(user_sessions)
        .where(eq(user_sessions.user_id, userId))
        .returning();
      
      logger.info(`All sessions invalidated for user ${userId}: ${result.length} sessions removed`);
      
      return result.length;
    } catch (error) {
      logger.error(`Error invalidating all user sessions: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  /**
   * Start the password reset process for a user
   * @param email The email of the user to reset password for
   * @returns The reset token if successful, null if user not found
   */
  async initiatePasswordReset(email: string): Promise<string | null> {
    try {
      // Find user by email
      const user = await db.query.users.findFirst({
        where: eq(users.email, email)
      });
      
      if (!user) {
        logger.warn(`Password reset failed: No user found with email ${email}`);
        return null;
      }
      
      // Generate reset token
      const resetToken = this.generateToken();
      
      // Set token expiry (1 hour from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      
      // Update user with reset token
      await db.update(users)
        .set({ 
          reset_token: resetToken,
          reset_token_expires: expiresAt
        })
        .where(eq(users.id, user.id));
      
      logger.info(`Password reset initiated for user ${user.id} (${user.username})`);
      
      return resetToken;
    } catch (error) {
      logger.error(`Error initiating password reset: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Complete the password reset process
   * @param token The reset token
   * @param newPassword The new password
   * @returns True if the password was reset, false otherwise
   */
  async completePasswordReset(token: string, newPassword: string): Promise<boolean> {
    try {
      // Find user by reset token
      const user = await db.query.users.findFirst({
        where: eq(users.reset_token, token)
      });
      
      if (!user) {
        logger.warn('Password reset failed: Invalid token');
        return false;
      }
      
      // Check if token is expired
      if (!user.reset_token_expires || new Date() > user.reset_token_expires) {
        logger.warn(`Password reset failed: Token expired for user ${user.id}`);
        return false;
      }
      
      // Hash the new password
      const { hash, salt } = await this.hashPassword(newPassword);
      
      // Update user with new password and clear reset token
      await db.update(users)
        .set({ 
          password_hash: hash,
          password_salt: salt,
          reset_token: null,
          reset_token_expires: null
        })
        .where(eq(users.id, user.id));
      
      logger.info(`Password reset completed for user ${user.id} (${user.username})`);
      
      return true;
    } catch (error) {
      logger.error(`Error completing password reset: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Verify a user's email 
   * @param token The verification token
   * @returns True if the email was verified, false otherwise
   */
  async verifyEmail(token: string): Promise<boolean> {
    try {
      // Find user by verification token
      const user = await db.query.users.findFirst({
        where: eq(users.verification_token, token)
      });
      
      if (!user) {
        logger.warn('Email verification failed: Invalid token');
        return false;
      }
      
      // Update user to verified and clear verification token
      await db.update(users)
        .set({ 
          is_verified: true,
          verification_token: null
        })
        .where(eq(users.id, user.id));
      
      logger.info(`Email verified for user ${user.id} (${user.username})`);
      
      return true;
    } catch (error) {
      logger.error(`Error verifying email: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Migrate videos from an anonymous session to a registered user
   * @param userId The user ID to migrate to
   * @param anonymousSessionId The anonymous session ID to migrate from
   * @returns The number of videos migrated
   */
  async migrateAnonymousSession(userId: number, anonymousSessionId: string): Promise<number> {
    logger.info(`Migrating anonymous session ${anonymousSessionId} to user ${userId}`);
    
    try {
      // Get videos from anonymous session
      const videos = await storage.getVideosByAnonymousSessionId(anonymousSessionId);
      
      if (!videos || videos.length === 0) {
        logger.info(`No videos to migrate from anonymous session ${anonymousSessionId}`);
        return 0;
      }
      
      // Update the videos to belong to the user
      let migratedCount = 0;
      
      for (const video of videos) {
        await storage.updateVideo(video.id, { 
          user_id: userId,
          user_type: 'registered',
          anonymous_session_id: null
        });
        migratedCount++;
      }
      
      logger.info(`Successfully migrated ${migratedCount} videos from anonymous session ${anonymousSessionId} to user ${userId}`);
      
      return migratedCount;
    } catch (error) {
      logger.error(`Error migrating anonymous session: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

// Export a singleton instance
export const authService = new AuthService();