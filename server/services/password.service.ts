/**
 * Password Service
 * 
 * Handles password hashing, verification, and security-related functions.
 * Uses PBKDF2 for secure password hashing with random salt generation.
 * Includes compatibility layer for different password storage formats.
 */

import crypto from 'crypto';

// Constants for PBKDF2 password hashing
const ITERATIONS = 10000; // Number of iterations for PBKDF2
const KEY_LENGTH = 64; // Length of the derived key in bytes
const SALT_SIZE = 16; // Size of the salt in bytes
const DIGEST = 'sha512'; // Hash algorithm

/**
 * Generates a secure random salt
 * @returns A random salt as a hexadecimal string
 */
export function generateSalt(): string {
  return crypto.randomBytes(SALT_SIZE).toString('hex');
}

/**
 * Hashes a password using PBKDF2 with the provided salt
 * @param password - The plain text password to hash
 * @param salt - The salt to use for hashing
 * @returns The hashed password as a hexadecimal string
 */
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    DIGEST
  ).toString('hex');
}

/**
 * Verifies a password against a stored hash
 * @param password - The plain text password to verify
 * @param storedHash - The stored hash to compare against
 * @param salt - The salt used for the stored hash
 * @returns True if the password matches, false otherwise
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  // For temporary_salt, we're using direct comparison for legacy passwords
  if (salt === 'temporary_salt') {
    // Direct comparison for legacy passwords (this is for migration only)
    return password === storedHash;
  }
  
  // Normal case: use proper PBKDF2 verification
  const calculatedHash = hashPassword(password, salt);
  
  // Use a constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch (error) {
    // If buffers are of different lengths, this will throw an error
    // In this case, we know the password is wrong
    return false;
  }
}

/**
 * Compatibility function to extract password data from a user object
 * Handles both legacy format (password only) and new format (password_hash and password_salt)
 * 
 * @param user User object from database
 * @returns Object with hash and salt properties
 */
export function getPasswordData(user: any): { hash: string, salt: string } {
  // Handle the new format first (password_hash and password_salt)
  if (user.password_hash && user.password_salt) {
    return { 
      hash: user.password_hash, 
      salt: user.password_salt 
    };
  }
  
  // Legacy format - password field only
  if (user.password) {
    return { 
      hash: user.password, 
      salt: 'temporary_salt' 
    };
  }
  
  throw new Error('Invalid user password data');
}

/**
 * Generates a secure random token
 * @param length - The length of the token in bytes (default 32 bytes = 256 bits)
 * @returns A random token as a hexadecimal string
 */
export function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generates a secure CSRF token
 * @returns A random CSRF token
 */
export function generateCSRFToken(): string {
  return generateSecureToken(24);
}

/**
 * Validates a CSRF token against the expected token
 * @param token - The token from the request
 * @param expectedToken - The expected token from the session
 * @returns True if the tokens match, false otherwise
 */
export function validateCSRFToken(token: string, expectedToken: string): boolean {
  if (!token || !expectedToken) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedToken)
    );
  } catch (error) {
    return false;
  }
}