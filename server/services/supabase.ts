import { createClient } from '@supabase/supabase-js';

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// Create Supabase client
export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return !!supabase;
}

// Function to initialize Supabase tables if they don't exist
export async function initializeSupabaseTables() {
  if (!supabase) {
    console.warn('Supabase not configured, skipping table initialization');
    return;
  }
  
  try {
    // Users table
    const { error: usersError } = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'users',
      table_definition: `
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      `
    });
    
    if (usersError) {
      console.error('Error creating users table:', usersError);
    }
    
    // Categories table
    const { error: categoriesError } = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'categories',
      table_definition: `
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id)
      `
    });
    
    if (categoriesError) {
      console.error('Error creating categories table:', categoriesError);
    }
    
    // Videos table
    const { error: videosError } = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'videos',
      table_definition: `
        id SERIAL PRIMARY KEY,
        youtube_id TEXT NOT NULL,
        title TEXT NOT NULL,
        channel TEXT NOT NULL,
        duration TEXT NOT NULL,
        publish_date TEXT NOT NULL,
        thumbnail TEXT NOT NULL,
        transcript TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        notes TEXT,
        category_id INTEGER REFERENCES categories(id),
        rating INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      `
    });
    
    if (videosError) {
      console.error('Error creating videos table:', videosError);
    }
    
    console.log('Supabase tables initialized successfully');
  } catch (error) {
    console.error('Error initializing Supabase tables:', error);
  }
}
