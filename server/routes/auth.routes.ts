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
  clearSessionCookie,
  validateSession,
  getUserById
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
    
    // Create a session token for the new user - this solves the authentication issue
    const authToken = `auth_token_${user.id}_${Date.now()}`;
    
    // Set the auth token cookie
    res.cookie('auth_session', authToken, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
      path: '/'
    });
    
    logger.info(`User registered successfully: ${user.username || validatedData.username}`);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      user,
      authToken // Include token in response so client can store it
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
 * 
 * This endpoint handles authentication in multiple ways to ensure it works
 * with various client implementations:
 * 1. Regular session-based authentication (req.user)
 * 2. Cookie-based authentication (auth_session cookie)
 * 3. Authorization header (Bearer token)
 */
router.post('/migrate', async (req: Request, res: Response) => {
  try {
    // Debug logging to help diagnose authentication issues
    logger.debug(`Migration request received`);
    logger.debug(`Auth status: isAuthenticated=${req.isAuthenticated}, user=${JSON.stringify(req.user || 'none')}`);
    logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
    logger.debug(`Request cookies: ${JSON.stringify(req.cookies)}`);
    
    // Step 1: Try to authenticate user from various sources if not already authenticated
    if (!req.isAuthenticated || !req.user) {
      let userId = null;
      
      // Method 1: Check auth_session cookie
      const authCookie = req.cookies?.auth_session;
      if (authCookie) {
        logger.debug(`Found auth cookie, attempting to validate: ${authCookie.substring(0, 10)}...`);
        try {
          userId = await validateSession(authCookie);
          if (userId) {
            logger.debug(`Successfully validated user from cookie: ${userId}`);
          }
        } catch (error) {
          logger.warn('Cookie authentication failed:', error);
        }
      }
      
      // Method 2: Check Authorization header (Bearer token)
      if (!userId && req.headers.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.substring(7);
        logger.debug(`Found Bearer token, attempting to validate: ${token.substring(0, 10)}...`);
        try {
          userId = await validateSession(token);
          if (userId) {
            logger.debug(`Successfully validated user from Bearer token: ${userId}`);
          }
        } catch (error) {
          logger.warn('Bearer token authentication failed:', error);
        }
      }
      
      // If we found a valid user ID from any auth method, load the user
      if (userId) {
        const user = await getUserById(userId);
        if (user) {
          req.user = user;
          req.isAuthenticated = true;
          req.isAnonymous = false;
          logger.info(`Successfully authenticated user for migration: ${user.username}`);
        }
      }
    }
    
    // Now check if authentication was successful
    if (!req.isAuthenticated || !req.user || !req.user.id) {
      logger.warn('Migration failed: User not authenticated', {
        isAuthenticated: req.isAuthenticated,
        hasUser: !!req.user,
        userId: req.user?.id,
        authCookie: !!req.cookies?.auth_session,
        hasAuthHeader: !!req.headers.authorization,
        anonymousSessionId: req.body.anonymousSessionId
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication required for migration. Please log in and try again.',
        error: {
          code: 'AUTH_REQUIRED'
        }
      });
    }

    const userId = req.user.id;
    
    // Get anonymous session ID from request - we support multiple formats/locations
    let sessionId = null;
    
    // Check for session ID in body with either 'anonymousSessionId' or 'sessionId' key
    if (req.body.anonymousSessionId) {
      sessionId = req.body.anonymousSessionId;
      logger.debug(`Found session ID in request body (anonymousSessionId): ${sessionId}`);
    } else if (req.body.sessionId) {
      sessionId = req.body.sessionId;
      logger.debug(`Found session ID in request body (sessionId): ${sessionId}`);
    }
    
    // If not in body, check for X-Anonymous-Session header
    if (!sessionId && req.headers['x-anonymous-session']) {
      const headerValue = req.headers['x-anonymous-session'];
      sessionId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      logger.debug(`Found session ID in X-Anonymous-Session header: ${sessionId}`);
    }
    
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
    
    // All validation passed, perform the migration
    logger.info(`Starting migration from session ${sessionId} to user ${userId} (${req.user.username})`);
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
    // Log error with detailed information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    logger.error('Migration error', { 
      error: errorMessage,
      stack: errorStack,
      userId: req.user?.id,
      anonymousSessionId: req.body.anonymousSessionId 
    });
    
    // Return more specific error info if it's a validation error
    if (error instanceof z.ZodError) {
      logger.warn('Migration validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Migration failed. Please try again later.',
      error: {
        message: errorMessage,
        code: 'MIGRATION_ERROR',
      },
    });
  }
});

/**
 * POST /api/auth/migrate-anonymous-data
 * Alias for /api/auth/migrate to maintain backward compatibility with client apps
 * 
 * Enhanced version with better client compatibility and more robust error handling
 * to ensure successful migration between anonymous and registered user states.
 */
router.post('/migrate-anonymous-data', async (req: Request, res: Response) => {
  try {
    // More detailed logging to diagnose issues
    logger.debug(`Migration request received on '/migrate-anonymous-data'`);
    logger.debug(`Request body: ${JSON.stringify(req.body)}`);
    logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
    logger.debug(`Request cookies: ${JSON.stringify(req.cookies)}`);
    logger.debug(`Auth status: isAuthenticated=${req.isAuthenticated}, user=${JSON.stringify(req.user || 'none')}`);
    
    // Use the same authentication approach as the primary endpoint
    if (!req.isAuthenticated || !req.user) {
      let userId = null;
      
      // Method 1: Check auth_session cookie (multiple possible names)
      const cookieNames = ['auth_session', 'auth_token', 'authToken'];
      for (const cookieName of cookieNames) {
        const authCookie = req.cookies?.[cookieName];
        if (authCookie) {
          try {
            logger.debug(`Found auth cookie ${cookieName}, attempting to validate: ${authCookie.substring(0, 10)}...`);
            userId = await validateSession(authCookie);
            if (userId) {
              logger.debug(`Successfully validated user from cookie ${cookieName}: ${userId}`);
              break; // Exit the loop once we find a valid cookie
            }
          } catch (error) {
            logger.warn(`Cookie authentication failed for ${cookieName}:`, error);
          }
        }
      }
      
      // Method 2: Check Authorization header (Bearer token)
      if (!userId && req.headers.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.substring(7);
        try {
          logger.debug(`Found Bearer token, attempting to validate: ${token.substring(0, 10)}...`);
          userId = await validateSession(token);
          if (userId) {
            logger.debug(`Successfully validated user from Bearer token: ${userId}`);
          }
        } catch (error) {
          logger.warn('Bearer token authentication failed:', error);
        }
      }
      
      // Method 3: Check for auth token in request body options (from client)
      if (!userId && req.body.options?.authToken) {
        try {
          logger.debug(`Found auth token in request body options, attempting to validate: ${req.body.options.authToken.substring(0, 10)}...`);
          userId = await validateSession(req.body.options.authToken);
          if (userId) {
            logger.debug(`Successfully validated user from request body token: ${userId}`);
          }
        } catch (error) {
          logger.warn('Request body token authentication failed:', error);
        }
      }
      
      // Method 4: Fall back to request.body.authToken directly
      if (!userId && req.body.authToken) {
        try {
          logger.debug(`Found auth token directly in request body, attempting to validate: ${req.body.authToken.substring(0, 10)}...`);
          userId = await validateSession(req.body.authToken);
          if (userId) {
            logger.debug(`Successfully validated user from direct request body token: ${userId}`);
          }
        } catch (error) {
          logger.warn('Direct request body token authentication failed:', error);
        }
      }
      
      // Method 5: If userId is directly provided in options for development environments
      if (!userId && process.env.NODE_ENV === 'development') {
        let providedUserId: number | undefined = undefined;
        
        // Try to get userId from options object
        if (req.body.options?.userId) {
          const parsedId = parseInt(req.body.options.userId, 10);
          if (!isNaN(parsedId)) {
            providedUserId = parsedId;
          }
        } 
        // Or try direct from body
        else if (req.body.userId) {
          const parsedId = parseInt(req.body.userId, 10);
          if (!isNaN(parsedId)) {
            providedUserId = parsedId;
          }
        }
        
        if (providedUserId !== undefined) {
          logger.debug(`Using provided userId from request for development: ${providedUserId}`);
          userId = providedUserId;
        }
      }
      
      // If we found a valid user ID from any auth method, load the user
      if (userId) {
        const user = await getUserById(userId);
        if (user) {
          req.user = user;
          req.isAuthenticated = true;
          req.isAnonymous = false;
          logger.info(`Successfully authenticated user for migration: ${user.username}`);
        } else {
          logger.warn(`User not found for ID: ${userId}`);
        }
      }
    }
    
    // Make sure user is authenticated
    if (!req.isAuthenticated || !req.user || !req.user.id) {
      logger.warn('Migration failed: User not authenticated', {
        isAuthenticated: req.isAuthenticated,
        hasUser: !!req.user,
        userId: req.user?.id,
        authCookie: !!req.cookies?.auth_session,
        hasAuthHeader: !!req.headers.authorization,
        hasAuthTokenInOptions: !!req.body.options?.authToken,
        hasDirectAuthToken: !!req.body.authToken,
        requestHasSessionId: !!req.body.anonymousSessionId || !!req.body.sessionId
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication required for migration. Please log in and try again.',
        error: {
          code: 'AUTH_REQUIRED',
        },
      });
    }
    
    const userId = req.user.id;
    
    // Extract sessionId from various possible locations with more flexibility
    let sessionId = null;
    
    try {
      // First try standard schema validation
      const validatedData = migrateAnonymousDataSchema.parse(req.body);
      sessionId = validatedData.anonymousSessionId;
      logger.debug(`Request passed schema validation, using session ID: ${sessionId}`);
    } catch (validationError) {
      // If schema validation fails, try to find the session ID in alternative locations
      logger.debug('Schema validation failed, looking for session ID in alternative locations');
      
      // Check direct in body with either key name
      if (req.body.anonymousSessionId) {
        sessionId = req.body.anonymousSessionId;
        logger.debug(`Found session ID in request body.anonymousSessionId: ${sessionId}`);
      } else if (req.body.sessionId) {
        sessionId = req.body.sessionId;
        logger.debug(`Found session ID in request body.sessionId: ${sessionId}`);
      } 
      // Check in headers
      else if (req.headers['x-anonymous-session']) {
        const headerValue = req.headers['x-anonymous-session'];
        sessionId = Array.isArray(headerValue) ? headerValue[0] : headerValue as string;
        logger.debug(`Found session ID in x-anonymous-session header: ${sessionId}`);
      }
      
      // If still not found, this will trigger an error below
    }
    
    // Final validation of the session ID
    if (!sessionId) {
      logger.error('Missing anonymous session ID for migration');
      return res.status(400).json({
        success: false,
        message: 'Anonymous session ID is required for migration',
        error: {
          code: 'MISSING_SESSION_ID'
        }
      });
    }
    
    // Validate session ID format
    if (!sessionId.startsWith('anon_')) {
      logger.error(`Invalid anonymous session ID format: ${sessionId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid anonymous session ID format. Must start with "anon_"',
        error: {
          code: 'INVALID_SESSION_FORMAT'
        }
      });
    }
    
    // Perform the migration using the shared service function
    logger.info(`Starting migration from session ${sessionId} to user ${userId} (${req.user.username})`);
    
    try {
      const result = await migrateAnonymousData(sessionId, userId);
      
      logger.info(`Migration successful for user ${req.user.username}: ${result.migratedVideos} videos migrated`);
      
      res.json({
        success: true,
        message: `Successfully migrated ${result.migratedVideos} videos to your account.`,
        data: {
          migratedVideos: result.migratedVideos,
        },
      });
    } catch (migrationError) {
      logger.error('Migration service error:', migrationError);
      
      // Send a more specific error message to the client
      res.status(500).json({
        success: false,
        message: migrationError instanceof Error ? migrationError.message : 'Migration failed.',
        error: {
          code: 'MIGRATION_ERROR'
        }
      });
    }
  } catch (error) {
    // Handle validation errors distinctly
    if (error instanceof z.ZodError) {
      logger.warn('Migration validation error', { error: error.errors });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    
    // Log error with detailed information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    logger.error('Migration error', { 
      error: errorMessage,
      stack: errorStack,
      userId: req.user?.id,
      anonymousSessionId: req.body.anonymousSessionId 
    });
    
    res.status(500).json({
      success: false,
      message: 'Migration failed. Please try again later.',
      error: {
        message: errorMessage,
        code: 'MIGRATION_ERROR',
      },
    });
  }
});

export default router;