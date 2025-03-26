import { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { ZodError } from 'zod';

// Import domain-specific routers
import videoRoutes from './video.routes';
import collectionRoutes from './collection.routes';
import categoryRoutes from './category.routes';
import authRoutes from './auth.routes';
import debugRoutes from './debug-api';
// The following routers will be created in later steps
// import searchRoutes from './search.routes';
// import exportRoutes from './export.routes';
// import qaRoutes from './qa.routes';

// Import OpenAI service to initialize before handling requests
import { isOpenAIConfigured } from '../services/openai';
import { isSupabaseConfigured, initializeVectorFunctions } from '../services/supabase';
import { addGlobalCategories } from '../../scripts/add-global-categories';

/**
 * Register all application routes
 * @param app Express application
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Check if OpenAI API is configured
  if (!isOpenAIConfigured()) {
    console.warn("WARNING: OpenAI API key not found. Features requiring OpenAI will not work.");
  }
  
  // Check if Supabase is configured and initialize vector functions if needed
  if (isSupabaseConfigured()) {
    console.log("[routes] Initializing Supabase vector functions...");
    try {
      await initializeVectorFunctions();
      console.log("[routes] Supabase vector functions initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Supabase vector functions:", error);
    }
  } else {
    console.warn("WARNING: Supabase configuration not found. Vector search and other Supabase-related features will not work.");
  }
  
  // Initialize global categories
  console.log("[routes] Initializing global categories...");
  try {
    await addGlobalCategories();
    console.log("[routes] Global categories initialized successfully");
  } catch (error) {
    console.error("Failed to initialize global categories:", error);
  }
  
  // Register domain-specific routes
  app.use('/api/debug', debugRoutes); // Must be registered before '/api/videos' to avoid capture issues
  app.use('/api/videos', videoRoutes);
  app.use('/api/collections', collectionRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/anonymous', authRoutes);
  
  // These routes will be added as we refactor them
  // app.use('/api/search', searchRoutes);
  // app.use('/api/export', exportRoutes);
  // app.use('/api/qa', qaRoutes);
  
  // 404 handler for API routes
  app.use('/api/*', (req, res) => {
    return res.status(404).json({ message: "API endpoint not found" });
  });
  
  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("API Error:", err);
    
    if (err instanceof ZodError) {
      return res.status(400).json({ 
        message: err.errors[0].message,
        code: "VALIDATION_ERROR"
      });
    }
    
    return res.status(500).json({ 
      message: err.message || "Internal Server Error",
      code: "SERVER_ERROR"
    });
  });
  
  // Create HTTP server (but don't start it)
  const { createServer } = await import('http');
  const server = createServer(app);
  
  return server;
}