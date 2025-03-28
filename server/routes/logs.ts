/**
 * Client-side logs API routes
 * 
 * This module provides an API endpoint for the client-side logger
 * to send logs to the server.
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../services/logger';

// Create a dedicated logger for client logs
const clientLogger = createLogger('client');

// Create router
const router = Router();

/**
 * POST /api/logs - Receive logs from the client
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Expected array of log entries' });
    }
    
    // Process each log entry
    req.body.forEach((entry: any) => {
      // Basic validation
      if (!entry || typeof entry !== 'object' || !entry.level || !entry.message) {
        return; // Skip invalid entries
      }
      
      // Map client log level to server log level
      const level = ['debug', 'info', 'warn', 'error'].includes(entry.level) 
        ? entry.level 
        : 'info';
      
      // Get component if it exists
      const component = entry.component || 'unknown';
      
      // Extract basic fields
      const { message, timestamp, metadata = {} } = entry;
      
      // Add some client-specific metadata
      const clientMetadata = {
        ...metadata,
        clientTimestamp: timestamp,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        component
      };
      
      // Log with the appropriate level and the special client component prefix
      if (level === 'debug') clientLogger.debug(`[${component}] ${message}`, clientMetadata);
      else if (level === 'info') clientLogger.info(`[${component}] ${message}`, clientMetadata);
      else if (level === 'warn') clientLogger.warn(`[${component}] ${message}`, clientMetadata);
      else if (level === 'error') clientLogger.error(`[${component}] ${message}`, clientMetadata);
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    // If anything goes wrong, log it but still report success to the client
    // (we don't want client logging to fail the application)
    clientLogger.error('Error processing client logs', { error });
    res.status(200).json({ success: true });
  }
});

export default router;