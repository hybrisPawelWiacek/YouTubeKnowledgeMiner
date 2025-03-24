import { eq, and, or, like, ilike, sql, desc, asc, inArray } from 'drizzle-orm';
import { 
  User, InsertUser, Category, InsertCategory, Video, InsertVideo,
  Collection, InsertCollection, CollectionVideo, InsertCollectionVideo,
  SavedSearch, InsertSavedSearch, SearchParams, 
  users, categories, videos, collections, collection_videos, saved_searches
} from '@shared/schema';
import { db } from './db';
import { IStorage } from './storage';

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  // Category methods
  async getCategory(id: number): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.id, id));
    return result[0];
  }

  async getCategoriesByUserId(userId: number): Promise<Category[]> {
    return await db.select().from(categories).where(eq(categories.user_id, userId));
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const result = await db.insert(categories).values(category).returning();
    return result[0];
  }

  // Video methods
  async getVideo(id: number): Promise<Video | undefined> {
    const result = await db.select().from(videos).where(eq(videos.id, id));
    return result[0];
  }

  async getVideosByUserId(userId: number): Promise<Video[]> {
    return await db.select().from(videos).where(eq(videos.user_id, userId));
  }
  
  async searchVideos(userId: number, params: SearchParams): Promise<Video[]> {
    // Build query conditions
    let conditions = [eq(videos.user_id, userId)];
    
    // Add text search condition
    if (params.query) {
      conditions.push(
        or(
          ilike(videos.title, `%${params.query}%`),
          ilike(videos.description || '', `%${params.query}%`),
          ilike(videos.transcript || '', `%${params.query}%`)
        )
      );
    }
    
    // Add category filter
    if (params.category_id !== undefined) {
      conditions.push(eq(videos.category_id, params.category_id));
    }
    
    // Add rating filters
    if (params.rating_min !== undefined) {
      conditions.push(sql`${videos.rating} >= ${params.rating_min}`);
    }
    
    if (params.rating_max !== undefined) {
      conditions.push(sql`${videos.rating} <= ${params.rating_max}`);
    }
    
    // Add date range filters
    if (params.date_from) {
      conditions.push(sql`${videos.created_at} >= ${params.date_from}`);
    }
    
    if (params.date_to) {
      conditions.push(sql`${videos.created_at} <= ${params.date_to}`);
    }
    
    // Add favorite filter
    if (params.is_favorite !== undefined) {
      conditions.push(eq(videos.is_favorite, params.is_favorite));
    }
    
    // Start with basic query
    let query = db.select().from(videos).where(and(...conditions));
    
    // Add collection filter if specified (requires a join)
    if (params.collection_id !== undefined) {
      // First get all video IDs in the collection
      const collectionVideosResult = await db
        .select({ video_id: collection_videos.video_id })
        .from(collection_videos)
        .where(eq(collection_videos.collection_id, params.collection_id));
      
      const videoIds = collectionVideosResult.map(v => v.video_id);
      
      // Filter the results to only include these videos
      if (videoIds.length > 0) {
        query = query.where(inArray(videos.id, videoIds));
      } else {
        // If no videos in collection, return empty array
        return [];
      }
    }
    
    // Add sorting
    if (params.sort_by) {
      const sortOrder = params.sort_order === 'desc' ? desc : asc;
      
      switch (params.sort_by) {
        case 'title':
          query = query.orderBy(sortOrder(videos.title));
          break;
        case 'date':
          query = query.orderBy(sortOrder(videos.created_at));
          break;
        case 'rating':
          query = query.orderBy(sortOrder(videos.rating));
          break;
      }
    }
    
    // Execute the query
    return await query;
  }

  async insertVideo(video: InsertVideo): Promise<Video> {
    const result = await db.insert(videos).values(video).returning();
    return result[0];
  }

  async updateVideo(id: number, data: Partial<Video>): Promise<Video | undefined> {
    const result = await db
      .update(videos)
      .set(data)
      .where(eq(videos.id, id))
      .returning();
    return result[0];
  }
  
  async deleteVideo(id: number): Promise<boolean> {
    // First, delete related collection associations
    await db
      .delete(collection_videos)
      .where(eq(collection_videos.video_id, id));
    
    // Then delete the video
    const result = await db
      .delete(videos)
      .where(eq(videos.id, id))
      .returning();
    
    return result.length > 0;
  }
  
  async bulkUpdateVideos(ids: number[], data: Partial<Video>): Promise<number> {
    const result = await db
      .update(videos)
      .set(data)
      .where(inArray(videos.id, ids))
      .returning();
    
    return result.length;
  }
  
  // Collection methods
  async getCollection(id: number): Promise<Collection | undefined> {
    const result = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id));
    
    return result[0];
  }
  
  async getCollectionsByUserId(userId: number): Promise<Collection[]> {
    return await db
      .select()
      .from(collections)
      .where(eq(collections.user_id, userId));
  }
  
  async createCollection(collection: InsertCollection): Promise<Collection> {
    const result = await db
      .insert(collections)
      .values(collection)
      .returning();
    
    return result[0];
  }
  
  async updateCollection(id: number, data: Partial<Collection>): Promise<Collection | undefined> {
    const result = await db
      .update(collections)
      .set(data)
      .where(eq(collections.id, id))
      .returning();
    
    return result[0];
  }
  
  async deleteCollection(id: number): Promise<boolean> {
    // First, delete all video-collection relationships
    await db
      .delete(collection_videos)
      .where(eq(collection_videos.collection_id, id));
    
    // Then, delete the collection
    const result = await db
      .delete(collections)
      .where(eq(collections.id, id))
      .returning();
    
    return result.length > 0;
  }
  
  // Collection videos methods
  async getCollectionVideos(collectionId: number): Promise<Video[]> {
    // Get all video IDs in the collection
    const videoIds = await db
      .select({ video_id: collection_videos.video_id })
      .from(collection_videos)
      .where(eq(collection_videos.collection_id, collectionId));
    
    // If no videos, return empty array
    if (videoIds.length === 0) {
      return [];
    }
    
    // Get the videos
    return await db
      .select()
      .from(videos)
      .where(inArray(videos.id, videoIds.map(v => v.video_id)));
  }
  
  async addVideoToCollection(collectionVideo: InsertCollectionVideo): Promise<void> {
    await db
      .insert(collection_videos)
      .values(collectionVideo)
      .onConflictDoNothing();
  }
  
  async removeVideoFromCollection(collectionId: number, videoId: number): Promise<void> {
    await db
      .delete(collection_videos)
      .where(
        and(
          eq(collection_videos.collection_id, collectionId),
          eq(collection_videos.video_id, videoId)
        )
      );
  }
  
  async bulkAddVideosToCollection(collectionId: number, videoIds: number[]): Promise<void> {
    if (videoIds.length === 0) return;
    
    const values = videoIds.map(videoId => ({
      collection_id: collectionId,
      video_id: videoId
    }));
    
    await db
      .insert(collection_videos)
      .values(values)
      .onConflictDoNothing();
  }
  
  // Saved searches methods
  async getSavedSearch(id: number): Promise<SavedSearch | undefined> {
    const result = await db
      .select()
      .from(saved_searches)
      .where(eq(saved_searches.id, id));
    
    return result[0];
  }
  
  async getSavedSearchesByUserId(userId: number): Promise<SavedSearch[]> {
    return await db
      .select()
      .from(saved_searches)
      .where(eq(saved_searches.user_id, userId));
  }
  
  async createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch> {
    const result = await db
      .insert(saved_searches)
      .values(search)
      .returning();
    
    return result[0];
  }
  
  async deleteSavedSearch(id: number): Promise<boolean> {
    const result = await db
      .delete(saved_searches)
      .where(eq(saved_searches.id, id))
      .returning();
    
    return result.length > 0;
  }
}

// Export an instance of the DatabaseStorage
export const dbStorage = new DatabaseStorage();