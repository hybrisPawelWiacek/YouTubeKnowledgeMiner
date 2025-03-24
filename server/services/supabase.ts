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
    // Create extension enabling function
    const { error: enableFnError } = await supabase.rpc('create_function', {
      function_name: 'enable_pgvector',
      function_definition: `
      CREATE OR REPLACE FUNCTION enable_pgvector()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        CREATE EXTENSION IF NOT EXISTS vector;
      END;
      $$;
      `
    });
    
    if (enableFnError) {
      log(`Error creating pgvector enable function: ${enableFnError.message}`, 'supabase');
      return false;
    }
    
    // Create embedding index function
    const { error: indexFnError } = await supabase.rpc('create_function', {
      function_name: 'create_embedding_index',
      function_definition: `
      CREATE OR REPLACE FUNCTION create_embedding_index()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
      END;
      $$;
      `
    });
    
    if (indexFnError) {
      log(`Error creating embedding index function: ${indexFnError.message}`, 'supabase');
      return false;
    }
    
    // Create similarity search function
    const { error: searchFnError } = await supabase.rpc('create_function', {
      function_name: 'match_embeddings',
      function_definition: `
      CREATE OR REPLACE FUNCTION match_embeddings(
        query_embedding JSONB,
        match_threshold FLOAT8,
        match_count INT,
        filter_json JSONB
      )
      RETURNS TABLE (
        id INT,
        video_id INT,
        content TEXT,
        content_type TEXT,
        metadata JSONB,
        similarity FLOAT8
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        query_embedding_array FLOAT8[];
        user_id_filter INT;
        content_type_filter TEXT[];
        video_id_filter INT;
      BEGIN
        -- Convert the JSONB query embedding to a float array
        SELECT array_agg(x::float8) INTO query_embedding_array
        FROM jsonb_array_elements_text(query_embedding) as x;
        
        -- Extract filter values
        user_id_filter := (filter_json->>'user_id')::INT;
        
        -- If content_type filter is provided, convert from JSONB array to text array
        IF filter_json ? 'content_types' THEN
          SELECT array_agg(x::TEXT)
          INTO content_type_filter
          FROM jsonb_array_elements_text(filter_json->'content_types') as x;
        END IF;
        
        video_id_filter := (filter_json->>'video_id')::INT;
        
        RETURN QUERY
        SELECT
          e.id,
          e.video_id,
          e.content,
          e.content_type::TEXT,
          e.metadata,
          1 - (e.embedding <=> query_embedding_array) as similarity
        FROM
          embeddings e
        WHERE
          (user_id_filter IS NULL OR e.user_id = user_id_filter)
          AND (content_type_filter IS NULL OR e.content_type = ANY(content_type_filter))
          AND (video_id_filter IS NULL OR e.video_id = video_id_filter)
          AND 1 - (e.embedding <=> query_embedding_array) > match_threshold
        ORDER BY
          similarity DESC
        LIMIT match_count;
      END;
      $$;
      `
    });
    
    if (searchFnError) {
      log(`Error creating match_embeddings function: ${searchFnError.message}`, 'supabase');
      return false;
    }
    
    log('Supabase vector functions successfully created', 'supabase');
    return true;
  } catch (error) {
    log(`Error initializing vector functions: ${error}`, 'supabase');
    return false;
  }
}
