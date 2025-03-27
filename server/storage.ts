import { 
  type User, type InsertUser, type InsertCategory, type Category, 
  type Video, type InsertVideo, type Collection, type InsertCollection,
  type CollectionVideo, type InsertCollectionVideo, type SavedSearch,
  type InsertSavedSearch, type SearchParams, type QAConversation, type InsertQAConversation,
  type QAMessage, type QAQuestion, type ExportPreferences, type InsertExportPreferences,
  type AnonymousSession, type InsertAnonymousSession
} from "@shared/schema";
import { dbStorage } from './database-storage';

/**
 * Storage interface defining all operations for persistence layer
 * This interface is implemented by the DatabaseStorage class
 */
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Category methods
  getCategory(id: number): Promise<Category | undefined>;
  getCategoriesByUserId(userId: number): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, data: Partial<Category>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<boolean>;
  
  // Video methods
  getVideo(id: number): Promise<Video | undefined>;
  getVideosByUserId(userId: number | null): Promise<Video[]>;
  searchVideos(
    userIdentifier: { userId?: number; anonymousSessionId?: string },
    params: SearchParams
  ): Promise<{ videos: Video[], totalCount: number, hasMore: boolean, nextCursor?: number }>;
  insertVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, data: Partial<Video>): Promise<Video | undefined>;
  deleteVideo(id: number): Promise<boolean>;
  bulkUpdateVideos(ids: number[], data: Partial<Video>): Promise<number>;
  bulkDeleteVideos(ids: number[]): Promise<number>;
  
  // Collection methods
  getCollection(id: number): Promise<Collection | undefined>;
  getCollectionsByUserId(userId: number): Promise<Collection[]>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(id: number, data: Partial<Collection>): Promise<Collection | undefined>;
  deleteCollection(id: number): Promise<boolean>;
  
  // Collection videos methods
  getCollectionVideos(collectionId: number): Promise<Video[]>;
  addVideoToCollection(collectionVideo: InsertCollectionVideo): Promise<void>;
  removeVideoFromCollection(collectionId: number, videoId: number): Promise<void>;
  bulkAddVideosToCollection(collectionId: number, videoIds: number[]): Promise<void>;
  
  // Saved searches methods
  getSavedSearch(id: number): Promise<SavedSearch | undefined>;
  getSavedSearchesByUserId(userId: number): Promise<SavedSearch[]>;
  createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch>;
  deleteSavedSearch(id: number): Promise<boolean>;
  
  // Q&A Conversations methods
  getQAConversation(id: number): Promise<QAConversation | undefined>;
  getQAConversationsByVideoId(videoId: number): Promise<QAConversation[]>;
  getQAConversationsByUserId(userId: number): Promise<QAConversation[]>;
  createQAConversation(conversation: InsertQAConversation): Promise<QAConversation>;
  updateQAConversation(id: number, messages: QAMessage[]): Promise<QAConversation | undefined>;
  deleteQAConversation(id: number): Promise<boolean>;
  
  // Export preferences methods
  getExportPreferencesByUserId(userId: number): Promise<ExportPreferences | undefined>;
  createExportPreferences(preferences: InsertExportPreferences): Promise<ExportPreferences>;
  updateExportPreferences(id: number, data: Partial<ExportPreferences>): Promise<ExportPreferences | undefined>;
  
  // Anonymous session methods
  getAnonymousSessionBySessionId(sessionId: string): Promise<AnonymousSession | undefined>;
  createAnonymousSession(session: InsertAnonymousSession): Promise<AnonymousSession>;
  updateAnonymousSession(sessionId: string, data: Partial<AnonymousSession>): Promise<AnonymousSession | undefined>;
  updateAnonymousSessionLastActive(sessionId: string): Promise<void>;
  incrementAnonymousSessionVideoCount(sessionId: string): Promise<number>;
  getVideosByAnonymousSessionId(sessionId: string): Promise<Video[]>;
  deleteInactiveAnonymousSessions(olderThanDays: number): Promise<number>;
}

// Export the database storage instance as the single source of truth
export const storage = dbStorage;
