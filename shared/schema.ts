import { pgTable, text, serial, integer, boolean, timestamp, primaryKey, jsonb, pgEnum, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Using pgvector for native vector operations in PostgreSQL
export const contentTypeEnum = pgEnum('content_type', ['transcript', 'summary', 'note', 'conversation']);
export const exportFormatEnum = pgEnum('export_format', ['txt', 'csv', 'json']);
export const userTypeEnum = pgEnum('user_type', ['registered', 'anonymous']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'pending_verification']);
export const tokenTypeEnum = pgEnum('token_type', ['refresh', 'reset_password', 'verification']);

// Table for storing anonymous user sessions
export const anonymous_sessions = pgTable("anonymous_sessions", {
  id: serial("id").primaryKey(),
  session_id: text("session_id").notNull().unique(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  last_active_at: timestamp("last_active_at").defaultNow().notNull(),
  video_count: integer("video_count").default(0).notNull(),
  // Metadata for tracking and additional info
  metadata: jsonb("metadata"),
  // Optional tracking data
  user_agent: text("user_agent"),
  ip_address: text("ip_address"),
});

// Table for storing text chunks and their vector embeddings
export const embeddings = pgTable("embeddings", {
  id: serial("id").primaryKey(),
  video_id: integer("video_id").references(() => videos.id).notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  content_type: contentTypeEnum("content_type").notNull(),
  chunk_index: integer("chunk_index").notNull(), // Position in the original content
  content: text("content").notNull(), // The actual text chunk
  embedding: jsonb("embedding").notNull(), // Store embeddings as JSON arrays
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
  password_hash: text("password_hash"),
  password_salt: text("password_salt"),
  status: userStatusEnum("status").default("active"),
  email_verified: boolean("email_verified").default(false),
  display_name: text("display_name"),
  last_login: timestamp("last_login"),
  updated_at: timestamp("updated_at").defaultNow(),
  user_type: userTypeEnum("user_type").default("registered").notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  is_global: boolean("is_global").default(false).notNull(),
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
  // Track if this is associated with an anonymous session
  anonymous_session_id: text("anonymous_session_id").references(() => anonymous_sessions.session_id),
  user_type: userTypeEnum("user_type").default("registered"),
  notes: text("notes"),
  category_id: integer("category_id").references(() => categories.id),
  rating: integer("rating"),
  is_favorite: boolean("is_favorite").default(false),
  timestamps: text("timestamps").array(), // For adding custom timestamps/highlights
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
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

// Export preferences for users
export const export_preferences = pgTable("export_preferences", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  default_format: exportFormatEnum("default_format").notNull().default("txt"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Authentication tokens (refresh, password reset, etc.)
export const auth_tokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  type: tokenTypeEnum("type").notNull(),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  revoked: boolean("revoked").default(false).notNull(),
  revoked_at: timestamp("revoked_at"),
});

// User sessions table
export const auth_sessions = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  session_id: varchar("session_id", { length: 128 }).notNull().unique(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  last_active_at: timestamp("last_active_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  created_at: true,
  updated_at: true,
  last_login: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  created_at: true,
  updated_at: true,
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

export const insertExportPreferencesSchema = createInsertSchema(export_preferences).omit({
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
  page: z.number().optional().default(1),
  limit: z.number().optional().default(20),
  cursor: z.number().optional(), // For cursor-based pagination
});

// Export formats enum is defined at the top of the file

// Export request schema
export const exportRequestSchema = z.object({
  content_type: z.enum(['transcript', 'summary', 'qa', 'conversation']),
  format: z.enum(['txt', 'csv', 'json']),
  video_ids: z.array(z.number()),
  qa_conversation_id: z.number().optional(),
  userId: z.number().optional(), // Adding userId for internal use
});

// Export preferences schema
export const exportPreferencesSchema = z.object({
  default_format: z.enum(['txt', 'csv', 'json']).default('txt'),
  user_id: z.number(),
});

// Citation schema
export const citationSchema = z.object({
  video_id: z.number(),
  video_title: z.string(),
  content: z.string(),
  content_type: z.enum(['transcript', 'summary', 'note', 'conversation']),
  timestamp: z.string().optional(),
  chunk_index: z.number().optional(),
});

// Q&A Message schema
export const qaMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.date().optional(),
  citations: z.array(citationSchema).optional(),
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
    content_types: z.array(z.enum(['transcript', 'summary', 'note', 'conversation'])).optional(),
    video_id: z.number().optional(),
    category_id: z.number().optional(),
    collection_id: z.number().optional(),
    is_favorite: z.boolean().optional(),
    // For internal use - this is set by the backend based on headers, not by client
    anonymous_session_id: z.string().optional(),
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

export const insertAnonymousSessionSchema = createInsertSchema(anonymous_sessions).omit({
  id: true,
  created_at: true,
  updated_at: true,
  last_active_at: true,
  video_count: true,
});

export const insertAuthTokenSchema = createInsertSchema(auth_tokens).omit({
  id: true,
  created_at: true,
  updated_at: true,
  revoked: true,
  revoked_at: true,
});

export const insertAuthSessionSchema = createInsertSchema(auth_sessions).omit({
  id: true,
  created_at: true,
  last_active_at: true,
});

// Authentication schemas
export const registerUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  display_name: z.string().min(1).max(100).optional(),
});

export const loginUserSchema = z.object({
  username: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string(),
  remember_me: z.boolean().optional().default(false),
}).refine(data => data.username || data.email, {
  message: "Either username or email must be provided",
  path: ["username"]
});

export const resetPasswordRequestSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(100),
});

export const changePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(8).max(100),
});

export const verifyEmailSchema = z.object({
  token: z.string(),
});

export const migrateAnonymousDataSchema = z.object({
  anonymousSessionId: z.string().startsWith('anon_', { message: 'Session ID must start with anon_' }),
  // Optional fields that might be used in the future
  options: z.object({
    deleteAfterMigration: z.boolean().optional(),
  }).optional(),
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
export type InsertAnonymousSession = z.infer<typeof insertAnonymousSessionSchema>;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CollectionVideo = typeof collection_videos.$inferSelect;
export type SavedSearch = typeof saved_searches.$inferSelect;
export type QAConversation = typeof qa_conversations.$inferSelect;
export type Embedding = typeof embeddings.$inferSelect;
export type SearchHistory = typeof search_history.$inferSelect;
export type AnonymousSession = typeof anonymous_sessions.$inferSelect;
export type InsertQAConversation = z.infer<typeof insertQAConversationSchema>;
export type InsertExportPreferences = z.infer<typeof insertExportPreferencesSchema>;
export type QAMessage = z.infer<typeof qaMessageSchema>;
export type QAQuestion = z.infer<typeof qaQuestionSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type YoutubeUrlRequest = z.infer<typeof youtubeUrlSchema>;
export type VideoMetadataRequest = z.infer<typeof videoMetadataSchema>;
export type SearchParams = z.infer<typeof searchParamsSchema>;
export type SemanticSearchParams = z.infer<typeof semanticSearchSchema>;
export type ExportPreferences = typeof export_preferences.$inferSelect;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

// Auth types
export type AuthToken = typeof auth_tokens.$inferSelect;
export type AuthSession = typeof auth_sessions.$inferSelect;
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;
export type RegisterUserRequest = z.infer<typeof registerUserSchema>;
export type LoginUserRequest = z.infer<typeof loginUserSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordData = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailSchema>;
