/**
 * Test script for authentication logging
 * 
 * This script tests the auth event logging functionality
 * by simulating various authentication events and verifying
 * the logs are properly generated.
 */

// Import the entire logger module to ensure we have access to the actual logger instances
import logger, { logAuthEvent, logSecurityEvent, flushLogs } from '../server/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Function to generate a unique request ID (simulating middleware)
function generateRequestId(): string {
  return uuidv4();
}

async function testAuthLogging() {
  try {
    console.log('Starting authentication logging test...');
    
    // Simulate various authentication events with request IDs
    
    // 1. Successful login
    const loginRequestId = generateRequestId();
    logAuthEvent(
      loginRequestId,
      'login-success',
      123,
      { 
        username: 'test-user',
        loginMethod: 'password',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged successful login event with request ID: ${loginRequestId}`);
    
    // 2. Failed login
    const failedLoginRequestId = generateRequestId();
    logAuthEvent(
      failedLoginRequestId,
      'login-failed',
      undefined, // Use undefined instead of null for userId
      { 
        username: 'unknown-user',
        reason: 'invalid-credentials',
        ipAddress: '192.168.1.2',
        userAgent: 'Test Browser/1.0',
        attemptCount: 3
      }
    );
    console.log(`Logged failed login event with request ID: ${failedLoginRequestId}`);
    
    // 3. User registration
    const registrationRequestId = generateRequestId();
    logAuthEvent(
      registrationRequestId,
      'user-registered',
      456,
      { 
        username: 'new-user',
        registrationMethod: 'email',
        ipAddress: '192.168.1.3',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged user registration event with request ID: ${registrationRequestId}`);
    
    // 4. Password reset request
    const passwordResetRequestId = generateRequestId();
    logAuthEvent(
      passwordResetRequestId,
      'password-reset-requested',
      789,
      { 
        username: 'reset-user',
        resetMethod: 'email',
        ipAddress: '192.168.1.4',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged password reset request with request ID: ${passwordResetRequestId}`);
    
    // 5. Logout
    const logoutRequestId = generateRequestId();
    logAuthEvent(
      logoutRequestId,
      'logout',
      123,
      { 
        username: 'test-user',
        sessionDuration: '2h 15m',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged logout event with request ID: ${logoutRequestId}`);
    
    // 6. Access denied (security event)
    const accessDeniedRequestId = generateRequestId();
    logSecurityEvent(
      accessDeniedRequestId,
      'access-denied',
      { 
        userId: 123,
        username: 'test-user',
        resourceType: 'api',
        resourcePath: '/api/admin/users',
        ipAddress: '192.168.1.5',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged access denied security event with request ID: ${accessDeniedRequestId}`);
    
    // 7. Account locked (security event after multiple failed logins)
    const accountLockedRequestId = generateRequestId();
    logSecurityEvent(
      accountLockedRequestId,
      'account-locked',
      { 
        username: 'locked-user',
        reason: 'multiple-failed-attempts',
        attemptCount: 5,
        lockDuration: '30m',
        ipAddress: '192.168.1.6',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged account locked security event with request ID: ${accountLockedRequestId}`);
    
    // 8. Anonymous session created
    const anonSessionRequestId = generateRequestId();
    logAuthEvent(
      anonSessionRequestId,
      'anonymous-session-created',
      undefined, // Use undefined instead of null for userId
      { 
        sessionId: 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10),
        ipAddress: '192.168.1.7',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged anonymous session creation with request ID: ${anonSessionRequestId}`);
    
    // 9. Anonymous to registered user conversion
    const conversionRequestId = generateRequestId();
    logAuthEvent(
      conversionRequestId,
      'anonymous-converted',
      901,
      { 
        previousSessionId: 'anon_1234567890_abcdef',
        username: 'converted-user',
        registrationMethod: 'email',
        ipAddress: '192.168.1.7',
        userAgent: 'Test Browser/1.0'
      }
    );
    console.log(`Logged anonymous conversion event with request ID: ${conversionRequestId}`);
    
    // Explicitly flush logs to disk using our new mechanism
    console.log('Explicitly flushing logs to disk...');
    await flushLogs();
    
    // Check for auth log file
    const authLogPath = path.join(process.cwd(), 'logs', 'auth-' + new Date().toISOString().split('T')[0] + '.log');
    const authDebugPath = path.join(process.cwd(), 'logs', 'auth-debug.log');
    
    console.log('Checking log files:');
    console.log(`- Auth log: ${authLogPath}`);
    console.log(`- Auth debug log: ${authDebugPath}`);
    
    // Check auth log file
    if (fs.existsSync(authLogPath)) {
      console.log(`Auth log file exists at: ${authLogPath}`);
      
      // Read last few lines to verify log entries
      const data = fs.readFileSync(authLogPath, 'utf8');
      const lines = data.trim().split('\n');
      console.log(`Auth log contains ${lines.length || 0} entries`);
      
      if (lines.length > 0) {
        console.log('Last log entry:');
        console.log(lines[lines.length - 1]);
      }
    } else {
      console.log(`Auth log file not found at: ${authLogPath}`);
    }
    
    // Check auth debug log file
    if (fs.existsSync(authDebugPath)) {
      console.log(`Auth debug log file exists at: ${authDebugPath}`);
      
      // Read last few lines to verify log entries
      const data = fs.readFileSync(authDebugPath, 'utf8');
      const lines = data.trim().split('\n');
      console.log(`Auth debug log contains ${lines.length || 0} entries`);
      
      if (lines.length > 0) {
        console.log('Last debug log entry:');
        console.log(lines[lines.length - 1]);
      }
    } else {
      console.log(`Auth debug log file not found at: ${authDebugPath}`);
    }
    
    // List all files in the logs directory
    console.log('All files in logs directory:');
    const logsDir = path.join(process.cwd(), 'logs');
    const files = fs.readdirSync(logsDir);
    files.forEach(file => console.log(`- ${file}`));
    
    console.log('Authentication logging test completed');
  } catch (error) {
    console.error('Error testing authentication logging:', error);
  }
}

// Register exit handlers for proper log flushing
import { registerExitHandlers } from '../server/utils/logger';
registerExitHandlers();

// Run the test
testAuthLogging()
  .then(async () => {
    console.log('Test completed successfully');
    // Ensure logs are flushed before exit
    await flushLogs();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Test failed:', err);
    // Ensure logs are flushed even on error
    await flushLogs();
    process.exit(1);
  });