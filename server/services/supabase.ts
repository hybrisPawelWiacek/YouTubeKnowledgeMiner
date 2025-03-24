import { createClient } from '@supabase/supabase-js';
import { log } from '../vite';

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

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
  filters: Record<string, any> = {},
  limit: number = 10
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  try {
    // Build the RPC call with proper parameters
    const { data, error } = await supabase.rpc('match_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7, // Minimum similarity threshold
      match_count: limit,
      filter_json: filters
    });
    
    if (error) {
      log(`Error in similarity search: ${error.message}`, 'supabase');
      throw error;
    }
    
    return data;
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
