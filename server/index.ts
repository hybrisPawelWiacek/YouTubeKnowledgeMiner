import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
// Import and immediately configure environment variables
import { config } from "dotenv";
import { createLogger } from "./services/logger";
import { httpLoggerMiddleware } from "./middleware/http-logger";
import { errorHandlerMiddleware } from "./middleware/error-handler";
import performanceMonitorMiddleware from "./middleware/performance-monitor";
import logsRouter from "./routes/logs";
import { log } from "./utils/logger";

config();

// Create application logger
const appLogger = createLogger('app');

const app = express();
// JSON middleware with increased size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Apply our custom HTTP request logger middleware
app.use(httpLoggerMiddleware);

// Apply performance monitoring middleware
app.use(performanceMonitorMiddleware);

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
  app.use(errorHandlerMiddleware);

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
    log(`✅ Server running on http://0.0.0.0:${port}`);
    log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
})();