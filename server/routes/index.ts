import { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { ZodError } from 'zod';

// Import domain-specific routers
import videoRoutes from './video.routes';
import collectionRoutes from './collection.routes';
import categoryRoutes from './category.routes';
import authRoutes from './auth.routes';
import anonymousRoutes from './anonymous.routes';
import debugRoutes from './debug-api';
import searchRoutes from './search.routes';
import semanticSearchRoutes from './semantic-search.routes';
import exportRoutes from './export.routes';
import qaRoutes from './qa.routes';

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
  app.use('/api/auth', authRoutes);
  app.use('/api/anonymous', anonymousRoutes);
  app.use('/api/saved-searches', searchRoutes);
  app.use('/api/search', semanticSearchRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/qa', qaRoutes);
  
  // Also register the qa routes under the videos path for backward compatibility
  app.use('/api/videos', qaRoutes);
  
  // 404 handler for API routes
  app.use('/api/*', (req, res) => {
    return res.status(404).json({ message: "API endpoint not found" });
  });
  
  // Global error handler is registered in server/index.ts
  // This is only needed for route-specific errors
  
  // Create HTTP server (but don't start it)
  const { createServer } = await import('http');
  const server = createServer(app);
  
  return server;
}