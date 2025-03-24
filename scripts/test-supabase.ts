import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

console.log(`Supabase URL exists: ${Boolean(SUPABASE_URL)}`);
console.log(`Supabase Key exists: ${Boolean(SUPABASE_KEY)}`);

async function testSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase credentials not found in environment variables');
    return;
  }
  
  console.log('Creating Supabase client...');
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Test a simple query to the 'users' table
    console.log('Testing a simple query...');
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
      
    if (testError) {
      console.error(`Error connecting to Supabase: ${testError.message}`);
    } else {
      console.log('Successfully connected to Supabase database');
      console.log('Test data:', testData);
    }
    
    // Check if embeddings table exists
    console.log('Checking if embeddings table exists...');
    const { data: embedData, error: embedError } = await supabase
      .from('embeddings')
      .select('id')
      .limit(1);
      
    if (embedError) {
      console.error(`Error accessing embeddings table: ${embedError.message}`);
    } else {
      console.log('Successfully accessed embeddings table');
      console.log('Embeddings data:', embedData);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testSupabase().catch(console.error);