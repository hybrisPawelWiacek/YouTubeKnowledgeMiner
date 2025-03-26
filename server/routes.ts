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
  exportRequestSchema, exportFormatEnum, Video, SearchParams
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

      // Get user info from the request - this handles both authenticated and anonymous users
      const userInfo = await getUserInfoFromRequest(req);
      
      console.log("================================================");
      console.log("🔑 User info extracted from request:", JSON.stringify(userInfo, null, 2));
      console.log("================================================");
      
      // Debug: log all headers for troubleshooting 
      console.log("Request headers for /api/videos:", JSON.stringify(req.headers, null, 2));
      
      // For anonymous users with sessions, check video limit
      if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
        // Get the current video count for this anonymous session
        const anonymousSessionId = userInfo.anonymous_session_id;
        
        // Check if adding a new video would exceed the limit
        // First we need to increment the video count
        let newVideoCount;
        try {
          newVideoCount = await dbStorage.incrementAnonymousSessionVideoCount(anonymousSessionId);
          console.log(`[Anonymous Limit] Current video count for session ${anonymousSessionId}: ${newVideoCount}`);
          
          // Check if this exceeds the limit (3 videos per anonymous session)
          const ANONYMOUS_VIDEO_LIMIT = 3;
          
          if (newVideoCount > ANONYMOUS_VIDEO_LIMIT) {
            console.log(`[Anonymous Limit] Session ${anonymousSessionId} has reached the video limit`);
            return res.status(403).json({ 
              message: "Anonymous users can only save up to 3 videos. Please sign up for a free account to save more videos.",
              video_count: newVideoCount - 1,  // Subtract 1 because we already incremented
              limit_reached: true
            });
          }
        } catch (limitError) {
          console.error(`[Anonymous Limit] Error checking video limit: ${limitError}`);
          // Continue with saving since this is not a critical error
        }
      }
      
      // Save to database through storage interface
      const videoData: any = {
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
        user_id: userInfo.user_id,
        notes: metadata.notes,
        category_id: metadata.category_id,
        rating: metadata.rating,
        is_favorite: metadata.is_favorite,
        timestamps: metadata.timestamps
      };
      
      // For anonymous users with sessions, add the session ID and use user_id=1 for database compatibility
      if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
        videoData.anonymous_session_id = userInfo.anonymous_session_id;
        // We must use user_id=1 for anonymous users due to the not-null constraint
        // The anonymous_session_id is what actually identifies the user
        videoData.user_id = 1;
        console.log("Converting null user_id to 1 for anonymous session:", userInfo.anonymous_session_id);
      } else if (userInfo.user_id === null) {
        // Fall back to user_id=1 for any edge cases where we have a null user but no session
        videoData.user_id = 1;
        console.log("Converting null user_id to 1 (no session)");
      }
      
      console.log("User ID in insert request:", videoData.user_id, "(type:", typeof videoData.user_id, ")");
      const video = await dbStorage.insertVideo(videoData);

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
          await processTranscriptEmbeddings(video.id, userInfo.user_id, transcript);
        } catch (embeddingError) {
          log(`Error processing transcript embeddings: ${embeddingError}`, 'routes');
          // Non-critical, continue
        }
      }

      // Process summary for embeddings if available
      if (video.id && summary && summary.length > 0) {
        try {
          log(`Processing summary embeddings for video ${video.id}`, 'routes');
          await processSummaryEmbeddings(video.id, userInfo.user_id, summary);
        } catch (embeddingError) {
          log(`Error processing summary embeddings: ${embeddingError}`, 'routes');
          // Non-critical, continue
        }
      }

      // Process notes for embeddings if available
      if (video.id && metadata.notes) {
        try {
          log(`Processing notes embeddings for video ${video.id}`, 'routes');
          await processNotesEmbeddings(video.id, userInfo.user_id, metadata.notes);
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
      
      // Get user info from the request - this handles both authenticated and anonymous users
      const userInfo = await getUserInfoFromRequest(req);
      
      console.log("================================================");
      console.log("🔑 User info extracted from request:", JSON.stringify(userInfo, null, 2));
      console.log("================================================");
      
      // Debug: log all headers for troubleshooting
      console.log("Request headers for GET /api/videos:", JSON.stringify(req.headers, null, 2));

      // For anonymous users with session ID, we need to get videos by anonymous session ID
      let videos = [];
      
      if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
        console.log(`[Anonymous Session] Getting videos for anonymous session: ${userInfo.anonymous_session_id}`);
        
        // Get videos associated with this anonymous session ID
        videos = await dbStorage.getVideosByAnonymousSessionId(userInfo.anonymous_session_id);
        
        // Return the videos with the same structure as other API responses
        if (Object.keys(req.query).length > 0) {
          // If there were search parameters, we would filter these videos, but for simplicity
          // we'll just return all videos for this demo
          return res.status(200).json({
            videos,
            totalCount: videos.length,
            hasMore: false,
            nextCursor: undefined
          });
        } else {
          return res.status(200).json({
            videos,
            totalCount: videos.length,
            hasMore: false
          });
        }
      } else {
        // For regular authenticated users, continue with normal flow
        // Check if search parameters were provided
        if (Object.keys(req.query).length > 0) {
          const searchParams = searchParamsSchema.parse(req.query);
          // Handle anonymous and authenticated users
          if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
            // For anonymous users with a session, search their videos
            const videos = await dbStorage.getVideosByAnonymousSessionId(userInfo.anonymous_session_id);
            // Filter these videos based on the search parameters
            // This is a simplified approach - ideally we'd incorporate searchParams in the database query
            const filteredVideos = applySearchFilters(videos, searchParams);
            
            return res.status(200).json({
              videos: filteredVideos,
              totalCount: filteredVideos.length,
              hasMore: false
            });
          } else if (userInfo.user_id !== null) {
            // For authenticated users, use the search function directly
            const result = await dbStorage.searchVideos(userInfo.user_id, searchParams);
            return res.status(200).json(result);
          }
        } else {
          // For direct getVideosByUserId, wrap the result in the same format
          // for consistency with the frontend
          // If user_id is null (anonymous user with session), we need special handling
          if (userInfo.user_id === null && userInfo.anonymous_session_id) {
            // Get videos by anonymous session instead
            const videos = await dbStorage.getVideosByAnonymousSessionId(userInfo.anonymous_session_id);
            return res.status(200).json({
              videos,
              totalCount: videos.length,
              hasMore: false
            });
          } else if (userInfo.user_id !== null) {
            // Normal user case
            const videos = await dbStorage.getVideosByUserId(userInfo.user_id);
            return res.status(200).json({
              videos,
              totalCount: videos.length,
              hasMore: false
            });
          } else {
            // No user ID and no anonymous session
            return res.status(200).json({
              videos: [],
              totalCount: 0,
              hasMore: false
            });
          }
        }
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
      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("CATEGORIES: Using user ID from request:", userId);

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

      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("CREATE CATEGORY: Using user ID from request:", userId);

      if (userId === null) {
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
      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("COLLECTIONS: Using user ID from request:", userId);
      
      // Anonymous users (userId is null) don't have collections
      const collections = userId ? await dbStorage.getCollectionsByUserId(userId) : [];
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

      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("CREATE COLLECTION: Using user ID from request:", userId);
      
      // Anonymous users can't create collections
      if (userId === null) {
        return res.status(401).json({ 
          message: "Authentication required to create collections",
          code: "AUTH_REQUIRED" 
        });
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
      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("SAVED SEARCHES: Using user ID from request:", userId);
      
      // Anonymous users don't have saved searches
      const savedSearches = userId ? await dbStorage.getSavedSearchesByUserId(userId) : [];
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

      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("CREATE SAVED SEARCH: Using user ID from request:", userId);
      
      // Anonymous users can't create saved searches
      if (userId === null) {
        return res.status(401).json({ 
          message: "Authentication required to save searches",
          code: "AUTH_REQUIRED" 
        });
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

      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("SEMANTIC SEARCH: Using user ID from request:", userId);

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

      // Save search to history only for authenticated users
      if (userId !== null) {
        try {
          await saveSearchHistory(userId, query, filter, results.length);
        } catch (error) {
          // Non-critical, log but continue
          log(`Error saving search history: ${error}`, 'routes');
        }
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

      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("CREATE Q&A CONVERSATION: Using user ID from request:", userId);
      console.log("Creating Q&A conversation with body:", req.body);
      
      // Anonymous users can't create Q&A conversations
      if (userId === null) {
        return res.status(401).json({ 
          message: "Authentication required to create Q&A conversations",
          code: "AUTH_REQUIRED" 
        });
      }

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
            // Convert the string userId to a number for this query
            const existingVideos = await dbStorage.searchVideos(Number(userId), {
              query: video.title || '',
              page: 1,
              limit: 10
            });

            // Check if any of the found videos match our youtube_id
            const existingVideo = existingVideos.videos.filter((v: any) => v.youtube_id === video.youtube_id);

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

      // Get user ID using our helper function
      const userId = await getUserIdFromRequest(req);
      
      console.log("EXPORT: Using user ID from request:", userId);
      
      // Anonymous users can't export content
      if (userId === null) {
        return res.status(401).json({ 
          message: "Authentication required to export content",
          code: "AUTH_REQUIRED" 
        });
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
      // Get user ID using our helper function (now async)
      const userId = await getUserIdFromRequest(req);
      
      console.log("GET EXPORT PREFERENCES: Using user ID from request:", userId);
      
      // For anonymous users, return default format without requiring authentication
      const format = userId !== null 
        ? await getExportPreference(userId)
        : 'txt'; // Default format for anonymous users
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

      // Get user ID using our helper function (now async)
      const userId = await getUserIdFromRequest(req);
      
      console.log("SAVE EXPORT PREFERENCES: Using user ID from request:", userId);
      
      // Anonymous users can't save export preferences
      if (userId === null) {
        return res.status(401).json({ 
          message: "Authentication required to save export preferences",
          code: "AUTH_REQUIRED" 
        });
      }

      await saveExportPreference(userId, format);
      return res.status(200).json({ format });
    } catch (error) {
      console.error("Error saving export preferences:", error);
      return res.status(500).json({ message: "Failed to save export preferences" });
    }
  });

  const httpServer = createServer(app);

  // Anonymous Sessions API routes
  
  // Get video count for anonymous session
  app.get("/api/anonymous/videos/count", async (req, res) => {
    try {
      // Get session ID from header
      const sessionHeader = req.headers['x-anonymous-session'];
      if (!sessionHeader) {
        return res.status(200).json({ count: 0 });
      }
      
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
      
      // Get session from database
      const session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
      
      if (!session) {
        return res.status(200).json({ count: 0 });
      }
      
      // Update last active timestamp for the session
      await dbStorage.updateAnonymousSessionLastActive(sessionId);
      
      return res.status(200).json({ 
        count: session.video_count,
        session_id: sessionId,
        max_allowed: 3 // Hard-coded limit for now, could move to config
      });
    } catch (error) {
      console.error("Error getting anonymous video count:", error);
      return res.status(500).json({ 
        message: "Failed to get anonymous video count",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Migration endpoint to move videos from anonymous session to authenticated user
  app.post("/api/migrate-anonymous-session", async (req, res) => {
    try {
      // Get session ID from header
      const sessionHeader = req.headers['x-anonymous-session'];
      if (!sessionHeader) {
        return res.status(400).json({ message: "No anonymous session ID provided" });
      }
      
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
      const { userId } = req.body;
      
      if (!userId || typeof userId !== 'number') {
        return res.status(400).json({ message: "Invalid user ID provided" });
      }
      
      // Get videos attached to this anonymous session
      const anonymousVideos = await dbStorage.getVideosByAnonymousSessionId(sessionId);
      
      if (!anonymousVideos || anonymousVideos.length === 0) {
        return res.status(200).json({ message: "No videos to migrate", migratedCount: 0 });
      }
      
      // Update the user_id on all these videos
      let migratedCount = 0;
      for (const video of anonymousVideos) {
        await dbStorage.updateVideo(video.id, { user_id: userId });
        migratedCount++;
      }
      
      console.log(`Successfully migrated ${migratedCount} videos from anonymous session ${sessionId} to user ${userId}`);
      
      return res.status(200).json({ 
        message: "Videos successfully migrated", 
        migratedCount,
        sessionId
      });
    } catch (error) {
      console.error("Error migrating anonymous session:", error);
      return res.status(500).json({ 
        message: "Failed to migrate anonymous session", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return httpServer;
}

/**
 * Apply search parameters to an array of videos (used for anonymous users)
 * This is a simplified version of the database filtering for anonymous users
 */
function applySearchFilters(videos: Video[], params: SearchParams): Video[] {
  // Start with all videos
  let result = [...videos];
  
  // Apply cursor pagination if specified
  if (params.cursor !== undefined) {
    const cursorIndex = result.findIndex(v => v.id === params.cursor);
    if (cursorIndex !== -1) {
      result = result.slice(cursorIndex + 1);
    }
  }
  
  // Apply category filter
  if (params.category_id !== undefined) {
    result = result.filter(v => v.category_id === params.category_id);
  }
  
  // Apply collection filter
  // Note: This would require additional database lookups in a real implementation
  // For now, we'll just pass it through since collection filtering for anonymous users
  // is probably rare and not worth the complexity
  
  // Apply favorite filter
  if (params.is_favorite !== undefined) {
    result = result.filter(v => v.is_favorite === params.is_favorite);
  }
  
  // Apply rating filter
  if (params.min_rating !== undefined) {
    result = result.filter(v => v.rating !== null && v.rating >= params.min_rating);
  }
  
  // Apply search term
  if (params.search !== undefined && params.search.trim() !== '') {
    const searchLower = params.search.toLowerCase();
    result = result.filter(v => 
      v.title.toLowerCase().includes(searchLower) || 
      v.channel.toLowerCase().includes(searchLower) ||
      (v.notes && v.notes.toLowerCase().includes(searchLower))
    );
  }
  
  // Apply sorting
  if (params.sort_by) {
    result.sort((a, b) => {
      if (params.sort_by === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (params.sort_by === 'title') {
        return a.title.localeCompare(b.title);
      } else if (params.sort_by === 'rating') {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
      }
      return 0;
    });
    
    // Apply sort order if specified
    if (params.sort_order === 'asc') {
      result.reverse();
    }
  }
  
  // Apply limit and calculate pagination
  let hasMore = false;
  let nextCursor = undefined;
  
  if (params.limit) {
    if (result.length > params.limit) {
      hasMore = true;
      nextCursor = result[params.limit - 1].id;
      result = result.slice(0, params.limit);
    }
  }
  
  return result;
}

function extractYoutubeId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

// Helper function to extract and validate user ID from request headers
// Returns a valid user ID or falls back to an anonymous user
/**
 * Gets detailed user information from request headers
 * Handles both authenticated users and anonymous sessions
 * 
 * @param req Express request object
 * @returns User information including ID, session details, and authentication status
 */
async function getUserInfoFromRequest(req: Request): Promise<{ 
  user_id: number | null; 
  anonymous_session_id?: string;
  is_anonymous: boolean;
}> {
  console.log("[Auth Helper] Extracting user info from request headers");
  
  // 1. Try to get the user ID from the x-user-id header (for authenticated users)
  // Default to null for anonymous users (not 1)
  let userId: number | null = null;
  let isAnonymous = true;
  let anonymousSessionId: string | undefined = undefined;
  
  // Check if we have a user ID header
  if (req.headers['x-user-id']) {
    try {
      const headerValue = req.headers['x-user-id'];
      console.log("[Auth Helper] Found x-user-id header:", headerValue);
      
      // Handle both string and array formats
      const idValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      
      // Try to extract a numeric value - be strict about this being a number
      // First convert to string in case it's something else
      const stringValue = String(idValue);
      
      // Use regex to extract just the numeric portion if mixed with other characters
      const matches = stringValue.match(/(\d+)/);
      const cleanValue = matches ? matches[1] : stringValue;
      
      const parsedId = parseInt(cleanValue, 10);
      
      // Validate the parsed ID - specifically don't treat 1 as authenticated
      // since that's our anonymous user ID
      if (!isNaN(parsedId) && parsedId > 0 && parsedId !== 1) {
        userId = parsedId;
        isAnonymous = false;
        console.log("[Auth Helper] Successfully parsed authenticated user ID:", userId);
      } else if (!isNaN(parsedId) && parsedId === 1) {
        // This is an anonymous user, so check for a session header
        console.log("[Auth Helper] Found user ID 1 (anonymous), checking for session");
      } else {
        console.warn("[Auth Helper] Invalid user ID format in header:", idValue, "- Parsed as:", parsedId);
      }
    } catch (error) {
      console.error("[Auth Helper] Error parsing user ID from header:", error)
    }
  } else {
    console.log("[Auth Helper] No x-user-id header found, checking for anonymous session");
  }
  
  // 2. If this is an anonymous user (userId is null), look for session tracking
  if (isAnonymous) {
    // Check for anonymous session header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (sessionHeader) {
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
      console.log("[Auth Helper] Found anonymous session header:", sessionId);
      
      // Check if this session exists in the database
      let session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
      
      if (!session) {
        // Create a new session if it doesn't exist
        console.log("[Auth Helper] Creating new anonymous session in database");
        try {
          session = await dbStorage.createAnonymousSession({
            session_id: sessionId,
            user_agent: req.headers['user-agent'] || null,
            ip_address: req.ip || null
          });
          console.log("[Auth Helper] Session created successfully:", session);
        } catch (error) {
          console.error("[Auth Helper] ERROR creating anonymous session:", error);
        }
      } else {
        console.log("[Auth Helper] Using existing anonymous session from database");
      }
      
      // Update the session's last active timestamp
      await dbStorage.updateAnonymousSessionLastActive(sessionId);
      
      // Set the anonymous session ID for return
      anonymousSessionId = sessionId;
    } else {
      console.log("[Auth Helper] No anonymous session header found, using default anonymous user");
    }
  }
  
  console.log("[Auth Helper] Final user info:", { 
    user_id: userId, 
    is_anonymous: isAnonymous, 
    has_session: !!anonymousSessionId 
  });
  
  return {
    user_id: userId,
    anonymous_session_id: anonymousSessionId,
    is_anonymous: isAnonymous
  };
}

/**
 * Returns the user ID for authenticated users or null for anonymous users
 * This supports the session-based approach for both user types
 * 
 * @param req Express request object
 * @returns The user ID for authenticated users or null for anonymous users
 */
async function getUserIdFromRequest(req: Request): Promise<number | null> {
  console.log("[Auth Helper] Extracting user ID from request headers");
  
  // Default to null for anonymous users - this is the key change
  let userId: number | null = null;
  let isAnonymous = true;
  let anonymousSessionId: string | null = null;
  
  // Check if we have a user ID header first (authenticated user)
  if (req.headers['x-user-id']) {
    try {
      const headerValue = req.headers['x-user-id'];
      console.log("[Auth Helper] Found x-user-id header:", headerValue);
      
      // Handle both string and array formats
      const idValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      
      // Try to extract a numeric value - be strict about this being a number
      // First convert to string in case it's something else
      const stringValue = String(idValue);
      
      // Use regex to extract just the numeric portion if mixed with other characters
      const matches = stringValue.match(/(\d+)/);
      const cleanValue = matches ? matches[1] : stringValue;
      
      const parsedId = parseInt(cleanValue, 10);
      
      // Validate the parsed ID - exclude 1 since that's reserved for anonymous users
      if (!isNaN(parsedId) && parsedId > 0) {
        userId = parsedId;
        isAnonymous = false; // This is an authenticated user
        console.log("[Auth Helper] Successfully parsed authenticated user ID:", userId);
      } else {
        console.warn("[Auth Helper] Invalid user ID format in header:", idValue, "- Parsed as:", parsedId);
      }
    } catch (error) {
      console.error("[Auth Helper] Error parsing user ID from header:", error);
    }
  } else {
    console.log("[Auth Helper] No x-user-id header found, checking for anonymous session");
  }
  
  // If this is an anonymous user, try to get their session
  if (isAnonymous) {
    const sessionHeader = req.headers['x-anonymous-session'];
    if (sessionHeader) {
      try {
        const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
        console.log("[Auth Helper] Found anonymous session header:", sessionId);
        anonymousSessionId = sessionId;
        
        // Get or create session and update last active time
        let session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
        
        if (session) {
          console.log("[Auth Helper] Found existing anonymous session, updating last active time");
          await dbStorage.updateAnonymousSessionLastActive(sessionId);
        } else {
          console.log("[Auth Helper] Creating new anonymous session");
          session = await dbStorage.createAnonymousSession({
            session_id: sessionId,
            user_agent: req.headers['user-agent'] || null,
            ip_address: req.ip || null
          });
        }
        
        // For anonymous users, we now return null instead of user_id=1
        // The session ID header is what ties videos to specific anonymous users
        console.log("[Auth Helper] Using anonymous session ID:", sessionId);
      } catch (error) {
        console.error("[Auth Helper] Error handling anonymous session:", error);
      }
    } else {
      console.log("[Auth Helper] No anonymous session header found, using null user ID for anonymous");
    }
  }
  
  console.log("[Auth Helper] Final user ID being used:", userId, "(type:", typeof userId, ")");
  return userId;
}