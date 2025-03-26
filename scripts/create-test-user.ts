import { db } from "../server/db";
import { users } from "../shared/schema";
import { log } from "../server/vite";

async function createTestUser() {
  console.log('Creating test user...');
  
  try {
    // Check if pw@mail.com already exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, 'pw@mail.com')
    });

    if (existingUser) {
      console.log('Test user pw@mail.com already exists');
      return;
    }

    // Insert test user
    const result = await db.insert(users).values({
      username: 'testuser',
      password: 'testpassword',
      email: 'pw@mail.com'
    }).returning();

    console.log('Test user created successfully:', result[0]);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

// Run the function
createTestUser().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});