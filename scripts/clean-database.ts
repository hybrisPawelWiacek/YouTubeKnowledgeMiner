
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { log } from "../server/vite";

async function cleanDatabase() {
  log('Starting database cleanup...', 'cleanup');
  
  try {
    // Delete data from tables in reverse dependency order
    // This order is important to avoid foreign key constraint issues
    
    log('Deleting data from embeddings table...', 'cleanup');
    await db.delete(schema.embeddings);
    
    log('Deleting data from search_history table...', 'cleanup');
    await db.delete(schema.search_history);
    
    log('Deleting data from qa_conversations table...', 'cleanup');
    await db.delete(schema.qa_conversations);
    
    log('Deleting data from collection_videos table...', 'cleanup');
    await db.delete(schema.collection_videos);
    
    log('Deleting data from videos table...', 'cleanup');
    await db.delete(schema.videos);
    
    log('Deleting data from collections table...', 'cleanup');
    await db.delete(schema.collections);
    
    // For categories, we need to be careful as there may be references from videos
    // Let's only delete non-global categories to preserve system ones
    log('Deleting data from user categories...', 'cleanup');
    await db.delete(schema.categories).where(sql`is_global = false`);
    
    log('Deleting data from saved_searches table...', 'cleanup');
    await db.delete(schema.saved_searches);
    
    // Optionally, keep the users table if you want to preserve user accounts
    // Uncomment the next line if you want to delete all users as well
    // log('Deleting data from users table...', 'cleanup');
    // await db.delete(schema.users);
    
    log('Database cleanup completed successfully!', 'cleanup');
    
    // Re-run the global categories migration to ensure they exist
    log('Re-creating global categories...', 'cleanup');
    const { default: addGlobalCategories } = await import('./add-global-categories');
    await addGlobalCategories();
    
  } catch (error) {
    log(`Database cleanup failed: ${error}`, 'cleanup');
    throw error;
  }
}

// Import the SQL tag for raw SQL execution
import { sql } from "drizzle-orm";

// Execute the function
cleanDatabase()
  .then(() => {
    log('Database cleanup script completed.', 'cleanup');
    process.exit(0);
  })
  .catch((error) => {
    log(`Unhandled error: ${error}`, 'cleanup');
    process.exit(1);
  });
