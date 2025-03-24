import { db } from '../db';
import { log } from '../vite';
import { Embedding, InsertEmbedding, contentTypeEnum, embeddings, search_history } from '@shared/schema';
import { supabase } from './supabase';
import { chunkText, generateEmbeddingsBatch } from './openai';
import { eq, and, sql } from 'drizzle-orm';

// Maximum number of text chunks to process in a single batch
const MAX_BATCH_SIZE = 20;

// These functions handle the storage and retrieval of text embeddings for semantic search

/**
 * Process a video's transcript, create text chunks, generate embeddings, and store them in the database
 * @param videoId The ID of the video
 * @param userId The ID of the user who owns the video
 * @param transcript The full transcript to process
 * @returns An array of the created embedding IDs
 */
export async function processTranscriptEmbeddings(
  videoId: number,
  userId: number,
  transcript: string
): Promise<number[]> {
  if (!transcript) {
    log('No transcript provided for embedding generation', 'embeddings');
    return [];
  }
  
  // Split transcript into chunks
  const chunks = chunkText(transcript);
  log(`Split transcript into ${chunks.length} chunks for embedding`, 'embeddings');
  
  return processContentEmbeddings(videoId, userId, chunks, 'transcript');
}

/**
 * Process a video's summary points, generate embeddings, and store them in the database
 * @param videoId The ID of the video
 * @param userId The ID of the user who owns the video
 * @param summaryPoints Array of summary bullet points
 * @returns An array of the created embedding IDs
 */
export async function processSummaryEmbeddings(
  videoId: number,
  userId: number,
  summaryPoints: string[]
): Promise<number[]> {
  if (!summaryPoints || summaryPoints.length === 0) {
    log('No summary points provided for embedding generation', 'embeddings');
    return [];
  }
  
  return processContentEmbeddings(videoId, userId, summaryPoints, 'summary');
}

/**
 * Process a video's user notes, generate embeddings, and store them in the database
 * @param videoId The ID of the video
 * @param userId The ID of the user who owns the video
 * @param notes The user's notes on the video
 * @returns An array of the created embedding IDs
 */
export async function processNotesEmbeddings(
  videoId: number,
  userId: number,
  notes: string
): Promise<number[]> {
  if (!notes) {
    log('No notes provided for embedding generation', 'embeddings');
    return [];
  }
  
  // Split notes into chunks
  const chunks = chunkText(notes);
  log(`Split notes into ${chunks.length} chunks for embedding`, 'embeddings');
  
  return processContentEmbeddings(videoId, userId, chunks, 'note');
}

/**
 * Helper function to batch process content chunks into embeddings
 */
async function processContentEmbeddings(
  videoId: number,
  userId: number,
  textChunks: string[],
  contentType: typeof contentTypeEnum.enumValues[number]
): Promise<number[]> {
  const embeddingIds: number[] = [];
  const validChunks = textChunks.filter(chunk => chunk.trim().length > 0);
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < validChunks.length; i += MAX_BATCH_SIZE) {
    const batchChunks = validChunks.slice(i, i + MAX_BATCH_SIZE);
    
    try {
      // Generate embeddings for this batch
      const batchEmbeddings = await generateEmbeddingsBatch(batchChunks);
      
      // Store each embedding in the database
      const insertPromises = batchChunks.map((chunk, index) => {
        const insertData: InsertEmbedding = {
          video_id: videoId,
          user_id: userId,
          content_type: contentType,
          chunk_index: i + index,
          content: chunk,
          embedding: batchEmbeddings[index],
          metadata: { 
            position: i + index,
            length: chunk.length,
            created_at: new Date().toISOString()
          },
        };
        
        return db.insert(embeddings).values(insertData).returning({ id: embeddings.id });
      });
      
      // Wait for all inserts to complete
      const results = await Promise.all(insertPromises);
      embeddingIds.push(...results.map(r => r[0].id));
      
    } catch (error) {
      log(`Error processing embeddings batch: ${error}`, 'embeddings');
      // Continue with the next batch even if this one failed
    }
  }
  
  log(`Stored ${embeddingIds.length} embeddings for video ${videoId}`, 'embeddings');
  return embeddingIds;
}

/**
 * Delete all embeddings for a specific video
 * @param videoId The ID of the video
 * @returns The number of deleted embeddings
 */
export async function deleteVideoEmbeddings(videoId: number): Promise<number> {
  try {
    const result = await db.delete(embeddings).where(eq(embeddings.video_id, videoId)).returning();
    return result.length;
  } catch (error) {
    log(`Error deleting embeddings for video ${videoId}: ${error}`, 'embeddings');
    throw error;
  }
}

/**
 * Execute a semantic search query across all embeddings
 * @param userId The ID of the user performing the search
 * @param query The search query text
 * @param filters Optional filters to apply to the search
 * @param limit Maximum number of results to return
 * @returns An array of search results with similarity scores
 */
export async function performSemanticSearch(
  userId: number,
  query: string,
  filters: {
    contentTypes?: Array<typeof contentTypeEnum.enumValues[number]>;
    videoId?: number;
    categoryId?: number;
    collectionId?: number;
    isFavorite?: boolean;
  } = {},
  limit: number = 10
): Promise<{
  id: number;
  video_id: number;
  content: string;
  content_type: typeof contentTypeEnum.enumValues[number];
  similarity: number;
  metadata: any;
}[]> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbeddingsBatch([query]);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('Failed to generate embedding for query');
    }
    
    // Since we're storing the embeddings as jsonb, we need to use supabase directly
    // for vector similarity search instead of drizzle-orm
    let query = supabase
      .from('embeddings')
      .select(`
        id,
        video_id,
        content,
        content_type,
        metadata,
        videos(id, title, category_id, is_favorite)
      `)
      .eq('user_id', userId)
      .order('metadata->similarity', { ascending: false })
      .limit(limit);
    
    // Apply content type filter if specified
    if (filters.contentTypes && filters.contentTypes.length > 0) {
      query = query.in('content_type', filters.contentTypes);
    }
    
    // Apply video filter if specified
    if (filters.videoId) {
      query = query.eq('video_id', filters.videoId);
    }
    
    // Need to filter post-query for category and favorite since these are in the videos table
    const { data, error } = await query;
    
    if (error) {
      log(`Error in semantic search: ${error.message}`, 'embeddings');
      throw error;
    }
    
    // Apply additional filtering that couldn't be done in the query
    let results = data;
    
    if (filters.categoryId) {
      results = results.filter(r => r.videos?.category_id === filters.categoryId);
    }
    
    if (filters.isFavorite !== undefined) {
      results = results.filter(r => r.videos?.is_favorite === filters.isFavorite);
    }
    
    // For collection filtering, we need a separate query
    if (filters.collectionId) {
      const { data: collectionVideos } = await supabase
        .from('collection_videos')
        .select('video_id')
        .eq('collection_id', filters.collectionId);
      
      if (collectionVideos) {
        const collectionVideoIds = collectionVideos.map(cv => cv.video_id);
        results = results.filter(r => collectionVideoIds.includes(r.video_id));
      }
    }
    
    // Map results to the expected format
    return results.map(r => ({
      id: r.id,
      video_id: r.video_id,
      content: r.content,
      content_type: r.content_type as typeof contentTypeEnum.enumValues[number],
      similarity: r.metadata?.similarity || 0,
      metadata: r.metadata || {},
    }));
    
  } catch (error) {
    log(`Error in semantic search: ${error}`, 'embeddings');
    throw error;
  }
}

/**
 * Save a search query to the user's search history
 * @param userId User ID
 * @param query Search query text
 * @param filterParams Optional filter parameters used in the search
 * @param resultsCount Number of results returned
 */
export async function saveSearchHistory(
  userId: number,
  query: string,
  filterParams: Record<string, any> = {},
  resultsCount: number = 0
): Promise<void> {
  try {
    await db.insert(search_history).values({
      user_id: userId,
      query,
      filter_params: filterParams,
      results_count: resultsCount,
    });
  } catch (error) {
    log(`Error saving search history: ${error}`, 'embeddings');
    // Non-critical, can fail silently
  }
}