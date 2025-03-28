/**
 * Authentication Routes
 * 
 * This module provides all routes related to authentication:
 * - User registration, login, and logout
 * - Email verification
 * - Password reset
 * - Profile management
 * - Anonymous session management
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';

import { 
  authenticateUser, 
  requireAuth 
} from '../middleware/auth.middleware';

import { validateBody } from '../middleware/validation.middleware';

import {
  loginSchema, 
  registerSchema, 
  passwordResetRequestSchema,
  passwordResetSchema,
  anonymousSessionSchema,
  verifyEmailSchema,
  updateProfileSchema
} from '@shared/schema';

import { 
  apiSuccess, 
  apiError,
  apiValidationError,
  apiCreated
} from '../utils/response.utils';

import { 
  authService, 
  AuthError, 
  UserAlreadyExistsError,
  InvalidCredentialsError,
  EmailNotVerifiedError,
  SessionError
} from '../services/auth.service';

import { sessionService } from '../services/session.service';
import { asyncHandler } from '../utils/error.utils';
import { createLogger } from '../services/logger';

const router = express.Router();
const logger = createLogger('auth-routes');

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', 
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { username, email, password, anonymousSessionId } = req.body;
      
      // Register the user
      const newUser = await authService.registerUser(
        username, 
        email, 
        password,
        anonymousSessionId
      );
      
      // Create a session
      const session = await authService.createUserSession(
        newUser.id,
        req.headers['user-agent'],
        req.ip
      );
      
      // Set session cookie
      res.cookie('authToken', session.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        sameSite: 'lax'
      });
      
      // Clear anonymous session cookie if it exists
      if (anonymousSessionId) {
        res.clearCookie('anonymousSessionId');
      }
      
      // Return success response with user data (excluding sensitive fields)
      return apiCreated(res, {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          isVerified: newUser.is_verified,
          role: newUser.role,
          createdAt: newUser.created_at
        }
      }, 'User registered successfully. Please verify your email.');
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        return apiError(res, error, error.code, error.status);
      }
      
      logger.error('Registration failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return apiError(
        res, 
        'Failed to register user. Please try again later.',
        'REGISTRATION_FAILED',
        500
      );
    }
  })
);

/**
 * @route POST /api/auth/login
 * @desc Login a user
 * @access Public
 */
router.post('/login',
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { identifier, password, rememberMe } = req.body;
      
      // Authenticate the user
      const user = await authService.authenticateUser(identifier, password);
      
      // Create a session
      const sessionDuration = rememberMe ? 30 : 14; // days
      const session = await authService.createUserSession(
        user.id,
        req.headers['user-agent'],
        req.ip
      );
      
      // Set session cookie
      res.cookie('authToken', session.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: sessionDuration * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
      });
      
      // Return success response with user data
      return apiSuccess(res, {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          isVerified: user.is_verified,
          role: user.role,
          lastLogin: user.last_login
        }
      }, 'Login successful');
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return apiError(res, error, error.code, error.status);
      }
      
      if (error instanceof EmailNotVerifiedError) {
        return apiError(res, error, error.code, error.status, {
          requiresVerification: true
        });
      }
      
      logger.error('Login failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return apiError(
        res, 
        'Login failed. Please try again later.', 
        'LOGIN_FAILED',
        500
      );
    }
  })
);

/**
 * @route POST /api/auth/logout
 * @desc Logout a user
 * @access Public
 */
router.post('/logout', 
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies['authToken'];
    
    if (token) {
      // Invalidate the session
      await authService.invalidateUserSession(token);
      
      // Clear the session cookie
      res.clearCookie('authToken');
    }
    
    return apiSuccess(res, null, 'Logout successful');
  })
);

/**
 * @route GET /api/auth/me
 * @desc Get current user information
 * @access Private
 */
router.get('/me',
  authenticateUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.isAuthenticated || !req.user) {
      return apiSuccess(res, { 
        isAuthenticated: false,
        user: null
      });
    }
    
    // Return user data without sensitive information
    return apiSuccess(res, {
      isAuthenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        isVerified: req.user.is_verified,
        role: req.user.role,
        createdAt: req.user.created_at,
        lastLogin: req.user.last_login
      }
    });
  })
);

/**
 * @route POST /api/auth/anonymous-session
 * @desc Create or validate an anonymous session
 * @access Public
 */
router.post('/anonymous-session',
  validateBody(anonymousSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // If user is already authenticated, skip anonymous session
      if (req.cookies['authToken']) {
        return apiSuccess(res, { 
          isAuthenticated: true,
          anonymousSession: null
        }, 'Already authenticated');
      }
      
      // Get or create anonymous session
      const { sessionId } = req.body;
      const session = await sessionService.getOrCreateAnonymousSession(
        sessionId,
        req.headers['user-agent'],
        req.ip
      );
      
      // Set cookie
      res.cookie('anonymousSessionId', session.session_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        sameSite: 'lax'
      });
      
      return apiSuccess(res, {
        isAuthenticated: false,
        anonymousSession: {
          sessionId: session.session_id,
          videoCount: session.video_count,
          createdAt: session.created_at
        }
      });
    } catch (error) {
      logger.error('Anonymous session creation failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return apiError(
        res, 
        'Failed to create anonymous session', 
        'ANONYMOUS_SESSION_FAILED',
        500
      );
    }
  })
);

/**
 * @route GET /api/auth/anonymous-session
 * @desc Get anonymous session status
 * @access Public
 */
router.get('/anonymous-session',
  authenticateUser,
  asyncHandler(async (req: Request, res: Response) => {
    // If authenticated, return authenticated status
    if (req.isAuthenticated) {
      return apiSuccess(res, {
        isAuthenticated: true,
        anonymousSession: null
      });
    }
    
    // Check for anonymous session
    if (req.anonymousSessionId) {
      const session = await sessionService.getAnonymousSession(req.anonymousSessionId);
      
      if (session) {
        return apiSuccess(res, {
          isAuthenticated: false,
          anonymousSession: {
            sessionId: session.session_id,
            videoCount: session.video_count,
            createdAt: session.created_at
          }
        });
      }
    }
    
    // No session found
    return apiSuccess(res, {
      isAuthenticated: false,
      anonymousSession: null
    });
  })
);

/**
 * @route POST /api/auth/verify-email
 * @desc Verify a user's email with token
 * @access Public
 */
router.post('/verify-email',
  validateBody(verifyEmailSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      
      // Verify the email
      const user = await authService.verifyEmail(token);
      
      return apiSuccess(res, {
        verified: true,
        email: user.email
      }, 'Email verified successfully');
    } catch (error) {
      if (error instanceof AuthError) {
        return apiError(res, error, error.code, error.status);
      }
      
      logger.error('Email verification failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return apiError(
        res, 
        'Failed to verify email', 
        'EMAIL_VERIFICATION_FAILED',
        500
      );
    }
  })
);

/**
 * @route POST /api/auth/request-password-reset
 * @desc Request a password reset email
 * @access Public
 */
router.post('/request-password-reset',
  validateBody(passwordResetRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      // Request password reset
      await authService.requestPasswordReset(email);
      
      // Always return success, even if email not found (security best practice)
      return apiSuccess(res, null, 'If an account with that email exists, a password reset link has been sent.');
    } catch (error) {
      // Log error but don't expose if email exists or not
      logger.error('Password reset request failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return apiSuccess(res, null, 'If an account with that email exists, a password reset link has been sent.');
    }
  })
);

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password with token
 * @access Public
 */
router.post('/reset-password',
  validateBody(passwordResetSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      
      // Reset the password
      await authService.resetPassword(token, newPassword);
      
      return apiSuccess(res, null, 'Password reset successful');
    } catch (error) {
      if (error instanceof AuthError) {
        return apiError(res, error, error.code, error.status);
      }
      
      logger.error('Password reset failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return apiError(
        res, 
        'Failed to reset password', 
        'PASSWORD_RESET_FAILED',
        500
      );
    }
  })
);

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const {
        username,
        email,
        currentPassword,
        newPassword
      } = req.body;
      
      // Update profile data
      const updates: any = {};
      
      if (username) {
        updates.username = username;
      }
      
      if (email) {
        updates.email = email;
      }
      
      // If profile data updates are provided, apply them
      if (Object.keys(updates).length > 0) {
        const updatedUser = await authService.updateUserProfile(userId, updates);
        
        // If email was changed, require verification
        if (email && email !== req.user.email) {
          return apiSuccess(res, {
            user: {
              id: updatedUser.id,
              username: updatedUser.username,
              email: updatedUser.email,
              isVerified: false, // Email changed, needs verification
              role: updatedUser.role,
              lastLogin: updatedUser.last_login
            },
            emailChanged: true
          }, 'Profile updated. Please verify your new email address.');
        }
      }
      
      // If password change is requested
      if (currentPassword && newPassword) {
        await authService.changePassword(userId, currentPassword, newPassword);
        
        // Logout user from all other sessions for security
        await authService.invalidateAllUserSessions(userId);
        
        // Current session will continue to work because it's still valid in the cookie
        return apiSuccess(res, null, 'Password changed successfully. All other sessions have been logged out.');
      }
      
      // If we got here, only profile data was updated (not email or password)
      return apiSuccess(res, {
        user: {
          id: req.user.id,
          username: username || req.user.username,
          email: req.user.email,
          isVerified: req.user.is_verified,
          role: req.user.role,
          lastLogin: req.user.last_login
        }
      }, 'Profile updated successfully');
    } catch (error) {
      if (error instanceof AuthError) {
        return apiError(res, error, error.code, error.status);
      }
      
      logger.error('Profile update failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });
      
      return apiError(
        res, 
        'Failed to update profile', 
        'PROFILE_UPDATE_FAILED',
        500
      );
    }
  })
);

export default router;