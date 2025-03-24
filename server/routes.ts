import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { processYoutubeVideo, getYoutubeTranscript } from "./services/youtube";
import { ZodError } from "zod";
import { VideoMetadataRequest, youtubeUrlSchema, videoMetadataSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
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
      const video = await storage.insertVideo({
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
  
  // Get categories
  app.get("/api/categories", async (req, res) => {
    try {
      // In a real app, get user_id from session
      const userId = 1; // This would come from session
      
      const categories = await storage.getCategoriesByUserId(userId);
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
      
      const category = await storage.createCategory({
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
