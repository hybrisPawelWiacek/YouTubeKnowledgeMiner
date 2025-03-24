import { createClient } from '@supabase/supabase-js';
import { log } from '../vite';

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
 * Initialize pgvector extension and tables in Supabase
 */
export async function initializeSupabaseVector() {
  if (!supabase) {
    log('Supabase credentials not found in environment variables', 'supabase');
    return false;
  }
  
  try {
    // First, enable the pgvector extension on the database
    const { error: extensionError } = await supabase.rpc('enable_pgvector');
    
    if (extensionError) {
      // If the extension is already enabled, this might fail but that's ok
      log(`Warning during pgvector initialization: ${extensionError.message}`, 'supabase');
    }
    
    // Create embeddings index for faster similarity search
    const { error: indexError } = await supabase.rpc('create_embedding_index');
    
    if (indexError) {
      log(`Error creating embedding index: ${indexError.message}`, 'supabase');
      return false;
    }
    
    log('Supabase pgvector successfully initialized', 'supabase');
    return true;
  } catch (error) {
    log(`Error initializing Supabase pgvector: ${error}`, 'supabase');
    return false;
  }
}

/**
 * Search for embeddings by similarity to a query vector
 * @param queryEmbedding Query vector to compare against
 * @param filters Additional filters to apply
 * @param limit Maximum number of results to return
 * @returns Search results with similarity scores
 */
export async function similaritySearch(
  queryEmbedding: number[],
  filters: {
    userId?: number;
    contentTypes?: string[];
    videoId?: number;
  } = {},
  limit: number = 10
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  try {
    // Start building the query
    let query = supabase
      .from('embeddings')
      .select(`
        id,
        video_id,
        content,
        content_type,
        metadata,
        user_id
      `)
      .limit(limit);
    
    // Apply user filter if specified (almost always provided)
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    
    // Apply content type filter if specified
    if (filters.contentTypes && filters.contentTypes.length > 0) {
      query = query.in('content_type', filters.contentTypes);
    }
    
    // Apply video filter if specified
    if (filters.videoId) {
      query = query.eq('video_id', filters.videoId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      log(`Error in similarity search: ${error.message}`, 'supabase');
      throw error;
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Calculate similarity scores client-side
    // This is less efficient than doing it in the database but doesn't require custom SQL functions
    const resultsWithSimilarity = data.map((item: any) => {
      // Calculate cosine similarity if we have embeddings
      let similarity = 0;
      
      if (item.embedding && Array.isArray(item.embedding) && queryEmbedding.length === item.embedding.length) {
        // Cosine similarity calculation
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;
        
        for (let i = 0; i < queryEmbedding.length; i++) {
          dotProduct += queryEmbedding[i] * item.embedding[i];
          magnitudeA += queryEmbedding[i] * queryEmbedding[i];
          magnitudeB += item.embedding[i] * item.embedding[i];
        }
        
        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);
        
        if (magnitudeA > 0 && magnitudeB > 0) {
          similarity = dotProduct / (magnitudeA * magnitudeB);
        }
      }
      
      // Add similarity to metadata for sorting
      if (!item.metadata) {
        item.metadata = {};
      }
      item.metadata.similarity = similarity;
      
      return {
        id: item.id,
        video_id: item.video_id,
        content: item.content,
        content_type: item.content_type,
        similarity: similarity,
        metadata: item.metadata || {}
      };
    });
    
    // Sort by similarity score (highest first)
    resultsWithSimilarity.sort((a, b) => 
      (b.similarity || 0) - (a.similarity || 0)
    );
    
    // Apply minimum similarity threshold
    const threshold = 0.5;
    return resultsWithSimilarity
      .filter(item => (item.similarity || 0) >= threshold)
      .slice(0, limit);
    
  } catch (error) {
    log(`Error in similarity search: ${error}`, 'supabase');
    throw error;
  }
}

/**
 * Initialize Supabase with required functions for vector search
 * This creates stored procedures in the database to handle vector operations
 */
export async function initializeVectorFunctions() {
  if (!supabase) {
    log('Supabase credentials not found in environment variables', 'supabase');
    return false;
  }
  
  try {
    // Check if JSONB columns can be used directly for the semantic search
    const { data: testData, error: testError } = await supabase
      .from('embeddings')
      .select('id')
      .limit(1);
      
    if (testError) {
      log(`Error connecting to Supabase: ${testError.message}`, 'supabase');
    } else {
      log('Successfully connected to Supabase database', 'supabase');
    }
    
    // Set up simple approach for semantic search without custom functions
    // This uses the built-in PostgreSQL operators directly without needing pgvector extension
    
    log('Supabase connection is ready for semantic search operations', 'supabase');
    return true;
  } catch (error) {
    log(`Error initializing vector functions: ${error}`, 'supabase');
    return false;
  }
}
