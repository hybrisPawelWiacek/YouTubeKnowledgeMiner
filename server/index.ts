import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
// Import and immediately configure environment variables
import { config } from "dotenv";
import { createLogger } from "./services/logger";
import { httpLoggerMiddleware } from "./middleware/http-logger-new";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { performanceMonitorMiddleware, setupSystemMetricsLogging } from "./middleware/performance-monitor";
import { authenticateUser } from "./middleware/auth.middleware";
import logsRouter from "./routes/logs";
import { info, warn, error, debug } from "./utils/logger";

config();

// Create application logger
const appLogger = createLogger('app');

const app = express();
// JSON middleware with increased size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Cookie parser middleware (needed for authentication)
app.use(cookieParser());

// Apply our custom HTTP request logger middleware
app.use(httpLoggerMiddleware);

// Apply performance monitoring middleware
app.use(performanceMonitorMiddleware);

// Apply authentication middleware (doesn't block requests, just attaches user info if available)
app.use(authenticateUser);

// Ensure API routes are not intercepted by Vite
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-API-Route', 'true'); // Add marker header for API routes
  next();
});

// Register client logs endpoint
app.use('/api/logs', logsRouter);

(async () => {
  // Create a server first, then register the API routes
  const server = await registerRoutes(app);

  // Apply our custom error handler middleware as the last middleware
  app.use(errorHandler);
  
  // Add 404 handler for routes that don't match any handlers
  app.use(notFoundHandler);

  // Special route to check the API status - for debugging
  app.get('/api/status', (req, res) => {
    res.json({ status: 'API is working' });
  });

  // Setup Vite in development after API routes
  if (app.get("env") === "development") {
    // Add middleware to conditionally bypass Vite for API calls
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) {
        // Skip Vite for API requests
        res.setHeader('Content-Type', 'application/json');
        return next('route');
      }
      next();
    });

    // Special middleware to handle direct API requests from curl
    app.use('/api', (req, res, next) => {
      if (req.headers['user-agent'] && req.headers['user-agent'].includes('curl')) {
        // For direct API requests from curl, skip Vite
        next('route');
      } else {
        next();
      }
    });

    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    // Log with the new logger
    appLogger.info(`Server running on http://0.0.0.0:${port}`);
    appLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Add test logs at various levels
    info('Application started successfully', { port, environment: process.env.NODE_ENV || 'development' });
    debug('Debug configuration loaded', { debug: process.env.NODE_ENV !== 'production' });
    warn('Using default configuration', { reason: 'No custom config file found' });
    
    // Log error example (non-critical)
    try {
      throw new Error('Test error for logging system');
    } catch (err) {
      error('Caught non-critical error', { error: err instanceof Error ? err.message : String(err) });
    }
    
    // Start system metrics logging (every 5 minutes)
    setupSystemMetricsLogging();
  });
})();