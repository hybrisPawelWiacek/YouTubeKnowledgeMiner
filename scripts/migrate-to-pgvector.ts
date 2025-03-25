
import { db } from "../server/db";
import * as dotenv from "dotenv";
import { Pool } from "pg";
import { log } from "../server/vite";

// Load environment variables
dotenv.config();

async function migrateToPgVector() {
  log("Starting migration to pgvector", "migration");
  
  // Connect directly to the database to run raw SQL commands
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // Create a client from the pool
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query("BEGIN");
      
      // Enable pgvector extension if not already enabled
      log("Enabling pgvector extension", "migration");
      await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
      
      // Check if we need to migrate the table structure
      const tableResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'embeddings' AND column_name = 'embedding';
      `);
      
      if (tableResult.rows.length > 0 && tableResult.rows[0].data_type !== 'vector') {
        // Create a new column with vector type
        log("Creating vector column", "migration");
        await client.query(`
          ALTER TABLE embeddings 
          ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);
        `);
        
        // Migrate data from jsonb to vector
        log("Migrating data from JSONB to vector type", "migration");
        await client.query(`
          UPDATE embeddings 
          SET embedding_vector = embedding::text::vector 
          WHERE embedding_vector IS NULL;
        `);
        
        // Check if migration was successful
        const countResult = await client.query(`
          SELECT COUNT(*) FROM embeddings 
          WHERE embedding_vector IS NULL AND embedding IS NOT NULL;
        `);
        
        if (parseInt(countResult.rows[0].count) === 0) {
          // Drop the old column and rename the new one
          log("Dropping old JSONB column", "migration");
          await client.query(`
            ALTER TABLE embeddings 
            DROP COLUMN embedding,
            ALTER COLUMN embedding_vector RENAME TO embedding;
          `);
        } else {
          throw new Error(`Migration failed: ${countResult.rows[0].count} rows not migrated`);
        }
      } else if (tableResult.rows.length === 0) {
        log("Embeddings table not found or already in correct format", "migration");
      }
      
      // Create an index for faster similarity searches
      log("Creating GIN index for vector similarity searches", "migration");
      await client.query(`
        CREATE INDEX IF NOT EXISTS embeddings_vector_idx 
        ON embeddings 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
      `);
      
      // Commit transaction
      await client.query("COMMIT");
      log("Migration completed successfully!", "migration");
      
    } catch (error) {
      await client.query("ROLLBACK");
      log(`Migration failed: ${error}`, "migration");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    log(`Database connection error: ${error}`, "migration");
  } finally {
    await pool.end();
  }
}

// Run the migration
migrateToPgVector().catch(console.error);
