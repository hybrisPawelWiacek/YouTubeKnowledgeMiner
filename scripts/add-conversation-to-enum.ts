import { db } from '../server/db';
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

dotenv.config();

/**
 * This script adds the 'conversation' value to the content_type enum
 * This allows the embeddings service to properly store conversation embeddings
 */
async function addConversationToEnum() {
  try {
    console.log('Adding "conversation" to content_type enum...');
    
    // Execute the ALTER TYPE command to add the new enum value
    await db.execute(sql`
      ALTER TYPE content_type ADD VALUE IF NOT EXISTS 'conversation';
    `);
    
    console.log('Successfully added "conversation" to content_type enum.');
    
    // Verify the enum values
    const result = await db.execute(sql`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE typname = 'content_type'
      ORDER BY enumsortorder;
    `);
    
    console.log('Current content_type enum values:');
    result.rows.forEach((row: any) => {
      console.log(`- ${row.enumlabel}`);
    });
    
  } catch (error) {
    console.error('Error updating content_type enum:', error);
    process.exit(1);
  }
}

// Run the migration
addConversationToEnum()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });