import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

async function registerSupabaseUser() {
  console.log('Registering user in Supabase...');
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase credentials not found in environment variables');
    process.exit(1);
  }
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Using regular signup instead of admin API
    const { data, error } = await supabase.auth.signUp({
      email: 'demolinks@gmail.com',
      password: 'testpassword',
      options: {
        data: {
          username: 'demolinks',
          full_name: 'Demo User'
        }
      }
    });
    
    if (error) {
      if (error.message.includes('already exists')) {
        console.log('User already exists in Supabase Auth');
      } else {
        console.error('Error creating Supabase user:', error);
      }
    } else {
      console.log('Supabase user created successfully (verification may be required):', data);
      
      // Check if we need to bypass email verification
      if (data.user && !data.user.email_confirmed_at) {
        console.log('Note: Email verification is required. In a development environment, you can log into your Supabase dashboard to confirm the email manually.');
      }
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the function
registerSupabaseUser().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});