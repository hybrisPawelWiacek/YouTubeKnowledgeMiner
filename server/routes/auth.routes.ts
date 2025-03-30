/**
 * Authentication Routes
 * 
 * Handles all authentication-related API endpoints, including user registration,
 * login, logout, password reset, and email verification.
 */

import { Router, Request, Response } from 'express';
import { 
  registerUser, 
  loginUser, 
  logoutUser, 
  generatePasswordResetToken,
  resetPassword,
  verifyEmail,
  changePassword,
  setSessionCookie,
  clearSessionCookie
} from '../services/auth.service';
import { migrateAnonymousData } from '../services/migration.service';
import { 
  registerUserSchema, 
  loginUserSchema, 
  resetPasswordRequestSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  migrateAnonymousDataSchema,
} from '../../shared/schema';
import { requireAuth } from '../middleware/auth.middleware';
import winston from 'winston';
import { z } from 'zod';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-routes' },
  transports: [
    new winston.transports.File({ filename: 'logs/auth-routes.log' }),
  ],
});

// If we're in development, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = registerUserSchema.parse(req.body);
    
    const user = await registerUser(validatedData);
    
    logger.info(`User registered successfully: ${user.username || validatedData.username}`);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Registration validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        logger.warn('Registration failed - already exists', { error: error.message });
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }
    }
    
    logger.error('Registration error', { error });
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/login
 * Login a user
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validatedData = loginUserSchema.parse(req.body);
    
    const result = await loginUser(validatedData, req);
    
    // Set session cookie
    setSessionCookie(res, result.session.id, result.session.expires_at);
    
    logger.info(`User logged in: ${result.user.username}`);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: result.user,
      // Only send refresh token to client if remember me was selected
      refresh_token: result.refresh_token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Login validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    if (error instanceof Error) {
      // For security, always use the same message for invalid credentials
      if (error.message.includes('Invalid username or password') || 
          error.message.includes('Account is not active')) {
        logger.warn('Login failed', { error: error.message });
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
      }
    }
    
    logger.error('Login error', { error });
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout a user
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.sessionId) {
      await logoutUser(req.sessionId);
      clearSessionCookie(res);
      
      logger.info(`User logged out: ${req.user.username}`);
    }
    
    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    logger.error('Logout error', { error });
    res.status(500).json({
      success: false,
      message: 'Logout failed. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/reset-password-request
 * Request a password reset
 */
router.post('/reset-password-request', async (req: Request, res: Response) => {
  try {
    const validatedData = resetPasswordRequestSchema.parse(req.body);
    
    await generatePasswordResetToken(validatedData.email);
    
    // For security, always return success even if email doesn't exist
    // This prevents user enumeration
    logger.info(`Password reset requested for: ${validatedData.email}`);
    
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Reset password validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    logger.error('Reset password request error', { error });
    res.status(500).json({
      success: false,
      message: 'Password reset request failed. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset a password using a token
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);
    
    const success = await resetPassword(validatedData.token, validatedData.password);
    
    if (success) {
      logger.info('Password reset successful');
      
      res.json({
        success: true,
        message: 'Password reset successful. You can now login with your new password.',
      });
    } else {
      logger.warn('Password reset failed - invalid or expired token');
      
      res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token.',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Reset password validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    logger.error('Reset password error', { error });
    res.status(500).json({
      success: false,
      message: 'Password reset failed. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/verify-email
 * Verify a user's email address
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const validatedData = verifyEmailSchema.parse(req.body);
    
    const success = await verifyEmail(validatedData.token);
    
    if (success) {
      logger.info('Email verification successful');
      
      res.json({
        success: true,
        message: 'Email verification successful. You can now login to your account.',
      });
    } else {
      logger.warn('Email verification failed - invalid or expired token');
      
      res.status(400).json({
        success: false,
        message: 'Invalid or expired email verification token.',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Email verification validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    logger.error('Email verification error', { error });
    res.status(500).json({
      success: false,
      message: 'Email verification failed. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change a user's password (requires authentication)
 */
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const validatedData = changePasswordSchema.parse(req.body);
    
    const success = await changePassword(
      req.user.id, 
      validatedData.current_password, 
      validatedData.new_password
    );
    
    if (success) {
      logger.info(`Password changed for user: ${req.user.username}`);
      
      res.json({
        success: true,
        message: 'Password changed successfully.',
      });
    } else {
      logger.warn(`Password change failed for user: ${req.user.username} - invalid current password`);
      
      res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Change password validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    logger.error('Change password error', { error });
    res.status(500).json({
      success: false,
      message: 'Password change failed. Please try again later.',
    });
  }
});

/**
 * GET /api/auth/me
 * Get the current user's profile
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    logger.error('Get user profile error', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user profile.',
    });
  }
});

/**
 * POST /api/auth/migrate
 * Migrate data from anonymous session to authenticated user
 */
router.post('/migrate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    // Get anonymous session ID from request header or body
    const sessionId = req.body.anonymousSessionId || 
                      req.body.sessionId || 
                      (req.headers['x-anonymous-session'] ? 
                        (Array.isArray(req.headers['x-anonymous-session']) ? 
                          req.headers['x-anonymous-session'][0] : 
                          req.headers['x-anonymous-session']) : 
                        null);
    
    if (!sessionId) {
      logger.warn(`Migration failed: No session ID provided for user ${req.user.username}`);
      return res.status(400).json({
        success: false,
        message: 'Anonymous session ID is required',
      });
    }
    
    // Validate that the sessionId has the expected format (anon_*)
    if (!sessionId.startsWith('anon_')) {
      logger.warn(`Migration failed: Invalid session ID format for user ${req.user.username}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid anonymous session ID format',
      });
    }
    
    // Migrate the data
    const result = await migrateAnonymousData(sessionId, userId);
    
    logger.info(`Migration successful for user ${req.user.username}: ${result.migratedVideos} videos migrated`);
    
    res.json({
      success: true,
      message: `Successfully migrated ${result.migratedVideos} videos to your account.`,
      data: {
        migratedVideos: result.migratedVideos,
      },
    });
  } catch (error) {
    logger.error('Migration error', { error });
    
    res.status(500).json({
      success: false,
      message: 'Migration failed. Please try again later.',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'MIGRATION_ERROR',
      },
    });
  }
});

/**
 * POST /api/auth/migrate-anonymous-data
 * Alias for /api/auth/migrate to maintain backward compatibility with client apps
 */
router.post('/migrate-anonymous-data', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    // Validate request data
    const validatedData = migrateAnonymousDataSchema.parse(req.body);
    const sessionId = validatedData.anonymousSessionId;
    
    // Migrate the data
    const result = await migrateAnonymousData(sessionId, userId);
    
    logger.info(`Migration successful for user ${req.user.username}: ${result.migratedVideos} videos migrated`);
    
    res.json({
      success: true,
      message: `Successfully migrated ${result.migratedVideos} videos to your account.`,
      data: {
        migratedVideos: result.migratedVideos,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Migration validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    logger.error('Migration error', { error });
    
    res.status(500).json({
      success: false,
      message: 'Migration failed. Please try again later.',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'MIGRATION_ERROR',
      },
    });
  }
});

export default router;