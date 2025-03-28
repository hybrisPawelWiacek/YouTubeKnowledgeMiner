/**
 * Logs API Routes
 * 
 * This file contains routes for client-side log collection
 * and exposing server logs when appropriate.
 */

import express from 'express';
import { createLogger } from '../services/logger';

// Create a router
const router = express.Router();

// Create client-logs specific logger
const clientLogger = createLogger('client');

/**
 * POST /api/logs
 * Endpoint for client-side logs to be sent to the server
 */
router.post('/', express.json(), (req, res) => {
  try {
    // Validate request body
    if (!req.body.logs || !Array.isArray(req.body.logs)) {
      return res.status(400).json({ error: 'Invalid log format: logs array is required' });
    }
    
    // Process each log entry
    const logs = req.body.logs;
    
    logs.forEach((log: any) => {
      if (!log.level || !log.message) {
        // Skip invalid logs
        return;
      }
      
      // Forward to appropriate logger level
      const level = log.level.toLowerCase();
      if (['debug', 'info', 'warn', 'error'].includes(level)) {
        clientLogger[level](log.message, {
          clientSessionId: log.sessionId,
          clientUrl: log.url,
          clientUserAgent: log.userAgent,
          clientTimestamp: log.timestamp,
          ...log // Include all other metadata
        });
      }
    });
    
    // Return success
    res.status(200).json({ success: true, count: logs.length });
  } catch (error) {
    console.error('Error processing client logs:', error);
    res.status(500).json({ error: 'Failed to process logs' });
  }
});

/**
 * GET /api/logs/level/:level
 * Get recent logs of specified level (admin only)
 * This would normally require authentication/authorization
 */
router.get('/level/:level', (req, res) => {
  // This would normally check for admin role
  const isAdmin = process.env.NODE_ENV === 'development';
  
  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized access to logs' });
  }
  
  const level = req.params.level.toLowerCase();
  if (!['debug', 'info', 'warn', 'error'].includes(level)) {
    return res.status(400).json({ error: 'Invalid log level' });
  }
  
  // In a real implementation, this would fetch logs from a database or file
  // This is a placeholder for the concept
  res.status(200).json({
    message: `Logs for level ${level} would be returned here`,
    note: 'This endpoint would retrieve logs from storage in a production implementation'
  });
});

export default router;