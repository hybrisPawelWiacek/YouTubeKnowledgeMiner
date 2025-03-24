import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../shared/schema';
import { sql } from 'drizzle-orm';

const { Pool } = pg;

// Initialize the PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Drizzle with the pool and schema
const db = drizzle(pool, { schema });

async function createEmbeddingTables() {
  console.log('Creating embedding tables in database...');
  
  try {
    // Create content_type enum if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type') THEN
          CREATE TYPE content_type AS ENUM ('transcript', 'summary', 'note');
        END IF;
      END
      $$;
    `);
    
    console.log('Content type enum created or already exists');
    
    // Create embeddings table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id SERIAL PRIMARY KEY,
        video_id INTEGER NOT NULL REFERENCES videos(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content_type content_type NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding JSONB NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    
    console.log('Embeddings table created or already exists');
    
    // Create search_history table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS search_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        query TEXT NOT NULL,
        filter_params JSONB,
        results_count INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    
    console.log('Search history table created or already exists');
    
    console.log('Embedding tables created successfully!');
  } catch (error) {
    console.error('Error creating embedding tables:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the function
createEmbeddingTables().catch(console.error);