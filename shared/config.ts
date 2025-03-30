/**
 * Application Configuration Module
 * 
 * This module provides centralized configuration settings for the application.
 * It includes system constants, feature flags, and environment-specific settings.
 */

/**
 * System-level constants used throughout the application
 */
export const SYSTEM = {
  /**
   * User ID for the dedicated anonymous user
   * This ID is used for all content created by anonymous users
   * 
   * IMPORTANT: This value should match the ID in the database for the anonymous user
   * If you need to change this, you must update the database and all references
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
}

/**
 * Feature flags to enable/disable functionality
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
}

/**
 * Configuration for different environments
 * These settings can be overridden by environment variables
 */
export const ENV_CONFIG = {
  development: {
    // Development-specific settings
    SESSION_EXPIRY_DAYS: 30,
    SESSION_COOKIE_SECURE: false,
  },
  test: {
    // Test environment settings
    SESSION_EXPIRY_DAYS: 1,
    SESSION_COOKIE_SECURE: false,
  },
  production: {
    // Production environment settings
    SESSION_EXPIRY_DAYS: 14,
    SESSION_COOKIE_SECURE: true,
  }
}

/**
 * Get the current environment configuration
 */
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  return ENV_CONFIG[env as keyof typeof ENV_CONFIG] || ENV_CONFIG.development;
}