import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { log } from './vite';

// This script will run migrations on the database
async function runMigrations() {
  // Create a PostgreSQL connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Create a Drizzle instance
  const db = drizzle(pool);

  log('Starting database migrations...', 'migrate');

  try {
    // This will run all migrations in the migrations folder
    await migrate(db, { migrationsFolder: 'drizzle' });
    log('Migrations completed successfully!', 'migrate');
  } catch (error) {
    log(`Migration failed: ${error}`, 'migrate');
    process.exit(1);
  }

  // Close the pool
  await pool.end();
}

// Run the migration function
runMigrations().catch(console.error);