/**
 * Client-side logs API routes
 * 
 * This module provides an API endpoint for the client-side logger
 * to send logs to the server.
 */

import { Router } from 'express';
import { createLogger } from '../services/logger';

const router = Router();
const clientLogger = createLogger('client');

/**
 * POST /api/logs - Receive logs from the client
 */
router.post('/', (req, res) => {
  const logEntries = req.body;
  
  if (!Array.isArray(logEntries)) {
    return res.status(400).json({ error: 'Expected an array of log entries' });
  }
  
  // Process each log entry
  logEntries.forEach(entry => {
    const { level, message, component, metadata, timestamp } = entry;
    
    // Ensure valid log level
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(level)) {
      return;
    }
    
    // Log to the appropriate level
    clientLogger[level](`[${component || 'client'}] ${message}`, {
      ...metadata,
      component,
      clientTimestamp: timestamp,
      receivedAt: Date.now()
    });
  });
  
  res.status(200).json({ success: true, count: logEntries.length });
});

export default router;