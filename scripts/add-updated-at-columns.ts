/**
 * This script adds updated_at columns to tables that need them
 * These columns are needed for tracking when records were last modified
 */

import { db } from '../server/db';
import { logger } from '../server/utils/logger';

async function addUpdatedAtColumns() {
  console.log('Adding updated_at columns to tables...');
  logger.info('Adding updated_at columns to tables...');
  
  try {
    console.log('Checking database connection...');
    await db.execute('SELECT 1');
    console.log('Database connection successful');
    // Add updated_at column to videos table if it doesn't exist
    await db.execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'videos' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE videos ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
        END IF;
      END $$;
    `);
    logger.info('Added updated_at column to videos table (or it already existed)');
    
    // Add updated_at column to anonymous_sessions table if it doesn't exist
    await db.execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'anonymous_sessions' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE anonymous_sessions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
        END IF;
      END $$;
    `);
    logger.info('Added updated_at column to anonymous_sessions table (or it already existed)');
    
    // Add metadata column to anonymous_sessions table if it doesn't exist
    await db.execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'anonymous_sessions' AND column_name = 'metadata'
        ) THEN
          ALTER TABLE anonymous_sessions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb NOT NULL;
        END IF;
      END $$;
    `);
    logger.info('Added metadata column to anonymous_sessions table (or it already existed)');
    
    // Add user_type column to users table if it doesn't exist
    await db.execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'user_type'
        ) THEN
          -- Create the enum type if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'user_type'
          ) THEN
            CREATE TYPE user_type AS ENUM ('registered', 'anonymous');
          END IF;
          
          -- Add the column with a default value
          ALTER TABLE users ADD COLUMN user_type user_type DEFAULT 'registered'::user_type NOT NULL;
          
          -- Update any existing users to have the appropriate type
          UPDATE users SET user_type = 'registered'::user_type WHERE username NOT LIKE 'anonymous_%';
          UPDATE users SET user_type = 'anonymous'::user_type WHERE username LIKE 'anonymous_%';
        END IF;
      END $$;
    `);
    logger.info('Added user_type column to users table (or it already existed)');
    
    logger.info('Successfully added all updated_at columns');
  } catch (error) {
    logger.error('Error adding updated_at columns:', error);
    throw error;
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  console.log('Starting migration script...');
  addUpdatedAtColumns()
    .then(() => {
      console.log('Migration completed successfully');
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

export { addUpdatedAtColumns };