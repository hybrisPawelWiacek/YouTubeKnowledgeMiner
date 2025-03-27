import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';

/**
 * This script creates an anonymous user in the database that can be used
 * for all anonymous user operations that require a valid user_id
 */
export async function createAnonymousUser() {
  // Check if the anonymous user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.username, 'anonymous'))
    .execute();

  if (existingUser.length > 0) {
    console.log("Anonymous user already exists with ID:", existingUser[0].id);
    return existingUser[0].id;
  }

  // Generate a random password for the anonymous user
  const password = randomBytes(16).toString('hex');

  // Create the anonymous user
  const result = await db
    .insert(users)
    .values({
      username: 'anonymous',
      email: 'anonymous@example.com',
      password: password, // Random password that won't be used
      created_at: new Date(),
    })
    .returning();

  console.log("Created anonymous user with ID:", result[0].id);
  return result[0].id;
}

// Run this script directly
createAnonymousUser()
  .then((id) => {
    console.log("Anonymous user setup complete with ID:", id);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error creating anonymous user:", error);
    process.exit(1);
  });