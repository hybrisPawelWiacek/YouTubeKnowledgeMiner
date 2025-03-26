import { createClient } from '@supabase/supabase-js'
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function verifySupabaseUser() {
  console.log('Attempting to verify Supabase user...');
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase environment variables not set. Please set SUPABASE_URL and SUPABASE_KEY.');
    process.exit(1);
  }
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // First sign in with the email and password
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'demolinks@gmail.com',
      password: 'testpassword',
    });
    
    if (signInError) {
      console.error('Error signing in to verify user:', signInError);
      
      // If the error is about email not being verified, we can try a workaround
      if (signInError.message.includes('Email not confirmed')) {
        console.log('Email not confirmed. Attempting alternative approach...');

        // Try to sign up again - this might trigger a new verification email
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: 'demolinks@gmail.com',
          password: 'testpassword',
          options: {
            data: {
              username: 'demolinks',
              full_name: 'Demo User'
            }
          }
        });

        if (signUpError) {
          if (signUpError.message.includes('already exists')) {
            console.log('User already exists in Supabase Auth. Check Supabase dashboard to confirm email manually.');
          } else {
            console.error('Error in alternate signup attempt:', signUpError);
          }
        } else {
          console.log('New verification email might have been sent.');
        }
      }
    } else {
      console.log('Successfully signed in!', signInData);
      console.log('User email appears to be verified.');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the function
verifySupabaseUser().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});