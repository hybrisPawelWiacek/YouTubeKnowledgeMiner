import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../shared/schema';

const { Pool } = pg;

// Initialize the PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Drizzle with the pool and schema
const db = drizzle(pool, { schema });

async function pushSchema() {
  console.log('Pushing schema to database...');
  
  try {
    // Create the tables in the database
    await db.query.users.findMany();
    await db.query.categories.findMany();
    await db.query.videos.findMany();
    
    console.log('Schema pushed successfully!');
  } catch (error) {
    console.error('Error pushing schema:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the push schema function
pushSchema().catch(console.error);