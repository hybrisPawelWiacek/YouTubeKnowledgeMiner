/**
 * A simplified test script focusing only on the Legacy method
 */
import { extractYoutubeId } from './server/services/youtube';
import * as fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

async function testLegacyMethod(videoUrl: string) {
  console.log(`\n🔍 TESTING LEGACY METHOD FOR: ${videoUrl}\n`);
  
  // Extract the YouTube ID
  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) {
    console.error('❌ Invalid YouTube URL or ID provided');
    return;
  }
  
  console.log(`📋 Extracted video ID: ${videoId}`);
  
  try {
    // Direct fetch approach using the YouTube transcript endpoint
    console.log('🔄 Fetching YouTube page...');
    const startTime = Date.now();
    
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const html = response.data;
    console.log(`✅ Fetched YouTube page successfully (${html.length} bytes)`);
    
    // Save a sample of the HTML for debugging
    const htmlSample = html.substring(0, 5000) + '... [truncated]';
    const htmlPath = path.join(logDir, `youtube-page-${videoId}.txt`);
    fs.writeFileSync(htmlPath, htmlSample);
    console.log(`💾 Saved HTML sample to: ${htmlPath}`);
    
    // Use cheerio to parse the HTML
    console.log('🔍 Parsing HTML with cheerio...');
    const $ = cheerio.load(html);
    
    // Extract script content from page
    console.log('🔍 Extracting script content...');
    const scriptContent = $('script').map((i, el) => $(el).html()).get().join('');
    
    // Look for captionTracks data in the script content
    console.log('🔍 Searching for captionTracks...');
    const captionRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = scriptContent.match(captionRegex);
    
    if (!match || !match[1]) {
      console.error('❌ No caption tracks found in script content');
      
      // Try to find any references to captions/subtitles
      const subtitleRefs = scriptContent.match(/subtitle|caption|transcript/gi);
      if (subtitleRefs && subtitleRefs.length > 0) {
        console.log(`ℹ️ Found ${subtitleRefs.length} references to captions/subtitles, but couldn't extract tracks`);
      }
      
      return false;
    }
    
    console.log('✅ Found captionTracks pattern in page!');
    
    // Parse the JSON data
    const captionTracksJson = match[1].replace(/\\"/g, '"').replace(/\\u0026/g, '&');
    console.log(`📋 Extracted captionTracks JSON (${captionTracksJson.length} bytes)`);
    
    try {
      const captionTracks = JSON.parse(captionTracksJson);
      
      if (captionTracks.length === 0) {
        console.error('❌ Caption tracks array is empty');
        return false;
      }
      
      console.log(`✅ Found ${captionTracks.length} caption tracks`);
      
      // Display available tracks
      captionTracks.forEach((track: any, index: number) => {
        console.log(`🔤 Track ${index + 1}: Language=${track.languageCode || track.language || 'unknown'}, Name=${track.name?.simpleText || 'unnamed'}`);
      });
      
      // Get the first available track (preferably English)
      let selectedTrack = captionTracks.find((track: any) => 
        track.languageCode === 'en' || track.language === 'English'
      );
      
      // If no English track, just use the first one
      if (!selectedTrack) {
        console.log('ℹ️ No English track found, using first available track');
        selectedTrack = captionTracks[0];
      } else {
        console.log('✅ Selected English track');
      }
      
      if (!selectedTrack || !selectedTrack.baseUrl) {
        console.error('❌ Selected track has no baseUrl');
        return false;
      }
      
      console.log('✅ Found valid baseUrl for transcript!');
      console.log(`🔗 Transcript URL found (length: ${selectedTrack.baseUrl.length} characters)`);
      
      // Fetch the transcript XML
      console.log('🔄 Fetching transcript XML...');
      const transcriptResponse = await axios.get(selectedTrack.baseUrl);
      const transcriptXml = transcriptResponse.data;
      
      // Save the XML for debugging
      const xmlPath = path.join(logDir, `transcript-xml-${videoId}.xml`);
      fs.writeFileSync(xmlPath, transcriptXml);
      console.log(`💾 Saved transcript XML to: ${xmlPath}`);
      
      // Parse the XML to extract transcript text
      console.log('🔍 Parsing transcript XML...');
      const transcriptData = parseTranscriptXml(transcriptXml);
      
      const endTime = Date.now();
      const timeSeconds = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log(`✅ SUCCESS! Transcript extracted in ${timeSeconds}s`);
      
      // Display sample of transcript
      console.log('\n📝 TRANSCRIPT SAMPLE:');
      console.log('-------------------');
      
      const sampleSize = Math.min(5, transcriptData.length);
      for (let i = 0; i < sampleSize; i++) {
        const segment = transcriptData[i];
        console.log(`[${segment.startTime}] ${segment.text}`);
      }
      
      if (transcriptData.length > sampleSize) {
        console.log(`... and ${transcriptData.length - sampleSize} more segments`);
      }
      
      return true;
      
    } catch (parseError) {
      console.error('❌ Error parsing caption tracks JSON:', parseError);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error in legacy method:', error);
    return false;
  }
}

// Helper function to parse transcript XML
function parseTranscriptXml(xmlData: string) {
  const segments: any[] = [];
  
  // Simplistic XML parsing - in production use a proper XML parser
  const textRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>(.*?)<\/text>/g;
  
  let match;
  while ((match = textRegex.exec(xmlData)) !== null) {
    const startSeconds = parseFloat(match[1]);
    const durationSeconds = parseFloat(match[2]);
    const text = decodeHtmlEntities(match[3]);
    
    const minutes = Math.floor(startSeconds / 60);
    const seconds = Math.floor(startSeconds % 60);
    const startTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    segments.push({
      text,
      startTime,
      startSeconds,
      durationSeconds
    });
  }
  
  return segments;
}

// Helper function to decode HTML entities
function decodeHtmlEntities(html: string): string {
  const entities: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };
  
  return html.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (match) => entities[match]);
}

// Run the test with the provided YouTube URL
const videoUrl = 'https://youtu.be/BvCOZrqGyNU?si=mcQYgsigwY2xfDr1';
testLegacyMethod(videoUrl);