import { Router } from 'express';
import { db } from '../db';
import { storage } from '../storage';
import { ZodError } from 'zod';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validation.middleware';
import { 
  loginSchema, 
  registerSchema, 
  passwordResetRequestSchema, 
  passwordResetSchema 
} from '@shared/schema';
import { createLogger } from '../services/logger';

const logger = createLogger('auth');
const router = Router();

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const userData = req.body;
    
    // Create new user
    const user = await authService.register(userData);
    
    // Create session for the new user
    const session = await authService.createSession(
      user.id, 
      req.headers['user-agent'],
      req.ip
    );
    
    // If there's an anonymous session, migrate its content
    const anonymousSessionId = req.cookies.anonymousSessionId;
    if (anonymousSessionId) {
      try {
        const migratedCount = await authService.migrateAnonymousSession(user.id, anonymousSessionId);
        logger.info(`Migrated ${migratedCount} videos from anonymous session to new user: ${user.id}`);
      } catch (err) {
        logger.error(`Error migrating anonymous session: ${err instanceof Error ? err.message : String(err)}`);
        // Continue despite migration error
      }
    }
    
    // Set session cookie
    res.cookie('sessionToken', session.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax'
    });
    
    // Return user data without sensitive info
    const { password_hash, password_salt, verification_token, reset_token, ...safeUser } = user;
    
    res.status(201).json({
      user: safeUser,
      message: 'User registered successfully'
    });
  } catch (error) {
    logger.error(`Registration error: ${error instanceof Error ? error.message : String(error)}`);
    
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
    }
    
    res.status(500).json({ error: 'Error creating user account' });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Authenticate user & get token
 * @access Public
 */
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Authenticate user
    const user = await authService.login(email, password);
    
    if (!user) {
      logger.warn(`Failed login attempt for: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Create new session
    const session = await authService.createSession(
      user.id, 
      req.headers['user-agent'],
      req.ip
    );
    
    // If there's an anonymous session, migrate its content
    const anonymousSessionId = req.cookies.anonymousSessionId;
    if (anonymousSessionId) {
      try {
        const migratedCount = await authService.migrateAnonymousSession(user.id, anonymousSessionId);
        logger.info(`Migrated ${migratedCount} videos from anonymous session to user: ${user.id}`);
      } catch (err) {
        logger.error(`Error migrating anonymous session: ${err instanceof Error ? err.message : String(err)}`);
        // Continue despite migration error
      }
    }
    
    // Set session cookie
    res.cookie('sessionToken', session.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax'
    });
    
    // Return user data without sensitive info
    const { password_hash, password_salt, verification_token, reset_token, ...safeUser } = user;
    
    res.json({
      user: safeUser,
      message: 'Login successful'
    });
  } catch (error) {
    logger.error(`Login error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user & clear cookies
 * @access Private
 */
router.post('/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies.sessionToken;
    
    if (sessionToken) {
      // Invalidate session in database
      await authService.invalidateSession(sessionToken);
      
      // Clear session cookie
      res.clearCookie('sessionToken');
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`Logout error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user's profile
 * @access Private
 */
router.get('/me', async (req, res) => {
  try {
    // Check if user is authenticated through middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Return user data without sensitive info
    const { password_hash, password_salt, verification_token, reset_token, ...safeUser } = req.user;
    
    res.json({ user: safeUser });
  } catch (error) {
    logger.error(`Get user profile error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * @route POST /api/auth/request-password-reset
 * @desc Request a password reset link
 * @access Public
 */
router.post('/request-password-reset', validate(passwordResetRequestSchema), async (req, res) => {
  try {
    const { email } = req.body;
    
    // Initiate password reset process
    const resetToken = await authService.initiatePasswordReset(email);
    
    // For security reasons, always indicate success, even if email doesn't exist
    res.json({ 
      message: 'If your email exists in our system, you will receive a password reset link' 
    });
    
    // Note: In a production app, you would send an email with the reset link here
    if (resetToken) {
      logger.info(`Password reset token generated for ${email}: ${resetToken}`);
      // For development, log the token
      console.log(`Reset token for ${email}: ${resetToken}`); 
    }
  } catch (error) {
    logger.error(`Password reset request error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password using token
 * @access Public
 */
router.post('/reset-password', validate(passwordResetSchema), async (req, res) => {
  try {
    const { token, password } = req.body;
    
    // Complete password reset
    const success = await authService.completePasswordReset(token, password);
    
    if (!success) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    logger.error(`Password reset error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * @route GET /api/auth/verify-email/:token
 * @desc Verify user email with token
 * @access Public
 */
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Verify email with token
    const success = await authService.verifyEmail(token);
    
    if (!success) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }
    
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    logger.error(`Email verification error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

export default router;