import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { dbStorage } from "./database-storage"; // Using database storage
import { processYoutubeVideo, getYoutubeTranscript, generateTranscriptSummary } from "./services/youtube";
import { generateAnswer } from "./services/openai";
import { ZodError } from "zod";
import { 
  VideoMetadataRequest, youtubeUrlSchema, videoMetadataSchema, 
  insertCollectionSchema, insertSavedSearchSchema, searchParamsSchema, 
  qaQuestionSchema, insertQAConversationSchema
} from "@shared/schema";
import { log } from "./vite";

export async function registerRoutes(app: Express): Promise<Server> {
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
      const { youtubeId, title, channel, duration, publishDate, thumbnail, transcript, summary } = req.body;
      const metadata: VideoMetadataRequest = videoMetadataSchema.parse({
        notes: req.body.notes,
        category_id: req.body.category_id,
        rating: req.body.rating,
        is_favorite: req.body.is_favorite,
        timestamps: req.body.timestamps,
        collection_ids: req.body.collection_ids
      });
      
      // In a real app, we would get the user_id from the session
      // For now, use a mock user ID until auth is fully implemented
      const userId = 1; // This would come from session in real implementation
      
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
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
      // Check if search parameters were provided
      if (Object.keys(req.query).length > 0) {
        const searchParams = searchParamsSchema.parse(req.query);
        const videos = await dbStorage.searchVideos(userId, searchParams);
        return res.status(200).json(videos);
      } else {
        const videos = await dbStorage.getVideosByUserId(userId);
        return res.status(200).json(videos);
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
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
      const categories = await dbStorage.getCategoriesByUserId(userId);
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
      
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
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
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
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
      
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
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
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
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
      
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
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
      
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
      console.log("Creating Q&A conversation with body:", req.body);
      
      // Validate with schema
      const validatedData = insertQAConversationSchema.parse(req.body);
      
      console.log("Validated data:", validatedData);
      
      // Create the conversation
      const conversation = await dbStorage.createQAConversation({
        ...validatedData,
        video_id: videoId,
        user_id: userId,
        messages: []
      });
      
      return res.status(201).json(conversation);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating Q&A conversation:", error);
      return res.status(500).json({ message: "Failed to create Q&A conversation" });
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
      const conversationHistory = messages.map(message => ({
        role: message.role as 'user' | 'assistant',
        content: message.content
      }));
      
      // Generate an answer using OpenAI
      const answer = await generateAnswer(
        video.transcript,
        video.title,
        question,
        conversationHistory
      );
      
      // Add the new question and answer to the messages
      const updatedMessages = [
        ...messages,
        { role: 'user', content: question },
        { role: 'assistant', content: answer }
      ];
      
      // Update the conversation with the new messages
      const updatedConversation = await dbStorage.updateQAConversation(
        conversationId,
        updatedMessages
      );
      
      return res.status(200).json({
        conversation: updatedConversation,
        answer
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
  
  const httpServer = createServer(app);
  
  return httpServer;
}

function extractYoutubeId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}
