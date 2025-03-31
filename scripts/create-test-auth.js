// This script creates a test user account and logs in to get an auth token
import axios from 'axios';
import fs from 'fs';

async function createTestUserAndAuth() {
  const testUser = {
    username: 'testuser_' + Date.now(),
    email: 'test_' + Date.now() + '@example.com',
    password: 'Password123!'
  };
  
  console.log('Creating test user:', testUser.username);
  
  try {
    // Register the user
    const registerResponse = await axios.post('http://localhost:5000/api/auth/register', testUser);
    console.log('Registration response:', registerResponse.data);
    
    // Login to get auth token
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    
    if (loginResponse.data.success) {
      console.log('Login successful!');
      
      // Extract the auth token from the cookies
      const cookies = loginResponse.headers['set-cookie'];
      if (cookies) {
        const authCookie = cookies.find(cookie => cookie.startsWith('auth_session='));
        if (authCookie) {
          const authToken = authCookie.split(';')[0].split('=')[1];
          console.log('Auth token:', authToken);
          
          // Save the auth token to file
          fs.writeFileSync('auth_session_token.txt', authToken);
          console.log('Auth token saved to auth_session_token.txt');
          
          return authToken;
        }
      }
      
      console.log('No auth token found in response cookies');
    } else {
      console.log('Login failed:', loginResponse.data);
    }
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
  
  return null;
}

createTestUserAndAuth();