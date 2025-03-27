import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
// Import and immediately configure environment variables
import { config } from "dotenv";
import requestIdMiddleware from "./middleware/request-id.middleware";
import { requestLogger, responseLogger, errorLogger } from "./middleware/logging.middleware";
import { logger, setupConsoleRedirection } from "./utils/logger";
config();

// Set up console redirection to route all console.* calls through Winston
// This helps capture console logs from throughout the application in our structured logging system
setupConsoleRedirection();

// Initialize the application
const app = express();

// Apply request ID middleware first, so all subsequent middleware can use the request ID
app.use(requestIdMiddleware);

// Apply request logging middleware to log all incoming requests
app.use(requestLogger);

// Apply response logging middleware to log all outgoing responses
app.use(responseLogger);

// JSON middleware with increased size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure API routes are not intercepted by Vite
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-API-Route', 'true'); // Add marker header for API routes
  next();
});

// Legacy logging middleware - keep for backward compatibility with the log function
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Create a server first, then register the API routes
  const server = await registerRoutes(app);

  // Error logging middleware - should come before the global error handler
  app.use(errorLogger);
  
  // Global error handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Global error handler caught', {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
        status: err.status,
      },
      requestId: req.requestId,
      url: req.originalUrl,
      method: req.method
    });
    
    // Import these dynamically to avoid circular dependencies
    const { handleApiError } = require('./utils/response.utils');
    const { ZodError } = require('zod');
    const { ValidationError } = require('./utils/error.utils');
    
    // Special handling for Zod validation errors
    if (err instanceof ZodError) {
      const validationError = new ValidationError(
        err.errors[0].message || 'Validation error',
        err.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
      return handleApiError(res, validationError);
    }
    
    // Use our handleApiError utility for consistent error formatting
    return handleApiError(res, err);
  });

  // Special route to check the API status - for debugging
  app.get('/api/status', (req, res) => {
    res.json({ status: 'API is working' });
  });

  // Determine environment using Express app's environment setting
  const expressEnv = app.get("env");
  // Setup Vite in development after API routes
  if (expressEnv === "development") {
    // Log environment detection
    logger.info(`Express environment detected as: ${expressEnv}`);
    
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
    logger.info(`Express environment detected as: ${expressEnv} - serving static files`);
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
    // Log using both the old and new logging systems for transition period
    log(`✅ Server running on http://0.0.0.0:${port}`);
    log(`📝 Express Environment: ${expressEnv}`);
    
    // Log using the new structured logger
    logger.info('Server started successfully', {
      port,
      host: '0.0.0.0',
      expressEnvironment: expressEnv,
      nodeVersion: process.version
    });
  });
})();