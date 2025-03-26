import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * This script prepares a direct authentication mechanism that bypasses
 * Supabase's email verification requirements, making it easier to test
 * the application in development environments.
 * 
 * It both checks/creates a test user and outputs instructions for adding
 * a direct authentication route if needed.
 */
async function setupDirectLogin() {
  console.log('Setting up direct authentication for testing...');
  
  try {
    // 1. Check for existing test user
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, 'demouser'),
    });
    
    if (existingUser) {
      console.log('Test user found:', {
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
      });
    } else {
      // Create a test user if none exists
      const newUser = await db.insert(users).values({
        username: 'demouser',
        email: 'demouser@example.com',
        password: 'testpassword', // In a real app, this would be hashed
      }).returning();
      
      console.log('Created new test user:', {
        id: newUser[0].id,
        username: newUser[0].username,
        email: newUser[0].email,
      });
    }
    
    // 2. Output test credentials
    console.log('\n=== TEST USER CREDENTIALS ===');
    console.log('Username: demouser');
    console.log('Password: testpassword');
    console.log('===========================\n');
    
    // 3. Instructions for using the direct login approach
    console.log('To use direct authentication for testing:');
    console.log('1. Use these credentials in the login form');
    console.log('2. The application will first try Supabase authentication');
    console.log('3. If that fails, it will automatically fall back to direct database authentication\n');
    
    console.log('Done setting up direct authentication.');
  } catch (error) {
    console.error('Error setting up direct authentication:', error);
    process.exit(1);
  }
}

// Run the function
setupDirectLogin().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});