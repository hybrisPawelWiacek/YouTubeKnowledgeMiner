import { db } from '../db';
import { log } from '../vite';
import { Embedding, InsertEmbedding, contentTypeEnum, embeddings, search_history, videos, collection_videos } from '@shared/schema';
import { calculateCosineSimilarity } from './supabase';
import { chunkText, generateEmbeddingsBatch } from './openai';
import { eq, and, sql, inArray } from 'drizzle-orm';

// Format timestamp function (copied from youtube.ts to avoid circular dependency)
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

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
  userId: number | null,
  transcript: string
): Promise<number[]> {
  if (!transcript) {
    log('No transcript provided for embedding generation', 'embeddings');
    return [];
  }
  
  // For embedding storage purposes, we need a valid user ID
  // If user is anonymous, we use a special system user ID (1 is commonly used for system)
  const embeddingUserId = userId !== null ? userId : 1;
  
  // Extract timestamp data from transcript before removing HTML
  const timestampData: { [index: number]: { timestamp: number, duration: number } } = {};
  
  // Node.js environment - use regex to extract data attributes from HTML
  const timestampRegex = /<p class="mb-3 transcript-line"[^>]*?data-timestamp="([^"]*)"[^>]*?data-duration="([^"]*)"[^>]*?data-index="([^"]*)"[^>]*?>/g;
  let match;
  while ((match = timestampRegex.exec(transcript)) !== null) {
    const timestamp = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const index = parseInt(match[3]);
    timestampData[index] = { timestamp, duration };
  }
  
  // Split transcript into chunks, removing HTML tags
  const plainText = transcript.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const chunks = chunkText(plainText);
  log(`Split transcript into ${chunks.length} chunks for embedding`, 'embeddings');
  
  // Process chunks with timestamp metadata
  return processTranscriptChunksWithTimestamps(videoId, embeddingUserId, chunks, timestampData);
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
  userId: number | null,
  summaryPoints: string[]
): Promise<number[]> {
  if (!summaryPoints || summaryPoints.length === 0) {
    log('No summary points provided for embedding generation', 'embeddings');
    return [];
  }
  
  // For embedding storage purposes, we need a valid user ID
  // If user is anonymous, we use a special system user ID (1 is commonly used for system)
  const embeddingUserId = userId !== null ? userId : 1;
  return processContentEmbeddings(videoId, embeddingUserId, summaryPoints, 'summary');
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
  userId: number | null,
  notes: string
): Promise<number[]> {
  if (!notes) {
    log('No notes provided for embedding generation', 'embeddings');
    return [];
  }
  
  // Split notes into chunks
  const chunks = chunkText(notes);
  log(`Split notes into ${chunks.length} chunks for embedding`, 'embeddings');
  
  // For embedding storage purposes, we need a valid user ID
  // If user is anonymous, we use a special system user ID (1 is commonly used for system)
  const embeddingUserId = userId !== null ? userId : 1;
  return processContentEmbeddings(videoId, embeddingUserId, chunks, 'note');
}

/**
 * Process a QA conversation, create text chunks from messages, generate embeddings, and store them in the database
 * @param videoId The ID of the video the conversation is related to
 * @param userId The ID of the user who owns the conversation
 * @param messages Array of conversation messages (questions and answers)
 * @returns An array of the created embedding IDs
 */
export async function processConversationEmbeddings(
  videoId: number,
  userId: number | null,
  messages: any[]
): Promise<number[]> {
  if (!messages || messages.length === 0) {
    log('No messages provided for conversation embedding generation', 'embeddings');
    return [];
  }

  // For embedding storage purposes, we need a valid user ID
  // If user is anonymous, we use a special system user ID (1 is commonly used for system)
  const embeddingUserId = userId !== null ? userId : 1;
  
  // Process each message into a text chunk for embedding
  const chunks = messages.map((message, index) => {
    const role = message.role === 'user' ? 'Question' : 'Answer';
    return `${role}: ${message.content}`;
  });

  log(`Created ${chunks.length} chunks from conversation messages for embedding`, 'embeddings');
  
  // Use the standard content embedding process with the 'conversation' content type
  return processContentEmbeddings(videoId, embeddingUserId, chunks, 'conversation');
}

/**
 * Helper function to process transcript chunks with timestamp metadata
 */
async function processTranscriptChunksWithTimestamps(
  videoId: number,
  userId: number, // Must be a valid number for database storage
  textChunks: string[],
  timestampData: { [index: number]: { timestamp: number, duration: number } }
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
        // Find closest timestamp data
        const chunkIndex = i + index;
        // Estimate which original transcript chunk this corresponds to
        const originalIndex = Math.floor(chunkIndex * (Object.keys(timestampData).length / validChunks.length));
        const nearestTimestamp = timestampData[originalIndex] || { timestamp: 0, duration: 0 };
        
        const insertData: InsertEmbedding = {
          video_id: videoId,
          user_id: userId,
          content_type: 'transcript',
          chunk_index: chunkIndex,
          content: chunk,
          embedding: batchEmbeddings[index],
          metadata: { 
            position: chunkIndex,
            length: chunk.length,
            timestamp: nearestTimestamp.timestamp,
            duration: nearestTimestamp.duration,
            formatted_timestamp: formatTimestamp(nearestTimestamp.timestamp),
            created_at: new Date().toISOString()
          },
        };
        
        return db.insert(embeddings).values(insertData).returning({ id: embeddings.id });
      });
      
      // Wait for all inserts to complete
      const results = await Promise.all(insertPromises);
      embeddingIds.push(...results.map(r => r[0].id));
      
    } catch (error) {
      log(`Error processing transcript embeddings batch: ${error}`, 'embeddings');
      // Continue with the next batch even if this one failed
    }
  }
  
  log(`Stored ${embeddingIds.length} transcript embeddings with timestamps for video ${videoId}`, 'embeddings');
  return embeddingIds;
}

/**
 * Helper function to batch process content chunks into embeddings
 */
async function processContentEmbeddings(
  videoId: number,
  userId: number, // Must be a valid number for database storage
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
  userId: number | null,
  query: string,
  filters: {
    contentTypes?: Array<typeof contentTypeEnum.enumValues[number]>;
    videoId?: number;
    categoryId?: number;
    collectionId?: number;
    isFavorite?: boolean;
    anonymous_session_id?: string; // Add support for anonymous session ID
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
  try {
    // Generate embedding for the query
    const queryEmbeddingsArray = await generateEmbeddingsBatch([query]);
    if (!queryEmbeddingsArray || queryEmbeddingsArray.length === 0) {
      throw new Error('Failed to generate embedding for query');
    }
    const queryEmbedding = queryEmbeddingsArray[0];
    
    // Execute the initial search - handle both registered and anonymous users
    let conditions: any[] = [];
    let videoFilter: any = null;
    
    // Handle both registered and anonymous users
    if (userId !== null && !filters.anonymous_session_id) {
      // For registered users, filter by their user ID directly
      log(`Performing semantic search for registered user ${userId}`, 'embeddings');
      conditions.push(eq(embeddings.user_id, userId));
    } else if (filters.anonymous_session_id) {
      // For anonymous users, we need to get their videos by session ID first
      // then filter embeddings by those video IDs
      log(`Performing semantic search for anonymous session ${filters.anonymous_session_id}`, 'embeddings');
      
      // Get all videos for this anonymous session
      const anonymousVideos = await db.select({
        id: videos.id
      })
      .from(videos)
      .where(eq(videos.anonymous_session_id, filters.anonymous_session_id));
      
      if (anonymousVideos.length === 0) {
        log(`No videos found for anonymous session ${filters.anonymous_session_id}`, 'embeddings');
        return []; // No videos for this session, return empty results
      }
      
      const videoIds = anonymousVideos.map(v => v.id);
      log(`Found ${videoIds.length} videos for anonymous session: ${videoIds.join(', ')}`, 'embeddings');
      
      // We'll use these video IDs to filter the embeddings
      videoFilter = inArray(embeddings.video_id, videoIds);
    } else {
      // If we don't have userId or anonymous_session_id, something is wrong
      log(`Warning: No user ID or anonymous session ID provided for semantic search`, 'embeddings');
      return [];
    }
    
    // Apply video filter from anonymous session if we have one
    if (videoFilter) {
      conditions.push(videoFilter);
    } else if (filters.videoId) {
      // Otherwise apply specific video ID filter if provided
      conditions.push(eq(embeddings.video_id, filters.videoId));
    }
    
    if (filters.contentTypes && filters.contentTypes.length > 0) {
      conditions.push(inArray(embeddings.content_type, filters.contentTypes as any[]));
    }
    
    // Get results from our database
    const embeddingsResults = await db.query.embeddings.findMany({
      where: and(...conditions),
      limit: 100, // Get more than needed for post-filtering
    });
    
    if (!embeddingsResults || embeddingsResults.length === 0) {
      return [];
    }
    
    // Additional filtering for category and collection
    let filteredResults = [...embeddingsResults];
    
    // If we're filtering by category, get videos with that category
    if (filters.categoryId) {
      const videosInCategory = await db.query.videos.findMany({
        where: eq(videos.category_id, filters.categoryId),
        columns: {
          id: true
        }
      });
      
      const videoIdsInCategory = videosInCategory.map(v => v.id);
      filteredResults = filteredResults.filter(r => videoIdsInCategory.includes(r.video_id));
    }
    
    // If we're filtering by collection, get videos in that collection
    if (filters.collectionId) {
      const videoIdsInCollection = await db.query.collection_videos.findMany({
        where: eq(collection_videos.collection_id, filters.collectionId),
        columns: {
          video_id: true
        }
      });
      
      const collectionVideoIds = videoIdsInCollection.map(v => v.video_id);
      filteredResults = filteredResults.filter(r => collectionVideoIds.includes(r.video_id));
    }
    
    // If we're filtering by favorite status, get favorite videos
    if (filters.isFavorite) {
      const favoriteVideos = await db.query.videos.findMany({
        where: eq(videos.is_favorite, true),
        columns: {
          id: true
        }
      });
      
      const favoriteVideoIds = favoriteVideos.map(v => v.id);
      filteredResults = filteredResults.filter(r => favoriteVideoIds.includes(r.video_id));
    }
    
    // Calculate similarity for each embedding
    const resultsWithSimilarity = filteredResults.map(item => {
      const embedding = item.embedding as unknown as number[];
      const similarity = calculateCosineSimilarity(queryEmbedding, embedding);
      
      // Create metadata including similarity
      const updatedMetadata = {
        ...(item.metadata as any || {}),
        similarity
      };
      
      return {
        id: item.id,
        video_id: item.video_id,
        content: item.content,
        content_type: item.content_type,
        similarity,
        metadata: updatedMetadata
      };
    });
    
    // Sort by similarity (highest first)
    resultsWithSimilarity.sort((a, b) => b.similarity - a.similarity);
    
    // Apply similarity threshold and return top results
    const threshold = 0.5;
    return resultsWithSimilarity
      .filter(item => item.similarity >= threshold)
      .slice(0, limit);
    
  } catch (error) {
    log(`Error in semantic search: ${error}`, 'embeddings');
    throw error;
  }
}

/**
 * Save a search query to the user's search history
 * @param userId User ID
 * @param query Search query text
 * @param resultsCount Number of results returned
 * @param filterParams Optional filter parameters used in the search
 */
export async function saveSearchHistory(
  userId: number | null,
  query: string,
  resultsCount: number = 0,
  filterParams: Record<string, any> = {}
): Promise<void> {
  try {
    // Don't save search history for anonymous users
    if (userId !== null) {
      await db.insert(search_history).values({
        user_id: userId,
        query,
        filter_params: JSON.stringify(filterParams),
        results_count: resultsCount,
      });
    }
  } catch (error) {
    log(`Error saving search history: ${error}`, 'embeddings');
    // Non-critical, can fail silently
  }
}