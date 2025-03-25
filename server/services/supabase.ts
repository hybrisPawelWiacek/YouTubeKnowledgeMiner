import { createClient } from '@supabase/supabase-js';
import { log } from '../vite';
import { db } from '../db';
import { embeddings } from '@shared/schema';

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Log whether we have credentials (without exposing the values)
console.log(`Supabase URL exists: ${Boolean(SUPABASE_URL)}`);
console.log(`Supabase Key exists: ${Boolean(SUPABASE_KEY)}`);
console.log(`Environment vars available: ${Object.keys(process.env).filter(k => !k.includes('KEY') && !k.includes('SECRET')).join(', ')}`);

// Create Supabase client
export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return !!supabase;
}

/**
 * With pgvector, we don't need to calculate cosine similarity manually
 * as PostgreSQL will do it for us using the <-> operator
 * 
 * This function is kept for backwards compatibility
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Use pgvector's native vector operations for similarity search
 */
export async function performVectorSearch(
  queryEmbedding: number[],
  filters: { 
    content_types?: string[],
    video_id?: number,
    category_id?: number,
    collection_id?: number,
    is_favorite?: boolean
  },
  limit: number = 10
) {
  try {
    const { content_types, video_id, category_id, collection_id, is_favorite } = filters || {};
    
    // Convert embedding array to pgvector format
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    
    let query = `
      SELECT e.id, e.content, e.content_type, e.video_id, v.title as video_title,
             e.metadata, e.embedding <-> '${embeddingString}'::vector as distance
      FROM embeddings e
      JOIN videos v ON e.video_id = v.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;
    
    if (content_types && content_types.length > 0) {
      query += ` AND e.content_type = ANY($${paramCount}::content_type[])`;
      params.push(content_types);
      paramCount++;
    }
    
    if (video_id) {
      query += ` AND e.video_id = $${paramCount}`;
      params.push(video_id);
      paramCount++;
    }
    
    if (category_id) {
      query += ` AND v.category_id = $${paramCount}`;
      params.push(category_id);
      paramCount++;
    }
    
    if (is_favorite !== undefined) {
      query += ` AND v.is_favorite = $${paramCount}`;
      params.push(is_favorite);
      paramCount++;
    }
    
    if (collection_id) {
      query += `
        AND EXISTS (
          SELECT 1 FROM collection_videos cv
          WHERE cv.video_id = v.id
          AND cv.collection_id = $${paramCount}
        )
      `;
      params.push(collection_id);
      paramCount++;
    }
    
    query += ` ORDER BY distance LIMIT $${paramCount}`;
    params.push(limit);
    
    if (supabase) {
      const { data, error } = await supabase.rpc('query_vector_search', {
        query_text: query,
        query_params: params
      });
      
      if (error) throw error;
      return data;
    } else {
      // Fall back to local database if Supabase is not configured
      const result = await db.execute(query, params);
      return result.rows;
    }
  } catch (error) {
    log(`Error in vector search: ${error}`, 'supabase');
    throw error;
  }
}

/**
 * Search for embeddings by similarity to a query vector using in-memory calculation
 * @param queryEmbedding Query vector to compare against
 * @param filters Additional filters to apply
 * @param limit Maximum number of results to return
 * @returns Search results with similarity scores
 */
export async function similaritySearch(
  queryEmbedding: number[],
  filters: {
    userId: number;
    contentTypes?: string[];
    videoId?: number;
  },
  limit: number = 10
) {
  try {
    // Get embeddings from our PostgreSQL database
    const embeddingsResult = await db.query.embeddings.findMany({
      where: (eb, { eq, and, inArray }) => {
        const conditions = [eq(eb.user_id, filters.userId)];
        
        if (filters.videoId) {
          conditions.push(eq(eb.video_id, filters.videoId));
        }
        
        if (filters.contentTypes && filters.contentTypes.length > 0) {
          conditions.push(inArray(eb.content_type, filters.contentTypes as any[]));
        }
        
        return and(...conditions);
      },
      limit: 100  // Get more than we need for better similarity selection
    });
    
    if (!embeddingsResult || embeddingsResult.length === 0) {
      return [];
    }
    
    // Calculate similarity for each embedding
    const resultsWithSimilarity = embeddingsResult.map(item => {
      const embedding = item.embedding as unknown as number[];
      const similarity = calculateCosineSimilarity(queryEmbedding, embedding);
      
      // Include similarity in metadata for reference
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
    log(`Error in similarity search: ${error}`, 'supabase');
    throw error;
  }
}

/**
 * Initialize connection and validate everything is ready for semantic search
 */
export async function initializeVectorFunctions() {
  try {
    // Try to access the embeddings table to confirm it exists
    let tableExists = false;
    try {
      const result = await db.query.embeddings.findFirst();
      tableExists = true;
      log('Embeddings table found in the database', 'supabase');
    } catch (err) {
      log(`Error checking embeddings table: ${err}`, 'supabase');
      tableExists = false;
    }
    
    if (supabase) {
      log('Supabase client initialized successfully', 'supabase');
    } else {
      log('Supabase not configured, but we can still use local similarity search', 'supabase');
    }
    
    log('Semantic search operations are ready', 'supabase');
    return true;
  } catch (error) {
    log(`Error initializing vector functions: ${error}`, 'supabase');
    return false;
  }
}
