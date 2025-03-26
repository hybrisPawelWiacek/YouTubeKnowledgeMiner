import { createClient } from '@supabase/supabase-js'
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function createAnonymousSession() {
  console.log('Creating anonymous Supabase session...');
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase environment variables not set. Please set SUPABASE_URL and SUPABASE_KEY.');
    process.exit(1);
  }
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Create an anonymous session with a Gmail domain which Supabase accepts
    const timestamp = Date.now();
    const { data, error } = await supabase.auth.signUp({
      email: `anonymous_${timestamp}@gmail.com`,
      password: `anonymous_${timestamp}`,
      options: {
        data: {
          username: `anonymous_${timestamp}`,
          full_name: 'Anonymous User'
        }
      }
    });
    
    if (error) {
      console.error('Error creating anonymous session:', error);
    } else {
      console.log('Anonymous session created successfully:', data);
      
      // Save the session information to use it later
      console.log('Auth Token:', data.session?.access_token);
      console.log('Refresh Token:', data.session?.refresh_token);
      console.log('');
      console.log('You can use these tokens to authenticate API requests by adding them to the Authorization header:');
      console.log('Bearer ' + data.session?.access_token);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the function
createAnonymousSession().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});