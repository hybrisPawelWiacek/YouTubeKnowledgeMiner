import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * This script creates a special admin user that bypasses authentication
 * in a demo environment by adding a persistent user to the database
 * with predictable credentials. 
 * 
 * NOTE: This approach is for testing purposes only and would NOT be 
 * suitable for production environments with real user data.
 */
async function createBypassUser() {
  console.log('Setting up test user bypass...');
  
  try {
    // Check if demo user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, 'demouser'),
    });
    
    if (existingUser) {
      console.log('Test user already exists:', existingUser);
      return existingUser;
    }
    
    // Create a demo user in the PostgreSQL database
    const demoUser = await db.insert(users).values({
      username: 'demouser',
      email: 'demouser@example.com',
      password: 'password123', // In a real app, this would be hashed
    }).returning();
    
    console.log('Created test user in database:', demoUser[0]);
    
    // Add a special environment variable for bypassing auth in development
    console.log('=== TEST USER CREDENTIALS ===');
    console.log('Username: demouser');
    console.log('Password: password123');
    console.log('===========================');
    console.log('');
    console.log('To use these credentials in development:');
    console.log('1. Login to the application with these credentials');
    console.log('2. The application will authenticate against the database directly');
    console.log('');
    
    return demoUser[0];
  } catch (error) {
    console.error('Error creating bypass user:', error);
    process.exit(1);
  }
}

// Run the function
createBypassUser().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});