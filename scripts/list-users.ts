
import { db } from '../server/db';
import { users } from '../shared/schema';

async function listUsers() {
  try {
    console.log('Fetching all users from database...');
    const allUsers = await db.select().from(users);
    
    console.log(`Found ${allUsers.length} users in database`);
    
    allUsers.forEach(user => {
      console.log(`ID: ${user.id}, Username: ${user.username}, Email: ${user.email}`);
    });
    
  } catch (error) {
    console.error('Error fetching users:', error);
  } finally {
    process.exit(0);
  }
}

listUsers();
