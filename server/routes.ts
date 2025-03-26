import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { dbStorage } from "./database-storage"; // Using database storage
import { processYoutubeVideo, getYoutubeTranscript, generateTranscriptSummary } from "./services/youtube";
import { generateAnswer } from "./services/openai";
import { exportVideoContent, exportBatchVideoContent, saveExportPreference, getExportPreference } from "./services/export";
import { ZodError } from "zod";
import { 
  VideoMetadataRequest, youtubeUrlSchema, videoMetadataSchema, 
  insertCollectionSchema, insertSavedSearchSchema, searchParamsSchema, 
  qaQuestionSchema, insertQAConversationSchema, semanticSearchSchema,
  exportRequestSchema, exportFormatEnum
} from "@shared/schema";
import { 
  processTranscriptEmbeddings, 
  processSummaryEmbeddings,
  processNotesEmbeddings,
  performSemanticSearch, 
  saveSearchHistory
} from "./services/embeddings";
import { initializeVectorFunctions, isSupabaseConfigured } from "./services/supabase";
import { log } from "./vite";
import { addGlobalCategories } from "../scripts/add-global-categories";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Supabase and vector functions
  try {
    log("Initializing Supabase vector functions...", "routes");
    const initialized = await initializeVectorFunctions();
    if (initialized) {
      log("Supabase vector functions initialized successfully", "routes");
      
      // Initialize global categories
      try {
        log("Initializing global categories...", "routes");
        await addGlobalCategories();
        log("Global categories initialized successfully", "routes");
      } catch (categoryError) {
        log(`Error initializing global categories: ${categoryError}`, "routes");
        // Non-critical error, continue with application startup
      }
    } else {
      log("Failed to initialize Supabase vector functions", "routes");
    }
  } catch (error) {
    log(`Error initializing Supabase: ${error}`, "routes");
  }
  // User login route
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Find user by username
      const user = await dbStorage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // In a real app, we would hash the password and compare
      // For this prototype, we'll do a direct comparison
      if (user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Don't send password back to client
      const { password: _, ...userWithoutPassword } = user;

      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Error logging in:", error);
      return res.status(500).json({ message: "Failed to log in" });
    }
  });

  // User registration route
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }

      // Check if user already exists
      const existingUser = await dbStorage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      // Create user
      const user = await dbStorage.createUser({
        username,
        email,
        password, // In a real app, hash this password
      });

      // Don't send password back to client
      const { password: _, ...userWithoutPassword } = user;

      return res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error registering user:", error);
      return res.status(500).json({ message: "Failed to register user" });
    }
  });

  // YouTube video processing route
  app.post("/api/videos/analyze", async (req, res) => {
    try {
      const { url } = youtubeUrlSchema.parse(req.body);

      // Extract video ID from URL
      const videoId = extractYoutubeId(url);
      if (!videoId) {
        return res.status(400).json({ message: "Invalid YouTube URL format" });
      }

      // Process video to get metadata
      const videoData = await processYoutubeVideo(videoId);

      // Get transcript
      let transcript = null;
      try {
        transcript = await getYoutubeTranscript(videoId);
      } catch (err) {
        console.error("Transcript error:", err);
      }

      // Generate summary if transcript is available
      let summary = null;
      if (transcript) {
        try {
          log("Generating summary from transcript...", "routes");
          summary = await generateTranscriptSummary(transcript, videoData.title);
          log(`Summary generated: ${summary ? 'Success' : 'Failed'}`, "routes");
        } catch (err) {
          log(`Error generating summary: ${err}`, "routes");
        }
      }

      return res.status(200).json({
        ...videoData,
        transcript,
        summary,
        youtubeId: videoId
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error processing YouTube video:", error);
      return res.status(500).json({ message: "Failed to process YouTube video" });
    }
  });

  // Save video to library
  app.post("/api/videos", async (req, res) => {
    try {
      console.log("================================================");
      console.log("🔴 NEW VIDEO SAVE REQUEST STARTING 🔴");
      console.log("================================================");
      console.log("Received POST /api/videos request at", new Date().toISOString());
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      
      const { youtubeId, title, channel, duration, publishDate, thumbnail, transcript, summary } = req.body;
      const metadata: VideoMetadataRequest = videoMetadataSchema.parse({
        notes: req.body.notes,
        category_id: req.body.category_id,
        rating: req.body.rating,
        is_favorite: req.body.is_favorite,
        timestamps: req.body.timestamps,
        collection_ids: req.body.collection_ids
      });
      
      console.log("Parsed metadata:", JSON.stringify(metadata, null, 2));

      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      let userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ IMPORTANT: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");
      console.log("================================================");
      
      // Debug: log all headers for troubleshooting 
      console.log("Request headers for /api/videos:", JSON.stringify(req.headers, null, 2));
      
      if (req.headers['x-user-id']) {
        try {
          // Log the raw user ID value
          console.log("Raw x-user-id header:", req.headers['x-user-id'], "Type:", typeof req.headers['x-user-id']);
          
          // Handle various header formats
          let headerValue = req.headers['x-user-id'];
          
          // If it's an array (which can happen with headers), use the first value
          if (Array.isArray(headerValue)) {
            console.log("x-user-id is an array, using first value:", headerValue[0]);
            headerValue = headerValue[0];
          }
          
          // Convert to string if not already
          headerValue = String(headerValue);
          
          // Extract just the numeric portion if it's a string with non-numeric characters
          const numericMatch = headerValue.match(/\d+/);
          
          if (numericMatch) {
            userId = parseInt(numericMatch[0], 10);
            console.log("Extracted numeric user ID from string:", userId);
          } else {
            userId = Number(headerValue);
            console.log("Converted user ID directly:", userId);
          }
          
          if (isNaN(userId)) {
            console.error("Failed to parse user ID, got NaN from:", headerValue);
            return res.status(400).json({ message: "Invalid user ID format", originalValue: headerValue });
          }
          
          // Always ensure we have a valid positive integer
          if (!Number.isInteger(userId) || userId <= 0) {
            console.error("Invalid user ID (must be positive integer):", userId);
            return res.status(400).json({ message: "User ID must be a positive integer" });
          }
          
          console.log("Using user ID for video save:", userId);
        } catch (e) {
          console.error("Error processing user ID:", e);
          return res.status(400).json({ message: "Failed to parse user ID", error: String(e) });
        }
      } else {
        console.log("No x-user-id header found, using default user ID:", userId);
      }

      // Save to database through storage interface
      const video = await dbStorage.insertVideo({
        youtube_id: youtubeId,
        title,
        channel,
        duration,
        publish_date: publishDate,
        thumbnail,
        transcript,
        summary, // Add summary to the video data
        views: req.body.viewCount,
        likes: req.body.likeCount,
        description: req.body.description,
        tags: req.body.tags,
        user_id: userId,
        notes: metadata.notes,
        category_id: metadata.category_id,
        rating: metadata.rating,
        is_favorite: metadata.is_favorite,
        timestamps: metadata.timestamps
      });

      // If collections were specified, add the video to those collections
      if (metadata.collection_ids && metadata.collection_ids.length > 0) {
        await dbStorage.bulkAddVideosToCollection(
          metadata.collection_ids[0], 
          [video.id]
        );
      }

      // Process transcript for embeddings if available
      if (video.id && transcript) {
        try {
          log(`Processing transcript embeddings for video ${video.id}`, 'routes');
          await processTranscriptEmbeddings(video.id, userId, transcript);
        } catch (embeddingError) {
          log(`Error processing transcript embeddings: ${embeddingError}`, 'routes');
          // Non-critical, continue
        }
      }

      // Process summary for embeddings if available
      if (video.id && summary && summary.length > 0) {
        try {
          log(`Processing summary embeddings for video ${video.id}`, 'routes');
          await processSummaryEmbeddings(video.id, userId, summary);
        } catch (embeddingError) {
          log(`Error processing summary embeddings: ${embeddingError}`, 'routes');
          // Non-critical, continue
        }
      }

      // Process notes for embeddings if available
      if (video.id && metadata.notes) {
        try {
          log(`Processing notes embeddings for video ${video.id}`, 'routes');
          await processNotesEmbeddings(video.id, userId, metadata.notes);
        } catch (embeddingError) {
          log(`Error processing notes embeddings: ${embeddingError}`, 'routes');
          // Non-critical, continue
        }
      }

      return res.status(201).json(video);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error saving video:", error);
      return res.status(500).json({ message: "Failed to save video to library" });
    }
  });

  // Get all videos for a user
  app.get("/api/videos", async (req, res) => {
    try {
      console.log("================================================");
      console.log("🔴 VIDEO FETCH REQUEST STARTING 🔴");
      console.log("================================================");
      console.log("Received GET /api/videos request at", new Date().toISOString());
      console.log("Request query params:", JSON.stringify(req.query, null, 2));
      
      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      let userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ IMPORTANT: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");
      console.log("================================================");
      
      // Debug: log all headers for troubleshooting
      console.log("Request headers for GET /api/videos:", JSON.stringify(req.headers, null, 2));
      
      if (false && req.headers['x-user-id']) { // Disabled header processing with 'false &&' for testing
        try {
          // Log the raw user ID value
          console.log("Raw x-user-id header:", req.headers['x-user-id'], "Type:", typeof req.headers['x-user-id']);
          
          // Handle various header formats
          let headerValue = req.headers['x-user-id'];
          
          // If it's an array (which can happen with headers), use the first value
          if (Array.isArray(headerValue)) {
            console.log("x-user-id is an array, using first value:", headerValue[0]);
            headerValue = headerValue[0];
          }
          
          // Convert to string if not already
          headerValue = String(headerValue);
          
          // Extract just the numeric portion if it's a string with non-numeric characters
          const numericMatch = headerValue.match(/\d+/);
          
          if (numericMatch) {
            userId = parseInt(numericMatch[0], 10);
            console.log("Extracted numeric user ID from string:", userId);
          } else {
            userId = Number(headerValue);
            console.log("Converted user ID directly:", userId);
          }
          
          if (isNaN(userId)) {
            console.error("Failed to parse user ID, got NaN from:", headerValue);
            return res.status(400).json({ message: "Invalid user ID format", originalValue: headerValue });
          }
          
          // Always ensure we have a valid positive integer
          if (!Number.isInteger(userId) || userId <= 0) {
            console.error("Invalid user ID (must be positive integer):", userId);
            return res.status(400).json({ message: "User ID must be a positive integer" });
          }
          
          console.log("Using user ID for fetching videos:", userId);
        } catch (e) {
          console.error("Error processing user ID:", e);
          return res.status(400).json({ message: "Failed to parse user ID", error: String(e) });
        }
      } else {
        console.log("No x-user-id header found in GET /api/videos, using default user ID:", userId);
      }

      // Check if search parameters were provided
      if (Object.keys(req.query).length > 0) {
        const searchParams = searchParamsSchema.parse(req.query);
        const result = await dbStorage.searchVideos(userId, searchParams);
        return res.status(200).json(result);
      } else {
        // For direct getVideosByUserId, wrap the result in the same format
        // for consistency with the frontend
        const videos = await dbStorage.getVideosByUserId(userId);
        return res.status(200).json({
          videos,
          totalCount: videos.length,
          hasMore: false
        });
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error fetching videos:", error);
      return res.status(500).json({ message: "Failed to fetch videos" });
    }
  });

  // Get a single video by ID
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid video ID" });
      }

      const video = await dbStorage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      return res.status(200).json(video);
    } catch (error) {
      console.error("Error fetching video:", error);
      return res.status(500).json({ message: "Failed to fetch video" });
    }
  });

  // Update a video
  app.patch("/api/videos/:id", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid video ID" });
      }

      const metadata = videoMetadataSchema.parse(req.body);

      const updatedVideo = await dbStorage.updateVideo(videoId, {
        notes: metadata.notes,
        category_id: metadata.category_id,
        rating: metadata.rating,
        is_favorite: metadata.is_favorite,
        timestamps: metadata.timestamps
      });

      if (!updatedVideo) {
        return res.status(404).json({ message: "Video not found" });
      }

      // If collections were specified, handle collection membership changes
      if (metadata.collection_ids && metadata.collection_ids.length > 0) {
        // For now, just add to the first collection specified (in a full implementation, we'd handle removing from other collections)
        await dbStorage.bulkAddVideosToCollection(metadata.collection_ids[0], [videoId]);
      }

      return res.status(200).json(updatedVideo);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating video:", error);
      return res.status(500).json({ message: "Failed to update video" });
    }
  });

  // Delete a video
  app.delete("/api/videos/:id", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid video ID" });
      }

      const deleted = await dbStorage.deleteVideo(videoId);
      if (!deleted) {
        return res.status(404).json({ message: "Video not found" });
      }

      return res.status(204).end();
    } catch (error) {
      console.error("Error deleting video:", error);
      return res.status(500).json({ message: "Failed to delete video" });
    }
  });

  // Bulk update videos
  app.patch("/api/videos", async (req, res) => {
    try {
      const { ids, ...updates } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Video IDs array is required" });
      }

      const metadata = videoMetadataSchema.parse(updates);

      const updateData: any = {
        notes: metadata.notes,
        category_id: metadata.category_id,
        rating: metadata.rating,
        is_favorite: metadata.is_favorite,
        timestamps: metadata.timestamps
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      // Bulk update videos
      const updatedCount = await dbStorage.bulkUpdateVideos(ids, updateData);

      // If collections were specified, add all videos to those collections
      if (metadata.collection_ids && metadata.collection_ids.length > 0) {
        await dbStorage.bulkAddVideosToCollection(metadata.collection_ids[0], ids);
      }

      return res.status(200).json({ count: updatedCount });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error bulk updating videos:", error);
      return res.status(500).json({ message: "Failed to update videos" });
    }
  });

  // Get categories
  app.get("/api/categories", async (req, res) => {
    try {
      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      const userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ CATEGORIES: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");

      // Get categories (both global and user-specific if authenticated)
      const categories = await dbStorage.getCategories(userId);
      return res.status(200).json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      return res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Create category
  app.post("/api/categories", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "Category name is required" });
      }

      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      const userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ CREATE CATEGORY: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");

      if (!userId) {
        return res.status(401).json({ 
          message: "Authentication required",
          code: "AUTH_REQUIRED" 
        });
      }

      const category = await dbStorage.createCategory({
        name,
        user_id: userId
      });

      return res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      return res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Collections API routes

  // Get all collections for a user
  app.get("/api/collections", async (req, res) => {
    try {
      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      let userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ COLLECTIONS: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");
      
      if (false && req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      const collections = await dbStorage.getCollectionsByUserId(userId);
      return res.status(200).json(collections);
    } catch (error) {
      console.error("Error fetching collections:", error);
      return res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  // Create a new collection
  app.post("/api/collections", async (req, res) => {
    try {
      const validatedData = insertCollectionSchema.parse(req.body);

      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      let userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ CREATE COLLECTION: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");
      
      if (false && req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      const collection = await dbStorage.createCollection({
        ...validatedData,
        user_id: userId
      });

      return res.status(201).json(collection);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating collection:", error);
      return res.status(500).json({ message: "Failed to create collection" });
    }
  });

  // Get a single collection by ID
  app.get("/api/collections/:id", async (req, res) => {
    try {
      const collectionId = parseInt(req.params.id);
      if (isNaN(collectionId)) {
        return res.status(400).json({ message: "Invalid collection ID" });
      }

      const collection = await dbStorage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      return res.status(200).json(collection);
    } catch (error) {
      console.error("Error fetching collection:", error);
      return res.status(500).json({ message: "Failed to fetch collection" });
    }
  });

  // Update a collection
  app.patch("/api/collections/:id", async (req, res) => {
    try {
      const collectionId = parseInt(req.params.id);
      if (isNaN(collectionId)) {
        return res.status(400).json({ message: "Invalid collection ID" });
      }

      const { name, description } = req.body;

      const updatedCollection = await dbStorage.updateCollection(collectionId, {
        name,
        description
      });

      if (!updatedCollection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      return res.status(200).json(updatedCollection);
    } catch (error) {
      console.error("Error updating collection:", error);
      return res.status(500).json({ message: "Failed to update collection" });
    }
  });

  // Delete a collection
  app.delete("/api/collections/:id", async (req, res) => {
    try {
      const collectionId = parseInt(req.params.id);
      if (isNaN(collectionId)) {
        return res.status(400).json({ message: "Invalid collection ID" });
      }

      const deleted = await dbStorage.deleteCollection(collectionId);
      if (!deleted) {
        return res.status(404).json({ message: "Collection not found" });
      }

      return res.status(204).end();
    } catch (error) {
      console.error("Error deleting collection:", error);
      return res.status(500).json({ message: "Failed to delete collection" });
    }
  });

  // Get videos in a collection
  app.get("/api/collections/:id/videos", async (req, res) => {
    try {
      const collectionId = parseInt(req.params.id);
      if (isNaN(collectionId)) {
        return res.status(400).json({ message: "Invalid collection ID" });
      }

      const videos = await dbStorage.getCollectionVideos(collectionId);
      return res.status(200).json(videos);
    } catch (error) {
      console.error("Error fetching collection videos:", error);
      return res.status(500).json({ message: "Failed to fetch collection videos" });
    }
  });

  // Add a video to a collection
  app.post("/api/collections/:id/videos", async (req, res) => {
    try {
      const collectionId = parseInt(req.params.id);
      if (isNaN(collectionId)) {
        return res.status(400).json({ message: "Invalid collection ID" });
      }

      const { video_id } = req.body;
      if (!video_id || typeof video_id !== 'number') {
        return res.status(400).json({ message: "Video ID is required" });
      }

      await dbStorage.addVideoToCollection({
        collection_id: collectionId,
        video_id
      });

      return res.status(201).json({ message: "Video added to collection" });
    } catch (error) {
      console.error("Error adding video to collection:", error);
      return res.status(500).json({ message: "Failed to add video to collection" });
    }
  });

  // Remove a video from a collection
  app.delete("/api/collections/:id/videos/:videoId", async (req, res) => {
    try {
      const collectionId = parseInt(req.params.id);
      const videoId = parseInt(req.params.videoId);

      if (isNaN(collectionId) || isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid collection or video ID" });
      }

      await dbStorage.removeVideoFromCollection(collectionId, videoId);
      return res.status(204).end();
    } catch (error) {
      console.error("Error removing video from collection:", error);
      return res.status(500).json({ message: "Failed to remove video from collection" });
    }
  });

  // Saved searches API routes

  // Get all saved searches for a user
  app.get("/api/saved-searches", async (req, res) => {
    try {
      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      let userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ SAVED SEARCHES: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");
      
      if (false && req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      const savedSearches = await dbStorage.getSavedSearchesByUserId(userId);
      return res.status(200).json(savedSearches);
    } catch (error) {
      console.error("Error fetching saved searches:", error);
      return res.status(500).json({ message: "Failed to fetch saved searches" });
    }
  });

  // Create a new saved search
  app.post("/api/saved-searches", async (req, res) => {
    try {
      const validatedData = insertSavedSearchSchema.parse(req.body);

      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      let userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ CREATE SAVED SEARCH: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");
      
      if (false && req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      const savedSearch = await dbStorage.createSavedSearch({
        ...validatedData,
        user_id: userId
      });

      return res.status(201).json(savedSearch);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating saved search:", error);
      return res.status(500).json({ message: "Failed to create saved search" });
    }
  });

  // Delete a saved search
  app.delete("/api/saved-searches/:id", async (req, res) => {
    try {
      const searchId = parseInt(req.params.id);
      if (isNaN(searchId)) {
        return res.status(400).json({ message: "Invalid saved search ID" });
      }

      const deleted = await dbStorage.deleteSavedSearch(searchId);
      if (!deleted) {
        return res.status(404).json({ message: "Saved search not found" });
      }

      return res.status(204).end();
    } catch (error) {
      console.error("Error deleting saved search:", error);
      return res.status(500).json({ message: "Failed to delete saved search" });
    }
  });

  // Semantic Search API route
  app.post("/api/semantic-search", async (req, res) => {
    try {
      const { query, filter, limit } = semanticSearchSchema.parse(req.body);

      // Initialize Supabase vector functions if not already done
      await initializeVectorFunctions();

      // TEMPORARY FIX: FORCE USER ID 3 FOR TEST
      let userId = 3; // Force demouser ID (3) as a temporary fix for testing
      
      console.log("⚠️ SEMANTIC SEARCH: Using FORCED USER ID:", userId);
      console.log("This is a temporary fix for testing - would be removed in production");
      
      if (false && req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      // Execute semantic search
      const results = await performSemanticSearch(
        userId,
        query,
        {
          contentTypes: filter?.content_types,
          videoId: filter?.video_id,
          categoryId: filter?.category_id,
          collectionId: filter?.collection_id,
          isFavorite: filter?.is_favorite
        },
        limit
      );

      // Save search to history
      try {
        await saveSearchHistory(userId, query, filter, results.length);
      } catch (error) {
        // Non-critical, log but continue
        log(`Error saving search history: ${error}`, 'routes');
      }

      return res.status(200).json(results);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      log(`Error performing semantic search: ${error}`, 'routes');
      return res.status(500).json({ message: "Failed to perform semantic search" });
    }
  });

  // Q&A Conversations API routes

  // Get all Q&A conversations for a video
  app.get("/api/videos/:id/qa", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid video ID" });
      }

      const conversations = await dbStorage.getQAConversationsByVideoId(videoId);
      return res.status(200).json(conversations);
    } catch (error) {
      console.error("Error fetching Q&A conversations:", error);
      return res.status(500).json({ message: "Failed to fetch Q&A conversations" });
    }
  });

  // Get a specific Q&A conversation
  app.get("/api/qa/:id", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      const conversation = await dbStorage.getQAConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      return res.status(200).json(conversation);
    } catch (error) {
      console.error("Error fetching Q&A conversation:", error);
      return res.status(500).json({ message: "Failed to fetch Q&A conversation" });
    }
  });

  // Create a new Q&A conversation
  app.post("/api/videos/:id/qa", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid video ID" });
      }

      // Get user_id from headers or default to 1
      let userId = 1;
      
      if (req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      console.log("Creating Q&A conversation with body:", req.body);

      try {
        // Validate schema requirements first
        console.log("Schema requirements:", Object.keys(insertQAConversationSchema.shape));

        // Ensure all required fields are in the request body
        const requestWithDefaults = {
          ...req.body,
          messages: req.body.messages || [],
          video_id: videoId,
          user_id: userId
        };

        console.log("Modified request with defaults:", requestWithDefaults);

        // Validate with schema
        const validatedData = insertQAConversationSchema.parse(requestWithDefaults);

        console.log("Validated data:", validatedData);

        // Create the conversation
        const conversation = await dbStorage.createQAConversation({
          ...validatedData,
          video_id: videoId,
          user_id: userId
        });

        return res.status(201).json(conversation);
      } catch (validationError) {
        console.error("Validation error details:", validationError);
        throw validationError;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating Q&A conversation:", error);
      return res.status(500).json({ message: `Failed to create Q&A conversation: ${error}` });
    }
  });

  // Ask a question in a Q&A conversation
  app.post("/api/qa/:id/ask", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      // Validate the question
      const { question } = qaQuestionSchema.parse(req.body);

      // Get the existing conversation
      const conversation = await dbStorage.getQAConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Get the video for the transcript
      const video = await dbStorage.getVideo(conversation.video_id);
      if (!video || !video.transcript) {
        return res.status(400).json({ message: "Video transcript not available for Q&A" });
      }

      // Build the conversation history from existing messages
      const messages = conversation.messages || [];
      const conversationHistory = Array.isArray(messages) ? messages.map((message: any) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content
      })) : [];

      // Perform semantic search to find relevant content for citations
      await initializeVectorFunctions();
      const searchResults = await performSemanticSearch(
        conversation.user_id,
        question,
        { 
          videoId: conversation.video_id,
          contentTypes: ['transcript', 'summary', 'note'] 
        },
        5 // Limit to top 5 results for citation purposes
      );

      // Generate an answer using OpenAI with citations
      const { answer, citations } = await generateAnswer(
        video.transcript,
        video.title,
        question,
        conversationHistory,
        searchResults
      );

      // Add the new question and answer to the messages
      const newAssistantMessage = { 
        role: 'assistant' as const, 
        content: answer,
        citations: citations || []
      };

      const updatedMessages = Array.isArray(messages) ? [
        ...messages,
        { role: 'user', content: question },
        newAssistantMessage
      ] : [
        { role: 'user', content: question },
        newAssistantMessage
      ];

      // Update the conversation with the new messages
      const updatedConversation = await dbStorage.updateQAConversation(
        conversationId,
        updatedMessages
      );

      return res.status(200).json({
        conversation: updatedConversation,
        answer,
        citations
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error processing question:", error);
      return res.status(500).json({ message: "Failed to process question" });
    }
  });

  // Delete a Q&A conversation
  app.delete("/api/qa/:id", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      const deleted = await dbStorage.deleteQAConversation(conversationId);
      if (!deleted) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      return res.status(204).end();
    } catch (error) {
      console.error("Error deleting Q&A conversation:", error);
      return res.status(500).json({ message: "Failed to delete Q&A conversation" });
    }
  });

  // Database status check for debugging
  app.get('/api/db-status', async (req, res) => {
    try {
      // Try to access various tables to verify they exist
      const testQuery = `
        SELECT 
          (SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')) as users_exists,
          (SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'videos')) as videos_exists,
          (SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'embeddings')) as embeddings_exists,
          (SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history')) as search_history_exists
      `;

      // Execute directly with pg client
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const result = await pool.query(testQuery);

      // Return table existence status
      res.json({ 
        database: 'connected',
        tables: result.rows[0]
      });
    } catch (error) {
      console.error("Error checking database status:", error);
      res.status(500).json({ 
        database: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Supabase status and config endpoint for frontend
  app.get('/api/supabase-config', async (req, res) => {
    try {
      // Return Supabase initialization status and config details for the client
      const status = {
        initialized: isSupabaseConfigured(),
        keyExists: Boolean(process.env.SUPABASE_KEY),
        urlExists: Boolean(process.env.SUPABASE_URL),
        // Provide minimal credentials needed for auth to work properly
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_KEY
      };

      res.json(status);
    } catch (error) {
      console.error("Error checking Supabase status:", error);
      res.status(500).json({ 
        initialized: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Auth callback route for OAuth redirect
  app.get('/auth/callback', (req, res) => {
    // This route handles the OAuth callback from Google
    // Supabase JS client handles token exchange automatically
    res.redirect('/');
  });

  // API endpoint to import anonymous user data
  app.post('/api/import-anonymous-data', async (req, res) => {
    try {
      const { userData, userId } = req.body;

      if (!userData || !userId) {
        return res.status(400).json({ message: 'Missing user data or user ID' });
      }

      // Process videos data if present
      if (userData.videos && Array.isArray(userData.videos)) {
        for (const video of userData.videos) {
          try {
            // First check if this video already exists for the user
            // Since searchVideos doesn't have a direct filter for youtube_id, we'll search by title
            // and then filter the results in memory
            const existingVideos = await dbStorage.searchVideos(Number(userId), {
              query: video.title || ''
            });

            // Check if any of the found videos match our youtube_id
            const existingVideo = existingVideos.filter(v => v.youtube_id === video.youtube_id);

            if (existingVideo.length === 0) {
              // Add video to user's library
              await dbStorage.insertVideo({
                ...video,
                user_id: Number(userId),
                created_at: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error(`Error importing video ${video.youtube_id}:`, error);
            // Continue with next video rather than failing the whole import
          }
        }
      }

      // Process collections data if present
      if (userData.collections && Array.isArray(userData.collections)) {
        for (const collection of userData.collections) {
          try {
            // First check if a collection with this name already exists
            const existingCollections = await dbStorage.getCollectionsByUserId(Number(userId));
            const matchingCollection = existingCollections.find(c => c.name === collection.name);

            let collectionId: number;

            if (!matchingCollection) {
              // Create new collection
              const newCollection = await dbStorage.createCollection({
                name: collection.name,
                description: collection.description || '',
                user_id: Number(userId)
              });
              collectionId = newCollection.id;
            } else {
              collectionId = matchingCollection.id;
            }

            // Add videos to collection if included
            if (collection.videoIds && Array.isArray(collection.videoIds)) {
              await dbStorage.bulkAddVideosToCollection(collectionId, collection.videoIds);
            }
          } catch (error) {
            console.error(`Error importing collection ${collection.name}:`, error);
            // Continue with next collection rather than failing the whole import
          }
        }
      }

      return res.status(200).json({ message: 'Data imported successfully' });
    } catch (error) {
      console.error('Error importing anonymous data:', error);
      return res.status(500).json({ 
        message: 'Failed to import data', 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Export routes

  // Export video content (transcript, summary, or Q&A)
  app.post("/api/export", async (req, res) => {
    try {
      // Parse request and add userId
      const exportRequest = req.body;

      // Get user_id from headers or default to 1
      let userId = 1;
      
      if (req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }
      
      exportRequest.userId = userId;

      const exportData = exportRequestSchema.parse(exportRequest);

      let result;
      if (exportData.video_ids.length === 1) {
        // Single video export
        result = await exportVideoContent(exportData);

        return res.status(200).json({
          filename: result.filename,
          content: result.content,
          mimeType: result.mimeType
        });
      } else {
        // Batch export
        result = await exportBatchVideoContent(exportData);

        return res.status(200).json({
          filename: result.filename,
          content: result.content,
          mimeType: result.mimeType
        });
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error exporting content:", error);
      return res.status(500).json({ 
        message: "Failed to export content",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get user's export format preference
  app.get("/api/export/preferences", async (req, res) => {
    try {
      // Get user_id from headers or default to 1
      let userId = 1;
      
      if (req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      const format = await getExportPreference(userId);
      return res.status(200).json({ format });
    } catch (error) {
      console.error("Error getting export preferences:", error);
      return res.status(500).json({ message: "Failed to get export preferences" });
    }
  });

  // Save user's export format preference
  app.post("/api/export/preferences", async (req, res) => {
    try {
      const { format } = req.body;

      if (!format || !exportFormatEnum.enumValues.includes(format)) {
        return res.status(400).json({ 
          message: `Format must be one of: ${exportFormatEnum.enumValues.join(", ")}` 
        });
      }

      // Get user_id from headers or default to 1
      let userId = 1;
      
      if (req.headers['x-user-id']) {
        try {
          userId = Number(req.headers['x-user-id']);
          if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
        } catch (e) {
          return res.status(400).json({ message: "Failed to parse user ID" });
        }
      }

      await saveExportPreference(userId, format);
      return res.status(200).json({ format });
    } catch (error) {
      console.error("Error saving export preferences:", error);
      return res.status(500).json({ message: "Failed to save export preferences" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

function extractYoutubeId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}