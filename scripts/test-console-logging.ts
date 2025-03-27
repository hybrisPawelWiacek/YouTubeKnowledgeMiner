/**
 * Test script for console logging redirection
 * 
 * This script tests the functionality to redirect console.* calls
 * through the Winston logging system for consistent formatted logging.
 */

import { logger, setupConsoleRedirection } from '../server/utils/logger';
import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

// Create a separate logger specifically for testing
const testLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'console-logging-test',
    environment: 'test' 
  },
  transports: [
    new winston.transports.Console({ level: 'debug' }),
    new winston.transports.DailyRotateFile({
      level: 'debug',
      dirname: path.join(process.cwd(), 'logs'),
      filename: 'console-test-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    })
  ],
});

// Configure console redirection
const restoreConsole = setupConsoleRedirection();

async function testConsoleLogging() {
  try {
    // Direct logging to test logger
    testLogger.info('TEST LOGGER: Starting console logging test...');
    
    console.log('Starting console logging test...');
    
    // Test different types of console calls
    console.log('This is a basic console.log message');
    testLogger.info('TEST LOGGER: Logged a basic console.log message');
    
    console.info('This is an info message from console.info');
    testLogger.info('TEST LOGGER: Logged a console.info message');
    
    console.warn('This is a warning message from console.warn');
    testLogger.info('TEST LOGGER: Logged a console.warn message');
    
    console.error('This is an error message from console.error');
    testLogger.info('TEST LOGGER: Logged a console.error message');
    
    console.debug('This is a debug message from console.debug');
    testLogger.info('TEST LOGGER: Logged a console.debug message');
    
    // Test with objects
    console.log('Object logging test:', { user: 'test-user', action: 'login', timestamp: new Date() });
    testLogger.info('TEST LOGGER: Logged an object test');
    
    // Test with Error objects
    console.error('Error object test:', new Error('This is a test error'));
    testLogger.info('TEST LOGGER: Logged an error object test');
    
    // Test with multiple arguments
    console.log('Multiple', 'argument', 'test', 123, true);
    testLogger.info('TEST LOGGER: Logged multiple arguments test');
    
    // Test with format strings
    console.log('Format string test: %s logged in at %s', 'test-user', new Date().toISOString());
    testLogger.info('TEST LOGGER: Logged format string test');
    
    // Test nested objects
    console.log('Nested object test:', {
      user: {
        id: 123,
        profile: {
          name: 'Test User',
          roles: ['admin', 'user']
        }
      },
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'Test Browser'
      }
    });
    testLogger.info('TEST LOGGER: Logged nested object test');
    
    // Test direct logger calls for comparison
    logger.info('Direct logger call - for comparison');
    testLogger.info('TEST LOGGER: Logged a direct logger call');
    
    // Direct logging of all test results to test logger
    testLogger.info('TEST LOGGER: Console logging test completed successfully');
    testLogger.info('TEST LOGGER: All test cases executed without errors');
    
    console.log('Console logging test completed');
    
    // Restore original console behavior if needed
    // restoreConsole();
  } catch (error) {
    console.error('Error testing console logging:', error);
    testLogger.error('TEST LOGGER: Error during test execution', { error });
  }
}

// Run the test
testConsoleLogging()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });