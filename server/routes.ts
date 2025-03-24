import type { Express } from "express";
import { createServer, type Server } from "http";
import { dbStorage } from "./database-storage"; // Using database storage
import { processYoutubeVideo, getYoutubeTranscript } from "./services/youtube";
import { ZodError } from "zod";
import { VideoMetadataRequest, youtubeUrlSchema, videoMetadataSchema } from "@shared/schema";

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
      
      return res.status(200).json({
        ...videoData,
        transcript,
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
      const { youtubeId, title, channel, duration, publishDate, thumbnail, transcript } = req.body;
      const metadata: VideoMetadataRequest = videoMetadataSchema.parse({
        notes: req.body.notes,
        category_id: req.body.category_id,
        rating: req.body.rating
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
        user_id: userId,
        notes: metadata.notes,
        category_id: metadata.category_id,
        rating: metadata.rating
      });
      
      return res.status(201).json(video);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error saving video:", error);
      return res.status(500).json({ message: "Failed to save video to library" });
    }
  });
  
  // Get videos for a user
  app.get("/api/videos", async (req, res) => {
    try {
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
      const videos = await dbStorage.getVideosByUserId(userId);
      return res.status(200).json(videos);
    } catch (error) {
      console.error("Error fetching videos:", error);
      return res.status(500).json({ message: "Failed to fetch videos" });
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
  
  const httpServer = createServer(app);
  
  return httpServer;
}

function extractYoutubeId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}
