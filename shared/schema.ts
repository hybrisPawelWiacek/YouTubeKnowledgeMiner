import { pgTable, text, serial, integer, boolean, timestamp, primaryKey, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Using pgvector for native vector operations in PostgreSQL
export const contentTypeEnum = pgEnum('content_type', ['transcript', 'summary', 'note']);

// Table for storing text chunks and their vector embeddings
export const embeddings = pgTable("embeddings", {
  id: serial("id").primaryKey(),
  video_id: integer("video_id").references(() => videos.id).notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  content_type: contentTypeEnum("content_type").notNull(),
  chunk_index: integer("chunk_index").notNull(), // Position in the original content
  content: text("content").notNull(), // The actual text chunk
  embedding: text("embedding").notNull().type("vector(1536)"), // Using pgvector type for embeddings (1536 for OpenAI's ada-002)
  metadata: jsonb("metadata"), // Additional metadata like timestamps, etc.
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Table to track search history
export const search_history = pgTable("search_history", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  query: text("query").notNull(),
  filter_params: jsonb("filter_params"),
  results_count: integer("results_count"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  user_id: integer("user_id").references(() => users.id).notNull(),
});

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  youtube_id: text("youtube_id").notNull(),
  title: text("title").notNull(),
  channel: text("channel").notNull(),
  duration: text("duration").notNull(),
  publish_date: text("publish_date").notNull(),
  thumbnail: text("thumbnail").notNull(),
  transcript: text("transcript"),
  summary: text("summary").array(),
  views: text("views"),
  likes: text("likes"),
  tags: text("tags").array(),
  description: text("description"),
  user_id: integer("user_id").references(() => users.id).notNull(),
  notes: text("notes"),
  category_id: integer("category_id").references(() => categories.id),
  rating: integer("rating"),
  is_favorite: boolean("is_favorite").default(false),
  timestamps: text("timestamps").array(), // For adding custom timestamps/highlights
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// New collections table for organizing videos
export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  user_id: integer("user_id").references(() => users.id).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Junction table for videos in collections
export const collection_videos = pgTable("collection_videos", {
  collection_id: integer("collection_id").references(() => collections.id).notNull(),
  video_id: integer("video_id").references(() => videos.id).notNull(),
  added_at: timestamp("added_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.collection_id, table.video_id] }),
  };
});

// Saved searches for users
export const saved_searches = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  filters: text("filters"), // Stored as JSON string
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Q&A conversations for videos
export const qa_conversations = pgTable("qa_conversations", {
  id: serial("id").primaryKey(),
  video_id: integer("video_id").references(() => videos.id).notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  messages: jsonb("messages").notNull().default([]), // Array of {role: 'user'|'assistant', content: string}
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  created_at: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  created_at: true,
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  created_at: true,
});

export const insertCollectionVideoSchema = createInsertSchema(collection_videos).omit({
  added_at: true,
});

export const insertSavedSearchSchema = createInsertSchema(saved_searches).omit({
  id: true,
  created_at: true,
});

export const insertQAConversationSchema = createInsertSchema(qa_conversations).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// YouTube API related schemas
export const youtubeUrlSchema = z.object({
  url: z.string().url().refine(
    (url) => {
      const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
      return regex.test(url);
    },
    {
      message: "URL must be a valid YouTube URL",
    }
  ),
});

export const videoMetadataSchema = z.object({
  notes: z.string().optional(),
  category_id: z.number().optional(),
  rating: z.number().min(1).max(5).optional(),
  is_favorite: z.boolean().optional(),
  timestamps: z.array(z.string()).optional(),
  collection_ids: z.array(z.number()).optional(),
});

// Search params schema
export const searchParamsSchema = z.object({
  query: z.string().optional(),
  category_id: z.number().optional(),
  collection_id: z.number().optional(),
  rating_min: z.number().optional(),
  rating_max: z.number().optional(),
  date_from: z.string().optional(), // ISO date string
  date_to: z.string().optional(), // ISO date string
  sort_by: z.enum(['title', 'date', 'rating']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  is_favorite: z.boolean().optional(),
});

// Q&A Message schema
export const qaMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.date().optional(),
});

// Q&A Request schema
export const qaQuestionSchema = z.object({
  video_id: z.number(),
  question: z.string().min(3),
  conversation_id: z.number().optional(),
});

// Semantic search schema
export const semanticSearchSchema = z.object({
  query: z.string().min(3),
  filter: z.object({
    content_types: z.array(z.enum(['transcript', 'summary', 'note'])).optional(),
    video_id: z.number().optional(),
    category_id: z.number().optional(),
    collection_id: z.number().optional(),
    is_favorite: z.boolean().optional(),
  }).optional(),
  limit: z.number().min(1).max(100).default(10),
});

// Insert schemas for new tables
export const insertEmbeddingSchema = createInsertSchema(embeddings).omit({
  id: true,
  created_at: true,
});

export const insertSearchHistorySchema = createInsertSchema(search_history).omit({
  id: true,
  created_at: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type InsertCollectionVideo = z.infer<typeof insertCollectionVideoSchema>;
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type InsertEmbedding = z.infer<typeof insertEmbeddingSchema>;
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CollectionVideo = typeof collection_videos.$inferSelect;
export type SavedSearch = typeof saved_searches.$inferSelect;
export type QAConversation = typeof qa_conversations.$inferSelect;
export type Embedding = typeof embeddings.$inferSelect;
export type SearchHistory = typeof search_history.$inferSelect;
export type InsertQAConversation = z.infer<typeof insertQAConversationSchema>;
export type QAMessage = z.infer<typeof qaMessageSchema>;
export type QAQuestion = z.infer<typeof qaQuestionSchema>;
export type YoutubeUrlRequest = z.infer<typeof youtubeUrlSchema>;
export type VideoMetadataRequest = z.infer<typeof videoMetadataSchema>;
export type SearchParams = z.infer<typeof searchParamsSchema>;
export type SemanticSearchParams = z.infer<typeof semanticSearchSchema>;
