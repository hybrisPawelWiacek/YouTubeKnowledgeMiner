/**
 * Debug script for auth logging file issues
 * 
 * This script focuses on writing directly to the auth log files
 * to troubleshoot file path and permissions issues.
 */

import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`Created logs directory at: ${logsDir}`);
}

// Create a direct file transport for auth events
const authFileTransport = new winston.transports.File({
  level: 'debug',
  filename: path.join(logsDir, 'auth-debug-direct.log'),
});

// Create a direct file transport for debugging
const debugFileTransport = new winston.transports.File({
  level: 'debug',
  filename: path.join(logsDir, 'debug-transport.log'),
});

// Create a debug logger
const debugLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'debug-auth-logger',
    environment: 'development'
  },
  transports: [
    new winston.transports.Console(),
    debugFileTransport,
    authFileTransport
  ],
});

async function debugAuthLogs() {
  try {
    console.log('Starting auth logs debug...');
    console.log(`Log directory: ${logsDir}`);
    console.log(`Debug log file: ${path.join(logsDir, 'debug-transport.log')}`);
    console.log(`Auth debug log file: ${path.join(logsDir, 'auth-debug-direct.log')}`);
    
    // List files in logs directory
    const files = fs.readdirSync(logsDir);
    console.log('Files in logs directory:');
    files.forEach(file => console.log(`- ${file}`));
    
    // Try to write to the direct debug log
    const requestId = uuidv4();
    debugLogger.debug(`Debug log test entry [${requestId}]`, { 
      requestId,
      timestamp: new Date().toISOString()
    });
    
    // Try to write to auth log
    debugLogger.info(`Auth log test entry [${requestId}]`, {
      requestId,
      event: 'debug-auth-test',
      userId: 123,
      details: {
        username: 'debug-user',
        testTime: new Date().toISOString()
      }
    });
    
    // Wait a moment for logs to be written
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify files were created
    const debugLogExists = fs.existsSync(path.join(logsDir, 'debug-transport.log'));
    const authLogExists = fs.existsSync(path.join(logsDir, 'auth-debug-direct.log'));
    
    console.log(`Debug log exists: ${debugLogExists}`);
    console.log(`Auth debug log exists: ${authLogExists}`);
    
    // Read the files if they exist
    if (debugLogExists) {
      const debugContent = fs.readFileSync(path.join(logsDir, 'debug-transport.log'), 'utf8');
      console.log('Debug log content:');
      console.log(debugContent || '(empty)');
    }
    
    if (authLogExists) {
      const authContent = fs.readFileSync(path.join(logsDir, 'auth-debug-direct.log'), 'utf8');
      console.log('Auth debug log content:');
      console.log(authContent || '(empty)');
    }
    
    console.log('Auth logs debug completed');
  } catch (error) {
    console.error('Error debugging auth logs:', error);
  }
}

// Run the debug
debugAuthLogs()
  .then(() => {
    console.log('Debug completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Debug failed:', err);
    process.exit(1);
  });