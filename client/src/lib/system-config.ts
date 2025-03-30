/**
 * System configuration module
 * 
 * Provides centralized configuration values used throughout the application.
 * This file is used to avoid circular dependencies when importing from shared/config.
 */

// Export the SYSTEM constants for use in client-side code
export const SYSTEM = {
  /**
   * User ID for the dedicated anonymous user
   * This ID is used for all content created by anonymous users
   */
  ANONYMOUS_USER_ID: 7,
  
  /**
   * Maximum videos allowed for anonymous users
   */
  ANONYMOUS_VIDEO_LIMIT: 3,

  /**
   * Anonymous session prefix used to identify anonymous session IDs
   */
  ANONYMOUS_SESSION_PREFIX: 'anon_'
};

/**
 * Feature flags to control functionality
 */
export const FEATURES = {
  /**
   * Enable anonymous user functionality
   */
  ANONYMOUS_USERS: true,
  
  /**
   * Enable content migration from anonymous to registered users
   */
  ANONYMOUS_MIGRATION: true
};