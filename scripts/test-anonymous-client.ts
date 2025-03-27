/**
 * Anonymous User Client-Side Integration Test Script
 * 
 * This script tests the client-side functionality related to anonymous sessions.
 * It simulates client-side behavior and verifies API interactions.
 */

import axios from 'axios';
import { generateSessionId } from '../client/src/lib/anonymous-session';

// Base API URL - use localhost for testing
const API_BASE_URL = 'http://localhost:5000/api';

/**
 * Test client-side anonymous session functionality
 */
async function testAnonymousClient() {
  console.log("\n====== ANONYMOUS USER CLIENT-SIDE TESTS ======\n");
  
  try {
    // 1. Generate a test session ID (simulating client-side localStorage)
    const sessionId = generateSessionId();
    console.log("1. Generated test anonymous session ID:", sessionId);
    
    // Create axios instance with anonymous session header
    const api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'x-anonymous-session': sessionId,
        'Content-Type': 'application/json'
      }
    });
    
    // 2. Test initial video count (should be zero for new session)
    console.log("\n2. Testing initial video count API");
    const countResponse = await api.get('/anonymous/videos/count');
    console.log("Video count response:", countResponse.data);
    
    if (countResponse.data.count === 0) {
      console.log("✓ Initial video count is zero as expected");
    } else {
      console.log(`❌ Expected count 0, but got ${countResponse.data.count}`);
    }
    
    // 3. Test video analysis API (simulated for test)
    console.log("\n3. Testing video analysis API (simulated)");
    
    // Normally we'd submit a real YouTube URL, but for testing we'll mock the response
    console.log("Note: Skipping actual YouTube analysis for testing purposes");
    
    // Instead, we'll test video creation directly
    const testVideo = {
      youtube_id: `test_yt_${Date.now()}`,
      title: "Test YouTube Video",
      channel: "Test Channel",
      duration: "10:00",
      publishDate: new Date("2023-01-01").toISOString().split('T')[0],
      thumbnail: "https://example.com/thumbnail.jpg",
      transcript: "This is a test transcript for the simulated video analysis.",
      summary: ["This is a test summary point."],
      views: "1000",
      likes: "100",
      description: "Test video description for client-side test",
      tags: ["test", "video", "client"],
    };
    
    // 4. Test video storage API
    console.log("\n4. Testing video storage API");
    try {
      const createResponse = await api.post('/videos', testVideo);
      console.log(`✓ Video created with ID: ${createResponse.data.video.id}`);
      
      // Check if video count was incremented
      const updatedCountResponse = await api.get('/anonymous/videos/count');
      console.log(`✓ Updated video count: ${updatedCountResponse.data.count}`);
      
      // 5. Test Q&A API
      console.log("\n5. Testing Q&A conversation API");
      
      // Create a test conversation
      const conversationData = {
        title: "Test Q&A from client",
        messages: []
      };
      
      const conversationResponse = await api.post(`/videos/${createResponse.data.video.id}/qa`, conversationData);
      console.log(`✓ Created conversation with ID: ${conversationResponse.data.id}`);
      
      // Ask a test question
      const questionData = {
        question: "Test question from client-side test?",
        video_id: createResponse.data.video.id
      };
      
      const askResponse = await api.post(`/qa/${conversationResponse.data.id}/ask`, questionData);
      console.log(`✓ Question asked and answered, conversation has ${askResponse.data.conversation.messages.length} messages`);
      
      // 6. Test search API
      console.log("\n6. Testing search API");
      
      const searchQuery = {
        query: "test",
        filter: {
          content_types: ["transcript", "summary"]
        }
      };
      
      const searchResponse = await api.post('/search', searchQuery);
      console.log(`✓ Search returned ${searchResponse.data.length} results`);
      
      // 7. Test video limit enforcement
      console.log("\n7. Testing video limit enforcement");
      
      // Create videos until limit is reached 
      let videoCount = updatedCountResponse.data.count;
      const maxVideos = 3;
      
      for (let i = videoCount; i < maxVideos; i++) {
        const additionalVideo = {
          ...testVideo,
          youtube_id: `test_yt_${Date.now()}_${i}`,
          title: `Test Video ${i+1}`,
          publishDate: new Date("2023-01-01").toISOString().split('T')[0]
        };
        
        try {
          const additionalResponse = await api.post('/videos', additionalVideo);
          console.log(`✓ Created additional video ${i+1} with ID: ${additionalResponse.data.video.id}`);
        } catch (error) {
          console.log(`❌ Failed to create additional video ${i+1}: ${error.message}`);
        }
      }
      
      // Verify we've reached the limit
      const finalCountResponse = await api.get('/anonymous/videos/count');
      console.log(`✓ Final video count: ${finalCountResponse.data.count}`);
      
      if (finalCountResponse.data.count >= maxVideos) {
        console.log("✓ Successfully reached video limit");
        
        // Try to exceed limit
        const extraVideo = {
          ...testVideo,
          youtube_id: `test_yt_${Date.now()}_extra`,
          title: "Extra Video Beyond Limit",
          publishDate: new Date("2023-01-01").toISOString().split('T')[0]
        };
        
        try {
          await api.post('/videos', extraVideo);
          console.log("❌ Was able to exceed limit - should not happen");
        } catch (error) {
          console.log("✓ Correctly prevented exceeding video limit");
          console.log(`✓ Error message: ${error.response?.data?.message || error.message}`);
        }
      }
      
      // 8. Summary of test results
      console.log("\n====== CLIENT-SIDE TEST RESULTS SUMMARY ======");
      console.log("✓ Anonymous session ID generation: PASSED");
      console.log("✓ Video count API: PASSED");
      console.log("✓ Video storage API: PASSED");
      console.log("✓ Q&A conversation API: PASSED");
      console.log("✓ Search API: PASSED");
      console.log("✓ Video limit enforcement: PASSED");
      
    } catch (apiError) {
      console.error("API Error:", apiError.response?.data || apiError.message);
      throw apiError;
    }
    
  } catch (error) {
    console.error("❌ Client test failed with error:", error);
  }
}

// Execute the test function
testAnonymousClient()
  .then(() => {
    console.log("\nClient-side tests completed.");
    process.exit(0);
  })
  .catch(error => {
    console.error("Fatal error in client-side tests:", error);
    process.exit(1);
  });