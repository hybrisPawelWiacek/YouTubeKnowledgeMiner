/**
 * This file tests the logger functionality
 */

import { createLogger } from './logger';

// Create specialized loggers
const appLogger = createLogger('app');
const httpLogger = createLogger('http');
const apiLogger = createLogger('api');
const authLogger = createLogger('auth');
const errorLogger = createLogger('error');
const perfLogger = createLogger('performance');

// Log some test messages at different levels
function runLoggerTests() {
  console.log('Running logger tests...');
  
  // App logs
  appLogger.info('Application started');
  appLogger.debug('Debug information about application state');
  
  // HTTP logs
  httpLogger.info('GET /api/videos request received');
  httpLogger.info('200 OK response sent in 52.31ms');
  
  // API logs
  apiLogger.info('Processing video metadata');
  apiLogger.warn('Rate limit approaching for YouTube API');
  
  // Auth logs
  authLogger.info('User authenticated successfully', { userId: 123 });
  authLogger.warn('Failed login attempt', { username: 'user@example.com', reason: 'Invalid password' });
  
  // Error logs
  errorLogger.error('Failed to fetch YouTube transcript', { videoId: 'abcdefgh123' });
  
  try {
    throw new Error('Test error for logging');
  } catch (err) {
    errorLogger.logError('Caught an error', err as Error, { context: 'logger test' });
  }
  
  // Performance logs
  perfLogger.debug('Request processed in 150ms');
  perfLogger.warn('Slow request detected (2500ms)', {
    endpoint: '/api/videos',
    method: 'GET'
  });
  
  console.log('Logger tests completed');
}

// Run the tests
runLoggerTests();

// Export for use in scripts
export { runLoggerTests };