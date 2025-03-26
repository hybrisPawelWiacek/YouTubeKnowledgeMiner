import { eq, and, or, like, ilike, sql, desc, asc, inArray, lt, gt } from 'drizzle-orm';
import { 
  User, InsertUser, Category, InsertCategory, Video, InsertVideo,
  Collection, InsertCollection, CollectionVideo, InsertCollectionVideo,
  SavedSearch, InsertSavedSearch, SearchParams, QAConversation, InsertQAConversation,
  ExportPreferences, InsertExportPreferences, AnonymousSession, InsertAnonymousSession,
  users, categories, videos, collections, collection_videos, saved_searches, qa_conversations,
  export_preferences, anonymous_sessions
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

  // Get categories (global and user-specific)
  async getCategories(userId: number | null): Promise<Category[]> {
    if (userId) {
      // For authenticated users, get both global and user-specific categories
      return db.select().from(categories).where(
        or(
          eq(categories.is_global, true),
          eq(categories.user_id, userId)
        )
      );
    } else {
      // For anonymous users, only get global categories
      return db.select().from(categories).where(eq(categories.is_global, true));
    }
  }

  // Legacy method for backward compatibility
  async getCategoriesByUserId(userId: number): Promise<Category[]> {
    return this.getCategories(userId);
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

  async searchVideos(userId: number, params: SearchParams): Promise<{ videos: Video[], totalCount: number, hasMore: boolean, nextCursor?: number }> {
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
        return { videos: [], totalCount: 0, hasMore: false };
      }
    }

    // Add sorting
    let sortOrder = params.sort_order === 'desc' ? desc : asc;
    let sortColumn;

    switch (params.sort_by) {
      case 'title':
        sortColumn = videos.title;
        query = query.orderBy(sortOrder(videos.title));
        break;
      case 'rating':
        sortColumn = videos.rating;
        query = query.orderBy(sortOrder(videos.rating));
        break;
      case 'date':
      default:
        sortColumn = videos.created_at;
        query = query.orderBy(sortOrder(videos.created_at));
        break;
    }

    // Get total count of matching records (without pagination)
    const countQuery = query.toSQL();
    const totalCountResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM (${sql.raw(countQuery.sql)}) as count_query
    `, countQuery.params);

    const totalCount = parseInt(totalCountResult.rows[0].count, 10);

    // Cursor-based pagination
    if (params.cursor !== undefined) {
      // Add cursor condition based on the sort column and sort order
      const cursorOp = params.sort_order === 'desc' ? lt : gt;

      // We need to get the cursor row to compare against
      const cursorRow = await db.select().from(videos).where(eq(videos.id, params.cursor)).limit(1);

      if (cursorRow.length > 0) {
        const cursorValue = cursorRow[0][sortColumn.name];
        if (cursorValue !== undefined) {
          query = query.where(cursorOp(sortColumn, cursorValue));
        }
      }
    } else {
      // Offset-based pagination as a fallback
      const page = params.page || 1;
      const offset = (page - 1) * (params.limit || 20);
      query = query.offset(offset);
    }

    // Apply limit
    const limit = params.limit || 20;
    query = query.limit(limit + 1); // Get one extra to determine if there are more pages

    // Execute the query
    const results = await query;

    // Check if there are more results beyond the requested limit
    const hasMore = results.length > limit;
    const videos = hasMore ? results.slice(0, limit) : results;

    // Determine next cursor (last item's ID if there are more results)
    const nextCursor = hasMore && videos.length > 0 ? videos[videos.length - 1].id : undefined;

    return {
      videos,
      totalCount,
      hasMore,
      nextCursor
    };
  }

  async insertVideo(video: InsertVideo): Promise<Video> {
    console.log('✯✯✯ DATABASE STORAGE - INSERT VIDEO ✯✯✯');
    console.log('Video data being inserted:', JSON.stringify(video, null, 2));
    console.log('User ID in insert request:', video.user_id, '(type:', typeof video.user_id, ')');
    
    // Ensure the user_id is a number
    if (typeof video.user_id === 'string') {
      console.log('Converting user_id from string to number');
      video.user_id = parseInt(video.user_id, 10);
      console.log('Converted user_id:', video.user_id);
    }
    
    try {
      const result = await db.insert(videos).values(video).returning();
      console.log('Inserted video result:', JSON.stringify(result[0], null, 2));
      return result[0];
    } catch (error) {
      console.error('❌ Error inserting video:', error);
      throw error;
    }
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

  // Q&A Conversation methods
  async getQAConversation(id: number): Promise<QAConversation | undefined> {
    const result = await db
      .select()
      .from(qa_conversations)
      .where(eq(qa_conversations.id, id));

    return result[0];
  }

  async getQAConversationsByVideoId(videoId: number): Promise<QAConversation[]> {
    return await db
      .select()
      .from(qa_conversations)
      .where(eq(qa_conversations.video_id, videoId));
  }

  async getQAConversationsByUserId(userId: number): Promise<QAConversation[]> {
    return await db
      .select()
      .from(qa_conversations)
      .where(eq(qa_conversations.user_id, userId));
  }

  async createQAConversation(conversation: InsertQAConversation): Promise<QAConversation> {
    const result = await db
      .insert(qa_conversations)
      .values(conversation)
      .returning();

    return result[0];
  }

  async updateQAConversation(id: number, messages: any[]): Promise<QAConversation | undefined> {
    const result = await db
      .update(qa_conversations)
      .set({ 
        messages,
        updated_at: new Date() 
      })
      .where(eq(qa_conversations.id, id))
      .returning();

    return result[0];
  }

  async deleteQAConversation(id: number): Promise<boolean> {
    const result = await db
      .delete(qa_conversations)
      .where(eq(qa_conversations.id, id))
      .returning();

    return result.length > 0;
  }

  // Export preferences methods
  async getExportPreferencesByUserId(userId: number): Promise<ExportPreferences | undefined> {
    const result = await db
      .select()
      .from(export_preferences)
      .where(eq(export_preferences.user_id, userId));

    return result[0];
  }

  async createExportPreferences(preferences: InsertExportPreferences): Promise<ExportPreferences> {
    const result = await db
      .insert(export_preferences)
      .values(preferences)
      .returning();

    return result[0];
  }

  async updateExportPreferences(id: number, data: Partial<ExportPreferences>): Promise<ExportPreferences | undefined> {
    const result = await db
      .update(export_preferences)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(export_preferences.id, id))
      .returning();

    return result[0];
  }
  
  // Anonymous session methods
  async getAnonymousSessionBySessionId(sessionId: string): Promise<AnonymousSession | undefined> {
    const result = await db
      .select()
      .from(anonymous_sessions)
      .where(eq(anonymous_sessions.session_id, sessionId));
    
    return result[0];
  }
  
  async createAnonymousSession(session: InsertAnonymousSession): Promise<AnonymousSession> {
    const now = new Date();
    
    const result = await db
      .insert(anonymous_sessions)
      .values({
        ...session,
        created_at: now,
        last_active_at: now,
        video_count: 0
      })
      .returning();
    
    return result[0];
  }
  
  async updateAnonymousSession(sessionId: string, data: Partial<AnonymousSession>): Promise<AnonymousSession | undefined> {
    const result = await db
      .update(anonymous_sessions)
      .set(data)
      .where(eq(anonymous_sessions.session_id, sessionId))
      .returning();
    
    return result[0];
  }
  
  async updateAnonymousSessionLastActive(sessionId: string): Promise<void> {
    await db
      .update(anonymous_sessions)
      .set({
        last_active_at: new Date()
      })
      .where(eq(anonymous_sessions.session_id, sessionId));
  }
  
  async incrementAnonymousSessionVideoCount(sessionId: string): Promise<number> {
    // First get the current count
    const session = await this.getAnonymousSessionBySessionId(sessionId);
    
    if (!session) {
      throw new Error(`Anonymous session not found: ${sessionId}`);
    }
    
    // Increment the count
    const newCount = (session.video_count || 0) + 1;
    
    // Update the session
    await db
      .update(anonymous_sessions)
      .set({
        video_count: newCount,
        last_active_at: new Date()
      })
      .where(eq(anonymous_sessions.session_id, sessionId));
    
    return newCount;
  }
  
  /**
   * Get all videos associated with an anonymous session
   * Used for migrating videos when a user registers after using the app anonymously
   * @param sessionId The anonymous session ID
   * @returns Array of videos associated with the session
   */
  async getVideosByAnonymousSessionId(sessionId: string): Promise<Video[]> {
    try {
      const result = await db
        .select()
        .from(videos)
        .where(eq(videos.anonymous_session_id, sessionId));
      
      return result;
    } catch (error) {
      console.error('Error fetching videos by anonymous session ID:', error);
      return [];
    }
  }
  
  async deleteInactiveAnonymousSessions(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const result = await db
      .delete(anonymous_sessions)
      .where(lt(anonymous_sessions.last_active_at, cutoffDate))
      .returning();
    
    return result.length;
  }
}

// Export an instance of the DatabaseStorage
export const dbStorage = new DatabaseStorage();