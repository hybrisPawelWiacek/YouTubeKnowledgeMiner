import { 
  users, categories, videos, collections, collection_videos, saved_searches, qa_conversations, export_preferences,
  type User, type InsertUser, type InsertCategory, type Category, 
  type Video, type InsertVideo, type Collection, type InsertCollection,
  type CollectionVideo, type InsertCollectionVideo, type SavedSearch,
  type InsertSavedSearch, type SearchParams, type QAConversation, type InsertQAConversation,
  type QAMessage, type QAQuestion, type ExportPreferences, type InsertExportPreferences
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Category methods
  getCategory(id: number): Promise<Category | undefined>;
  getCategoriesByUserId(userId: number): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  
  // Video methods
  getVideo(id: number): Promise<Video | undefined>;
  getVideosByUserId(userId: number): Promise<Video[]>;
  searchVideos(userId: number, params: SearchParams): Promise<Video[]>;
  insertVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, data: Partial<Video>): Promise<Video | undefined>;
  deleteVideo(id: number): Promise<boolean>;
  bulkUpdateVideos(ids: number[], data: Partial<Video>): Promise<number>;
  
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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private categories: Map<number, Category>;
  private videos: Map<number, Video>;
  private collections: Map<number, Collection>;
  private collectionVideos: Map<string, CollectionVideo>;
  private savedSearches: Map<number, SavedSearch>;
  private qaConversations: Map<number, QAConversation>;
  private exportPreferences: Map<number, ExportPreferences>;
  private userIdCounter: number;
  private categoryIdCounter: number;
  private videoIdCounter: number;
  private collectionIdCounter: number;
  private savedSearchIdCounter: number;
  private qaConversationIdCounter: number;
  private exportPreferencesIdCounter: number;

  constructor() {
    this.users = new Map();
    this.categories = new Map();
    this.videos = new Map();
    this.collections = new Map();
    this.collectionVideos = new Map();
    this.savedSearches = new Map();
    this.qaConversations = new Map();
    this.exportPreferences = new Map();
    this.userIdCounter = 1;
    this.categoryIdCounter = 1;
    this.videoIdCounter = 1;
    this.collectionIdCounter = 1;
    this.savedSearchIdCounter = 1;
    this.qaConversationIdCounter = 1;
    this.exportPreferencesIdCounter = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { ...insertUser, id, created_at: now };
    this.users.set(id, user);
    return user;
  }

  // Category methods
  async getCategory(id: number): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async getCategoriesByUserId(userId: number): Promise<Category[]> {
    return Array.from(this.categories.values()).filter(
      (category) => category.user_id === userId
    );
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = this.categoryIdCounter++;
    const category: Category = { ...insertCategory, id };
    this.categories.set(id, category);
    return category;
  }

  // Video methods
  async getVideo(id: number): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async getVideosByUserId(userId: number): Promise<Video[]> {
    return Array.from(this.videos.values()).filter(
      (video) => video.user_id === userId
    );
  }
  
  async searchVideos(userId: number, params: SearchParams): Promise<Video[]> {
    let results = await this.getVideosByUserId(userId);
    
    // Filter by query (search in title, description, transcript)
    if (params.query) {
      const query = params.query.toLowerCase();
      results = results.filter(video => {
        return (
          (video.title && video.title.toLowerCase().includes(query)) ||
          (video.description && video.description.toLowerCase().includes(query)) ||
          (video.transcript && video.transcript.toLowerCase().includes(query))
        );
      });
    }
    
    // Filter by category
    if (params.category_id !== undefined) {
      results = results.filter(video => video.category_id === params.category_id);
    }
    
    // Filter by collection
    if (params.collection_id !== undefined) {
      const collectionVideos = Array.from(this.collectionVideos.values())
        .filter(cv => cv.collection_id === params.collection_id)
        .map(cv => cv.video_id);
      
      results = results.filter(video => collectionVideos.includes(video.id));
    }
    
    // Filter by rating
    if (params.rating_min !== undefined) {
      results = results.filter(video => 
        video.rating !== undefined && 
        video.rating >= params.rating_min!
      );
    }
    
    if (params.rating_max !== undefined) {
      results = results.filter(video => 
        video.rating !== undefined && 
        video.rating <= params.rating_max!
      );
    }
    
    // Filter by date
    if (params.date_from) {
      const fromDate = new Date(params.date_from);
      results = results.filter(video => 
        video.created_at && 
        new Date(video.created_at) >= fromDate
      );
    }
    
    if (params.date_to) {
      const toDate = new Date(params.date_to);
      results = results.filter(video => 
        video.created_at && 
        new Date(video.created_at) <= toDate
      );
    }
    
    // Filter by favorite status
    if (params.is_favorite !== undefined) {
      results = results.filter(video => 
        video.is_favorite === params.is_favorite
      );
    }
    
    // Sort results
    if (params.sort_by) {
      const sortOrder = params.sort_order === 'desc' ? -1 : 1;
      
      switch (params.sort_by) {
        case 'title':
          results.sort((a, b) => sortOrder * a.title.localeCompare(b.title));
          break;
        case 'date':
          results.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return sortOrder * (dateA - dateB);
          });
          break;
        case 'rating':
          results.sort((a, b) => {
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;
            return sortOrder * (ratingA - ratingB);
          });
          break;
      }
    }
    
    return results;
  }

  async insertVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = this.videoIdCounter++;
    const now = new Date();
    const video: Video = { ...insertVideo, id, created_at: now };
    this.videos.set(id, video);
    return video;
  }

  async updateVideo(id: number, data: Partial<Video>): Promise<Video | undefined> {
    const video = this.videos.get(id);
    if (!video) return undefined;
    
    const updatedVideo: Video = { ...video, ...data };
    this.videos.set(id, updatedVideo);
    return updatedVideo;
  }
  
  async deleteVideo(id: number): Promise<boolean> {
    const video = this.videos.get(id);
    if (!video) return false;
    
    // Remove the video from all collections
    Array.from(this.collectionVideos.entries())
      .filter(([_, cv]) => cv.video_id === id)
      .forEach(([key, _]) => this.collectionVideos.delete(key));
    
    // Delete the video
    return this.videos.delete(id);
  }
  
  async bulkUpdateVideos(ids: number[], data: Partial<Video>): Promise<number> {
    let updatedCount = 0;
    
    for (const id of ids) {
      const video = this.videos.get(id);
      if (video) {
        const updatedVideo: Video = { ...video, ...data };
        this.videos.set(id, updatedVideo);
        updatedCount++;
      }
    }
    
    return updatedCount;
  }
  
  // Collection methods
  async getCollection(id: number): Promise<Collection | undefined> {
    return this.collections.get(id);
  }
  
  async getCollectionsByUserId(userId: number): Promise<Collection[]> {
    return Array.from(this.collections.values()).filter(
      collection => collection.user_id === userId
    );
  }
  
  async createCollection(insertCollection: InsertCollection): Promise<Collection> {
    const id = this.collectionIdCounter++;
    const now = new Date();
    const collection: Collection = { ...insertCollection, id, created_at: now };
    this.collections.set(id, collection);
    return collection;
  }
  
  async updateCollection(id: number, data: Partial<Collection>): Promise<Collection | undefined> {
    const collection = this.collections.get(id);
    if (!collection) return undefined;
    
    const updatedCollection: Collection = { ...collection, ...data };
    this.collections.set(id, updatedCollection);
    return updatedCollection;
  }
  
  async deleteCollection(id: number): Promise<boolean> {
    const collection = this.collections.get(id);
    if (!collection) return false;
    
    // Remove all videos from this collection
    Array.from(this.collectionVideos.entries())
      .filter(([_, cv]) => cv.collection_id === id)
      .forEach(([key, _]) => this.collectionVideos.delete(key));
    
    // Delete the collection
    return this.collections.delete(id);
  }
  
  // Collection videos methods
  async getCollectionVideos(collectionId: number): Promise<Video[]> {
    const videoIds = Array.from(this.collectionVideos.values())
      .filter(cv => cv.collection_id === collectionId)
      .map(cv => cv.video_id);
    
    return Array.from(this.videos.values())
      .filter(video => videoIds.includes(video.id));
  }
  
  async addVideoToCollection(collectionVideo: InsertCollectionVideo): Promise<void> {
    const key = `${collectionVideo.collection_id}-${collectionVideo.video_id}`;
    const now = new Date();
    this.collectionVideos.set(key, { ...collectionVideo, added_at: now });
  }
  
  async removeVideoFromCollection(collectionId: number, videoId: number): Promise<void> {
    const key = `${collectionId}-${videoId}`;
    this.collectionVideos.delete(key);
  }
  
  async bulkAddVideosToCollection(collectionId: number, videoIds: number[]): Promise<void> {
    const now = new Date();
    
    for (const videoId of videoIds) {
      const key = `${collectionId}-${videoId}`;
      this.collectionVideos.set(key, {
        collection_id: collectionId,
        video_id: videoId,
        added_at: now
      });
    }
  }
  
  // Saved searches methods
  async getSavedSearch(id: number): Promise<SavedSearch | undefined> {
    return this.savedSearches.get(id);
  }
  
  async getSavedSearchesByUserId(userId: number): Promise<SavedSearch[]> {
    return Array.from(this.savedSearches.values()).filter(
      search => search.user_id === userId
    );
  }
  
  async createSavedSearch(insertSearch: InsertSavedSearch): Promise<SavedSearch> {
    const id = this.savedSearchIdCounter++;
    const now = new Date();
    const savedSearch: SavedSearch = { ...insertSearch, id, created_at: now };
    this.savedSearches.set(id, savedSearch);
    return savedSearch;
  }
  
  async deleteSavedSearch(id: number): Promise<boolean> {
    return this.savedSearches.delete(id);
  }
  
  // Q&A Conversations methods
  async getQAConversation(id: number): Promise<QAConversation | undefined> {
    return this.qaConversations.get(id);
  }
  
  async getQAConversationsByVideoId(videoId: number): Promise<QAConversation[]> {
    return Array.from(this.qaConversations.values()).filter(
      conversation => conversation.video_id === videoId
    );
  }
  
  async getQAConversationsByUserId(userId: number): Promise<QAConversation[]> {
    return Array.from(this.qaConversations.values()).filter(
      conversation => conversation.user_id === userId
    );
  }
  
  async createQAConversation(insertConversation: InsertQAConversation): Promise<QAConversation> {
    const id = this.qaConversationIdCounter++;
    const now = new Date();
    const conversation: QAConversation = { 
      ...insertConversation, 
      id, 
      created_at: now,
      updated_at: now
    };
    this.qaConversations.set(id, conversation);
    return conversation;
  }
  
  async updateQAConversation(id: number, messages: QAMessage[]): Promise<QAConversation | undefined> {
    const conversation = this.qaConversations.get(id);
    if (!conversation) return undefined;
    
    const updatedConversation: QAConversation = {
      ...conversation,
      messages: messages as any, // Type casting as jsonb is complex in TypeScript
      updated_at: new Date()
    };
    
    this.qaConversations.set(id, updatedConversation);
    return updatedConversation;
  }
  
  async deleteQAConversation(id: number): Promise<boolean> {
    return this.qaConversations.delete(id);
  }
  
  // Export preferences methods
  async getExportPreferencesByUserId(userId: number): Promise<ExportPreferences | undefined> {
    return Array.from(this.exportPreferences.values()).find(
      prefs => prefs.user_id === userId
    );
  }
  
  async createExportPreferences(insertPreferences: InsertExportPreferences): Promise<ExportPreferences> {
    const id = this.exportPreferencesIdCounter++;
    const now = new Date();
    const preferences: ExportPreferences = {
      ...insertPreferences,
      id,
      created_at: now,
      updated_at: now
    };
    this.exportPreferences.set(id, preferences);
    return preferences;
  }
  
  async updateExportPreferences(id: number, data: Partial<ExportPreferences>): Promise<ExportPreferences | undefined> {
    const preferences = this.exportPreferences.get(id);
    if (!preferences) return undefined;
    
    const updatedPreferences: ExportPreferences = {
      ...preferences,
      ...data,
      updated_at: new Date()
    };
    
    this.exportPreferences.set(id, updatedPreferences);
    return updatedPreferences;
  }
}

export const storage = new MemStorage();
