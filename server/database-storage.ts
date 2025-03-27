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
  
  async updateCategory(id: number, data: Partial<Category>): Promise<Category | undefined> {
    const result = await db
      .update(categories)
      .set(data)
      .where(eq(categories.id, id))
      .returning();
    return result[0];
  }
  
  async deleteCategory(id: number): Promise<boolean> {
    const result = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning();
    return result.length > 0;
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
    try {
      console.log('[DB] Search videos for user ID:', userId);
      
      // For simplicity in debugging, let's first try to get all videos for this user
      // This will help us identify if the issue is with queries or if there are actually no videos
      const allUserVideos = await this.getVideosByUserId(userId);
      console.log(`[DB] User ${userId} has ${allUserVideos.length} videos total`);
      
      if (allUserVideos.length === 0) {
        // No videos for this user at all
        return { videos: [], totalCount: 0, hasMore: false };
      }

      // Manual filtering for demonstration purposes
      let filteredVideos = [...allUserVideos];
      
      // Simple text search
      if (params.query) {
        const query = params.query.toLowerCase();
        filteredVideos = filteredVideos.filter(v => 
          (v.title?.toLowerCase().includes(query)) || 
          (v.description?.toLowerCase().includes(query)) ||
          (v.transcript?.toLowerCase().includes(query))
        );
      }
      
      // Category filter
      if (params.category_id !== undefined) {
        filteredVideos = filteredVideos.filter(v => v.category_id === params.category_id);
      }
      
      // Favorite filter
      if (params.is_favorite !== undefined) {
        filteredVideos = filteredVideos.filter(v => v.is_favorite === params.is_favorite);
      }
      
      // Rating filters
      if (params.rating_min !== undefined) {
        filteredVideos = filteredVideos.filter(v => (v.rating || 0) >= (params.rating_min || 0));
      }
      if (params.rating_max !== undefined) {
        filteredVideos = filteredVideos.filter(v => (v.rating || 5) <= (params.rating_max || 5));
      }
      
      // Collection filter
      if (params.collection_id !== undefined) {
        // Get videos in this collection
        const collectionVideos = await this.getCollectionVideos(params.collection_id);
        const collectionVideoIds = new Set(collectionVideos.map(v => v.id));
        filteredVideos = filteredVideos.filter(v => collectionVideoIds.has(v.id));
      }
      
      // Sort results
      const sortBy = params.sort_by || 'date';
      const sortOrder = params.sort_order || 'desc';
      
      filteredVideos.sort((a, b) => {
        switch (sortBy) {
          case 'title':
            return sortOrder === 'desc' 
              ? b.title.localeCompare(a.title)
              : a.title.localeCompare(b.title);
          case 'rating':
            return sortOrder === 'desc'
              ? (b.rating || 0) - (a.rating || 0)
              : (a.rating || 0) - (b.rating || 0);
          case 'date':
          default:
            const dateA = a.created_at instanceof Date ? a.created_at : new Date(a.created_at);
            const dateB = b.created_at instanceof Date ? b.created_at : new Date(b.created_at);
            return sortOrder === 'desc'
              ? dateB.getTime() - dateA.getTime()
              : dateA.getTime() - dateB.getTime();
        }
      });
      
      // Calculate total count before pagination
      const totalCount = filteredVideos.length;
      
      // Apply pagination
      const page = params.page || 1;
      const limit = params.limit || 20;
      const startIndex = (page - 1) * limit;
      const paginatedVideos = filteredVideos.slice(startIndex, startIndex + limit + 1);
      
      // Check if there are more results beyond the requested limit
      const hasMore = paginatedVideos.length > limit;
      const finalVideos = hasMore ? paginatedVideos.slice(0, limit) : paginatedVideos;
      
      // Determine next cursor if using cursor-based pagination
      const nextCursor = hasMore && finalVideos.length > 0 ? finalVideos[finalVideos.length - 1].id : undefined;

      console.log(`[DB] Returning ${finalVideos.length} filtered videos of ${totalCount} total`);
      
      return {
        videos: finalVideos,
        totalCount,
        hasMore,
        nextCursor
      };
    } catch (error) {
      console.error('[DB] Error in searchVideos:', error);
      throw error;
    }
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
  
  async bulkDeleteVideos(ids: number[]): Promise<number> {
    // Try-catch to handle and log any deletion errors
    try {
      // First, delete related QA conversations
      console.log(`Deleting QA conversations for video IDs: ${ids.join(', ')}`);
      const deletedQaResult = await db
        .delete(qa_conversations)
        .where(inArray(qa_conversations.video_id, ids))
        .returning();
      console.log(`Deleted ${deletedQaResult.length} QA conversations`);
      
      // Second, delete related collection associations
      console.log(`Deleting collection associations for video IDs: ${ids.join(', ')}`);
      const deletedCollectionAssocs = await db
        .delete(collection_videos)
        .where(inArray(collection_videos.video_id, ids))
        .returning();
      console.log(`Deleted ${deletedCollectionAssocs.length} collection associations`);
      
      // Third, delete related embeddings (this is needed for authenticated users)
      console.log(`Deleting embeddings for video IDs: ${ids.join(', ')}`);
      try {
        // Try to delete from the embeddings table if it exists
        await db.execute(sql`DELETE FROM embeddings WHERE video_id IN (${sql.join(ids)})`);
        console.log(`Deleted embeddings for videos`);
      } catch (embeddingError) {
        // If the table doesn't exist or there's some other error, log and continue
        console.warn(`Warning when deleting embeddings:`, embeddingError);
      }

      // Finally delete the videos
      console.log(`Deleting videos with IDs: ${ids.join(', ')}`);
      const result = await db
        .delete(videos)
        .where(inArray(videos.id, ids))
        .returning();
      console.log(`Successfully deleted ${result.length} videos`);

      return result.length;
    } catch (error) {
      console.error("Error in bulkDeleteVideos:", error);
      
      // Check if this is a foreign key constraint error
      if (error instanceof Error && error.message.includes('foreign key constraint')) {
        console.log("Foreign key constraint error detected. Attempting manual cascade delete...");
        
        // Try a more thorough approach for each video individually
        let deletedCount = 0;
        
        for (const id of ids) {
          try {
            // Delete QA conversations for this specific video
            await db
              .delete(qa_conversations)
              .where(eq(qa_conversations.video_id, id));
              
            // Delete collection associations for this specific video
            await db
              .delete(collection_videos)
              .where(eq(collection_videos.video_id, id));
            
            // Delete embeddings for this specific video
            try {
              await db.execute(sql`DELETE FROM embeddings WHERE video_id = ${id}`);
            } catch (embeddingError) {
              console.warn(`Warning when deleting embeddings for video ID ${id}:`, embeddingError);
            }
              
            // Delete the video itself
            const deleted = await db
              .delete(videos)
              .where(eq(videos.id, id))
              .returning();
              
            if (deleted.length > 0) {
              deletedCount++;
              console.log(`Successfully deleted video ID: ${id}`);
            }
          } catch (innerError) {
            console.error(`Failed to delete video ID: ${id}`, innerError);
          }
        }
        
        return deletedCount;
      }
      
      // Re-throw other errors
      throw error;
    }
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
    try {
      console.log('[DB] Creating anonymous session:', session);
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
      
      console.log('[DB] Session created successfully:', result[0]);
      return result[0];
    } catch (error) {
      console.error('[DB] Error creating anonymous session:', error);
      throw error;
    }
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
    
    // Get actual video count from database as a safety check
    const actualVideos = await this.getVideosByAnonymousSessionId(sessionId);
    const actualCount = actualVideos.length;
    
    // Use the actual count to make sure our counter is accurate
    // This prevents the counter from getting out of sync with reality
    console.log(`[DB] Session video count sync: Counter=${session.video_count}, Actual=${actualCount}`);
    
    // Use actual count + 1 as the new count to prevent drift
    const newCount = actualCount + 1;
    
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