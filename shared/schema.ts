import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  user_id: integer("user_id").references(() => users.id).notNull(),
  notes: text("notes"),
  category_id: integer("category_id").references(() => categories.id),
  rating: integer("rating"),
  created_at: timestamp("created_at").defaultNow().notNull(),
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
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type YoutubeUrlRequest = z.infer<typeof youtubeUrlSchema>;
export type VideoMetadataRequest = z.infer<typeof videoMetadataSchema>;
