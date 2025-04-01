import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSummary, isOpenAIConfigured } from './openai';
import { log } from '../vite';
import * as cheerio from 'cheerio';
import { createLogger } from '../services/logger';
import fs from 'fs';
import * as child_process from 'child_process';
import { extractYoutubeTranscript as puppeteerExtractTranscript } from '../../scripts/puppeteer-transcript';

// Create a dedicated logger for YouTube service
const youtubeLogger = createLogger('youtube');

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube API key from environment variables
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// Function to process a YouTube video and get its metadata
export async function processYoutubeVideo(videoId: string) {
  try {
    // Extract YouTube ID from URL if a full URL was provided
    const extractedId = extractYoutubeId(videoId);
    if (!extractedId) {
      throw new Error('Invalid YouTube URL. Please provide a valid YouTube video URL.');
    }
    
    // If no YouTube API key is available, use a fallback approach
    if (!YOUTUBE_API_KEY) {
      console.warn('YouTube API key is not set. Using fallback method to extract video info.');
      return handleVideoWithoutAPIKey(extractedId);
    }
    
    console.log(`Fetching metadata for video ID: ${extractedId}`);
    
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?id=${extractedId}&key=${YOUTUBE_API_KEY}&part=snippet,contentDetails,statistics`
    );
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Video not found. The video ID may be invalid or the video might have been removed.');
    }
    
    const video = response.data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;
    const statistics = video.statistics || {}; // Add statistics (views, likes, etc.)
    
    // Format duration from ISO 8601 to readable format
    const duration = formatDuration(contentDetails.duration);
    
    // Format publish date
    const publishDate = formatPublishDate(snippet.publishedAt);
    
    // Process view count, like count, and comment count
    const viewCount = statistics.viewCount ? parseInt(statistics.viewCount).toLocaleString() : 'N/A';
    const likeCount = statistics.likeCount ? parseInt(statistics.likeCount).toLocaleString() : 'N/A';
    
    // Get description (truncated if too long)
    const description = snippet.description ? 
      (snippet.description.length > 300 ? snippet.description.substring(0, 300) + '...' : snippet.description) 
      : 'No description available';
    
    // Get tags
    const tags = snippet.tags || [];
    
    // Get the best available thumbnail
    const thumbnail = getBestThumbnail(snippet.thumbnails);
    
    console.log(`Successfully fetched metadata for video: ${snippet.title}`);
    
    // Fetch transcript and generate summary
    let transcript = null;
    let summary = null;
    
    try {
      console.log("Fetching transcript for video...");
      transcript = await getYoutubeTranscript(videoId);
      console.log(`Transcript fetch result: ${transcript ? 'SUCCESS' : 'FAILED'}`);
      
      if (transcript && isOpenAIConfigured()) {
        console.log("OpenAI is configured. Generating summary from transcript...");
        summary = await generateTranscriptSummary(transcript, snippet.title);
        console.log(`Summary generation result: ${summary ? 'SUCCESS' : 'FAILED'}`);
      } else {
        console.log(`Skipping summary generation. Transcript available: ${!!transcript}, OpenAI configured: ${isOpenAIConfigured()}`);
      }
    } catch (transcriptError) {
      console.error("Error during transcript/summary generation:", transcriptError);
      // Don't throw an error here, just continue without transcript
    }
    
    return {
      youtubeId: extractedId, // Use the extracted ID for consistency
      title: snippet.title,
      channel: snippet.channelTitle,
      thumbnail,
      duration,
      publishDate,
      url: `https://www.youtube.com/watch?v=${extractedId}`,
      description,
      tags,
      viewCount,
      likeCount,
      transcript,
      summary
    };
  } catch (error) {
    console.error('Error fetching YouTube video metadata:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error('YouTube API key is invalid or has reached its quota limit. Please check your API key.');
      } else if (error.message.includes('404')) {
        throw new Error('Video not found. Please check the YouTube URL and try again.');
      }
    }
    
    throw new Error('Failed to fetch video metadata. Please try again later.');
  }
}

// Helper function to get the best available thumbnail
function getBestThumbnail(thumbnails: any): string {
  // Try to get the highest quality thumbnail available
  if (thumbnails.maxres) return thumbnails.maxres.url;
  if (thumbnails.high) return thumbnails.high.url;
  if (thumbnails.medium) return thumbnails.medium.url;
  if (thumbnails.standard) return thumbnails.standard.url;
  if (thumbnails.default) return thumbnails.default.url;
  
  // Fallback to a placeholder if no thumbnails are available
  return 'https://via.placeholder.com/480x360?text=No+Thumbnail';
}

// Define the structure of a transcript item as returned by youtube-transcript-api
interface TranscriptItem {
  text: string;
  start: number;
  duration: number;
}

// Main function to get transcript from YouTube video
// This calls three different methods in order until one succeeds
export async function getYoutubeTranscript(videoId: string) {
  try {
    // Initialize enhanced logging
    youtubeLogger.info(`[TRANSCRIPT] Starting transcript extraction for video ID: ${videoId}`);
    
    // Create a log directory if it doesn't exist
    const logDir = './logs/transcript';
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (mkdirError) {
      youtubeLogger.error(`[TRANSCRIPT] Error creating log directory: ${mkdirError}`);
    }
    
    // Extract the YouTube ID if a full URL was provided
    const extractedId = extractYoutubeId(videoId);
    if (!extractedId) {
      youtubeLogger.error(`[TRANSCRIPT] Invalid YouTube URL or ID: ${videoId}`);
      throw new Error('Invalid YouTube URL or ID');
    }
    
    youtubeLogger.info(`[TRANSCRIPT] Extracted YouTube ID: ${extractedId}`);
    
    // Try each method in sequence until one succeeds
    
    // Method 1: Try legacy method
    const legacyTranscript = await tryLegacyMethod(extractedId);
    if (legacyTranscript) {
      return legacyTranscript;
    }
    
    // Method 2: Try YouTube Transcript API via helper script
    const apiTranscript = await tryTranscriptApi(extractedId);
    if (apiTranscript) {
      return apiTranscript;
    }
    
    // Method 3: Try Puppeteer as final fallback
    return await getPuppeteerYoutubeTranscript(extractedId);
    
  } catch (error) {
    youtubeLogger.error(`[TRANSCRIPT] Error in getYoutubeTranscript: ${error}`);
    
    if (error instanceof Error) {
      youtubeLogger.error(`[TRANSCRIPT] Error stack: ${error.stack}`);
      
      // Provide more specific error messages
      if (error.message.includes('captions') || error.message.includes('subtitles')) {
        return null; // Return null instead of throwing for caption-related errors
      } else if (error.message.includes('network')) {
        throw new Error('Network error while fetching transcript. Please try again later.');
      } else if (error.message.includes('language')) {
        throw new Error('Transcript is not available in a supported language.');
      }
    }
    
    return null; // Return null instead of throwing to avoid breaking the flow
  }
}

// Method 1: Legacy method for transcript extraction
async function tryLegacyMethod(videoId: string): Promise<string | null> {
  youtubeLogger.info(`[TRANSCRIPT] Attempting to use legacy method as primary approach`);
  try {
    const legacyTranscript = await getLegacyYoutubeTranscript(videoId);
    if (legacyTranscript) {
      youtubeLogger.info(`[TRANSCRIPT] Successfully retrieved transcript with legacy method`);
      return legacyTranscript;
    } else {
      youtubeLogger.info(`[TRANSCRIPT] Legacy method returned null, moving to next method`);
      return null;
    }
  } catch (legacyError) {
    youtubeLogger.error(`[TRANSCRIPT] Legacy method failed: ${legacyError}`);
    return null;
  }
}

// Method 2: YouTube Transcript API via helper script
async function tryTranscriptApi(videoId: string): Promise<string | null> {
  youtubeLogger.info(`[TRANSCRIPT] Attempting to use youtube-transcript-api via helper script`);
  try {
    // Use Node.js child_process to run our CommonJS helper script
    youtubeLogger.info(`[TRANSCRIPT] Running CJS helper script with node`);
    
    const nodeCommand = `node scripts/get-transcript.cjs ${videoId}`;
    youtubeLogger.info(`[TRANSCRIPT] Command: ${nodeCommand}`);
    
    // Execute the command and get the output
    const output = child_process.execSync(nodeCommand, {
      encoding: 'utf-8',
      timeout: 15000, // 15-second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    youtubeLogger.info(`[TRANSCRIPT] Successfully executed transcript helper script`);
    
    // Parse the output as JSON to get the transcript items
    const result = JSON.parse(output);
    
    if (result === null) {
      youtubeLogger.error(`[TRANSCRIPT] Helper script returned null result`);
      return null;
    }
    
    // An empty array means the transcript was attempted but failed
    if (Array.isArray(result) && result.length === 0) {
      youtubeLogger.error(`[TRANSCRIPT] Helper script returned empty array - transcript unavailable`);
      return null;
    }
    
    youtubeLogger.info(`[TRANSCRIPT] Successfully retrieved transcript with API`);
    
    // Use the result directly - convert to our TranscriptItem format
    const transcriptItems: TranscriptItem[] = result.map((item: any) => ({
      text: item.text,
      start: item.start,
      duration: item.dur || item.duration || 0
    }));
    youtubeLogger.info(`[TRANSCRIPT] Successfully received transcript with ${transcriptItems.length} items`);
    
    // Save transcript data for debugging
    try {
      const logDir = './logs/transcript';
      fs.writeFileSync(`${logDir}/transcript-api-${videoId}.json`, JSON.stringify(transcriptItems, null, 2));
      youtubeLogger.info(`[TRANSCRIPT] Saved transcript data to ${logDir}/transcript-api-${videoId}.json`);
    } catch (writeError) {
      youtubeLogger.error(`[TRANSCRIPT] Error saving transcript data: ${writeError}`);
    }
    
    // Format the transcript with timestamps
    youtubeLogger.info(`[TRANSCRIPT] Formatting transcript with timestamps`);
    const formattedTranscript = transcriptItems.map((item: TranscriptItem, index: number) => {
      const timestamp = formatTimestamp(item.start);
      // Add data attributes for citation functionality
      return `<p class="mb-3 transcript-line" data-timestamp="${item.start}" data-duration="${item.duration}" data-index="${index}">
        <span class="text-gray-400 timestamp-marker" data-seconds="${item.start}">[${timestamp}]</span> 
        <span class="transcript-text">${item.text}</span>
      </p>`;
    }).join('');
    
    youtubeLogger.info(`[TRANSCRIPT] Successfully formatted transcript, length: ${formattedTranscript.length} characters`);
    
    // Log a sample of the formatted transcript
    const formattedSample = formattedTranscript.substring(0, 500) + '... [truncated]';
    youtubeLogger.info(`[TRANSCRIPT] Formatted transcript sample: ${formattedSample}`);
    
    return formattedTranscript;
    
  } catch (apiError) {
    youtubeLogger.error(`[TRANSCRIPT] Error with youtube-transcript-api: ${apiError}`);
    return null;
  }
}

/**
 * Puppeteer-based method for extracting YouTube transcripts
 * This uses browser automation to interact with YouTube's UI and extract transcripts
 */
async function getPuppeteerYoutubeTranscript(videoId: string): Promise<string | null> {
  try {
    youtubeLogger.info(`[TRANSCRIPT] Using Puppeteer method for video ID: ${videoId}`);
    const logDir = './logs/transcript';
    
    // Ensure log directory exists
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (mkdirError) {
      youtubeLogger.error(`[TRANSCRIPT] Error creating log directory: ${mkdirError}`);
    }
    
    // Use the Puppeteer-based extractYoutubeTranscript function
    youtubeLogger.info(`[TRANSCRIPT] Starting Puppeteer extraction for video: ${videoId}`);
    const transcriptSegments = await puppeteerExtractTranscript(videoId);
    
    if (!transcriptSegments || transcriptSegments.length === 0) {
      youtubeLogger.error(`[TRANSCRIPT] Puppeteer extraction returned no transcript segments`);
      return null;
    }
    
    youtubeLogger.info(`[TRANSCRIPT] Successfully extracted ${transcriptSegments.length} transcript segments with Puppeteer`);
    
    // Save transcript data for debugging
    try {
      fs.writeFileSync(`${logDir}/transcript-puppeteer-${videoId}.json`, JSON.stringify(transcriptSegments, null, 2));
      youtubeLogger.info(`[TRANSCRIPT] Saved Puppeteer transcript data to ${logDir}/transcript-puppeteer-${videoId}.json`);
    } catch (writeError) {
      youtubeLogger.error(`[TRANSCRIPT] Error saving Puppeteer transcript data: ${writeError}`);
    }
    
    // Format the transcript with timestamps
    youtubeLogger.info(`[TRANSCRIPT] Formatting Puppeteer transcript with timestamps`);
    const formattedTranscript = transcriptSegments.map((item, index) => {
      // Add data attributes for citation functionality
      return `<p class="mb-3 transcript-line" data-timestamp="${item.startSeconds}" data-duration="0" data-index="${index}">
        <span class="text-gray-400 timestamp-marker" data-seconds="${item.startSeconds}">[${item.startTime}]</span> 
        <span class="transcript-text">${item.text}</span>
      </p>`;
    }).join('');
    
    youtubeLogger.info(`[TRANSCRIPT] Successfully formatted Puppeteer transcript, length: ${formattedTranscript.length} characters`);
    
    // Log a sample of the formatted transcript
    const formattedSample = formattedTranscript.substring(0, 500) + '... [truncated]';
    youtubeLogger.info(`[TRANSCRIPT] Formatted Puppeteer transcript sample: ${formattedSample}`);
    
    return formattedTranscript;
    
  } catch (error) {
    youtubeLogger.error(`[TRANSCRIPT] Error in Puppeteer transcript extraction: ${error}`);
    if (error instanceof Error) {
      youtubeLogger.error(`[TRANSCRIPT] Error stack: ${error.stack}`);
    }
    return null; // Return null instead of throwing to avoid breaking the flow
  }
}

// Legacy method for getting YouTube transcript (kept for backwards compatibility)
async function getLegacyYoutubeTranscript(videoId: string) {
  try {
    youtubeLogger.info(`[TRANSCRIPT] Using legacy method for video ID: ${videoId}`);
    const logDir = './logs/transcript';
    
    // Direct fetch approach using the YouTube transcript endpoint
    youtubeLogger.info(`[TRANSCRIPT] Fetching YouTube page for video: ${videoId}`);
    let response;
    try {
      response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      youtubeLogger.info(`[TRANSCRIPT] Successfully fetched YouTube page, status: ${response.status}`);
    } catch (error: any) {
      youtubeLogger.error(`[TRANSCRIPT] Error fetching YouTube page: ${error}`);
      // Log more details about the error
      if (error.response) {
        youtubeLogger.error(`[TRANSCRIPT] Response status: ${error.response.status}`);
        youtubeLogger.error(`[TRANSCRIPT] Response headers: ${JSON.stringify(error.response.headers)}`);
      }
      throw new Error(`Network error while fetching YouTube page: ${error.message}`);
    }
    
    const html = response.data;
    
    // Save a sample of the HTML for debugging
    try {
      const htmlSample = html.substring(0, 5000) + '... [truncated]';
      fs.writeFileSync(`${logDir}/youtube-page-${videoId}.txt`, htmlSample);
      youtubeLogger.info(`[TRANSCRIPT] Saved HTML sample to ${logDir}/youtube-page-${videoId}.txt`);
    } catch (writeError) {
      youtubeLogger.error(`[TRANSCRIPT] Error saving HTML sample: ${writeError}`);
    }
    
    // Use cheerio to parse the HTML
    youtubeLogger.info(`[TRANSCRIPT] Parsing HTML with cheerio`);
    const $ = cheerio.load(html);
    
    // Extract the transcript data using patterns found in YouTube pages
    youtubeLogger.info(`[TRANSCRIPT] Extracting script content from page`);
    const scriptContent = $('script').map((i, el) => $(el).html()).get().join('');
    
    // Save script content for debugging
    try {
      const scriptSample = scriptContent.substring(0, 10000) + '... [truncated]';
      fs.writeFileSync(`${logDir}/script-content-${videoId}.txt`, scriptSample);
      youtubeLogger.info(`[TRANSCRIPT] Saved script content sample to ${logDir}/script-content-${videoId}.txt`);
    } catch (writeError) {
      youtubeLogger.error(`[TRANSCRIPT] Error saving script content sample: ${writeError}`);
    }
    
    // Look for the captionTracks data in the script content
    youtubeLogger.info(`[TRANSCRIPT] Searching for captionTracks pattern in script content`);
    const captionRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = scriptContent.match(captionRegex);
    
    if (!match || !match[1]) {
      youtubeLogger.error(`[TRANSCRIPT] No caption tracks found in script content`);
      
      // Try to log some context around where we would expect to find captions
      const contextSearch = scriptContent.indexOf('caption');
      if (contextSearch > -1) {
        const contextStart = Math.max(0, contextSearch - 200);
        const contextEnd = Math.min(scriptContent.length, contextSearch + 200);
        const context = scriptContent.substring(contextStart, contextEnd);
        youtubeLogger.info(`[TRANSCRIPT] Context around 'caption' keyword: ${context}`);
      }
      
      throw new Error('No captions available for this video. The video might not have subtitles.');
    }
    
    youtubeLogger.info(`[TRANSCRIPT] Found captionTracks pattern, extracting data`);
    
    // Parse the JSON data
    const captionTracksJson = match[1].replace(/\\"/g, '"').replace(/\\u0026/g, '&');
    youtubeLogger.info(`[TRANSCRIPT] Extracted captionTracks JSON: ${captionTracksJson.substring(0, 200)}...`);
    
    try {
      youtubeLogger.info(`[TRANSCRIPT] Parsing captionTracks JSON`);
      const captionTracks = JSON.parse(captionTracksJson);
      
      if (captionTracks.length === 0) {
        youtubeLogger.error(`[TRANSCRIPT] Caption tracks array is empty`);
        throw new Error('No caption tracks available for this video.');
      }
      
      youtubeLogger.info(`[TRANSCRIPT] Found ${captionTracks.length} caption tracks`);
      
      // Log available tracks for debugging
      captionTracks.forEach((track: any, index: number) => {
        youtubeLogger.info(`[TRANSCRIPT] Track ${index + 1}: Language=${track.languageCode || track.language || 'unknown'}, Name=${track.name?.simpleText || 'unnamed'}`);
      });
      
      // Get the first available track (preferably English)
      youtubeLogger.info(`[TRANSCRIPT] Selecting preferred caption track (English if available)`);
      let selectedTrack = captionTracks.find((track: any) => 
        track.languageCode === 'en' || track.language === 'English'
      );
      
      // If no English track, just use the first one
      if (!selectedTrack) {
        youtubeLogger.info(`[TRANSCRIPT] No English track found, using first available track`);
        selectedTrack = captionTracks[0];
      } else {
        youtubeLogger.info(`[TRANSCRIPT] Selected English track`);
      }
      
      if (!selectedTrack || !selectedTrack.baseUrl) {
        youtubeLogger.error(`[TRANSCRIPT] Selected track has no baseUrl`);
        throw new Error('Could not find a valid caption track.');
      }
      
      // Log the selected track details
      youtubeLogger.info(`[TRANSCRIPT] Selected track details: ${JSON.stringify({
        languageCode: selectedTrack.languageCode,
        language: selectedTrack.language,
        name: selectedTrack.name?.simpleText,
        baseUrlLength: selectedTrack.baseUrl.length
      })}`);
      
      // Save baseUrl for debugging
      try {
        fs.writeFileSync(`${logDir}/baseUrl-${videoId}.txt`, selectedTrack.baseUrl);
        youtubeLogger.info(`[TRANSCRIPT] Saved baseUrl to ${logDir}/baseUrl-${videoId}.txt`);
      } catch (writeError) {
        youtubeLogger.error(`[TRANSCRIPT] Error saving baseUrl: ${writeError}`);
      }
      
      // Fetch the transcript XML
      youtubeLogger.info(`[TRANSCRIPT] Fetching transcript XML from baseUrl`);
      let transcriptResponse;
      try {
        transcriptResponse = await axios.get(selectedTrack.baseUrl);
        youtubeLogger.info(`[TRANSCRIPT] Successfully fetched transcript XML, status: ${transcriptResponse.status}`);
      } catch (error: any) {
        youtubeLogger.error(`[TRANSCRIPT] Error fetching transcript XML: ${error}`);
        throw new Error(`Failed to fetch transcript XML: ${error.message}`);
      }
      
      const transcriptData = transcriptResponse.data;
      
      // Save transcript data for debugging
      try {
        fs.writeFileSync(`${logDir}/transcript-xml-${videoId}.txt`, typeof transcriptData === 'string' ? transcriptData : JSON.stringify(transcriptData));
        youtubeLogger.info(`[TRANSCRIPT] Saved transcript XML to ${logDir}/transcript-xml-${videoId}.txt`);
      } catch (writeError) {
        youtubeLogger.error(`[TRANSCRIPT] Error saving transcript XML: ${writeError}`);
      }
      
      // Parse the transcript XML data
      youtubeLogger.info(`[TRANSCRIPT] Parsing transcript XML data`);
      const transcriptItems = parseTranscriptXml(transcriptData);
      
      if (transcriptItems.length === 0) {
        youtubeLogger.error(`[TRANSCRIPT] Transcript data was parsed but no items were found`);
        throw new Error('Transcript data was empty or could not be parsed.');
      }
      
      youtubeLogger.info(`[TRANSCRIPT] Successfully parsed ${transcriptItems.length} transcript items`);
      
      // Log a sample of transcript items
      const sampleItems = transcriptItems.slice(0, 3);
      youtubeLogger.info(`[TRANSCRIPT] Sample of transcript items: ${JSON.stringify(sampleItems)}`);
      
      // Format the transcript with timestamps
      youtubeLogger.info(`[TRANSCRIPT] Formatting transcript with timestamps`);
      const formattedTranscript = transcriptItems.map((item: any, index: number) => {
        const timestamp = formatTimestamp(item.start);
        // Add data attributes for citation functionality
        return `<p class="mb-3 transcript-line" data-timestamp="${item.start}" data-duration="${item.duration}" data-index="${index}">
          <span class="text-gray-400 timestamp-marker" data-seconds="${item.start}">[${timestamp}]</span> 
          <span class="transcript-text">${item.text}</span>
        </p>`;
      }).join('');
      
      youtubeLogger.info(`[TRANSCRIPT] Successfully formatted transcript, length: ${formattedTranscript.length} characters`);
      
      // Log a sample of the formatted transcript
      const formattedSample = formattedTranscript.substring(0, 500) + '... [truncated]';
      youtubeLogger.info(`[TRANSCRIPT] Formatted transcript sample: ${formattedSample}`);
      
      return formattedTranscript;
      
    } catch (parseError) {
      youtubeLogger.error(`[TRANSCRIPT] Error parsing caption tracks: ${parseError}`);
      if (parseError instanceof Error) {
        youtubeLogger.error(`[TRANSCRIPT] Parse error details: ${parseError.stack}`);
      }
      throw new Error('Failed to parse caption data.');
    }
    
  } catch (error) {
    youtubeLogger.error(`[TRANSCRIPT] Error in legacy transcript extraction: ${error}`);
    if (error instanceof Error) {
      youtubeLogger.error(`[TRANSCRIPT] Error stack: ${error.stack}`);
    }
    return null; // Return null instead of throwing to avoid breaking the flow
  }
}

// Function to generate summary from transcript using OpenAI
export async function generateTranscriptSummary(transcript: string, videoTitle: string): Promise<string[] | null> {
  try {
    // Remove HTML from transcript to get clean text for the AI
    const plainTranscript = transcript.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (!isOpenAIConfigured()) {
      log('OpenAI API key not configured. Skipping summary generation.', 'youtube');
      return null;
    }
    
    // Generate summary using OpenAI
    log(`Generating summary for video: ${videoTitle}`, 'youtube');
    const summaryPoints = await generateSummary(plainTranscript, videoTitle);
    log(`Successfully generated ${summaryPoints.length} summary points`, 'youtube');
    
    return summaryPoints;
  } catch (error) {
    log(`Error generating summary: ${error}`, 'youtube');
    return null; // Return null instead of throwing to avoid breaking the flow
  }
}

// Helper function to parse the XML transcript data
function parseTranscriptXml(xmlData: string) {
  // Simple XML parser for the transcript format
  const transcriptItems = [];
  const regex = /<text start="([\d.]+)" dur="([\d.]+)".*?>(.*?)<\/text>/g;
  
  let match;
  while ((match = regex.exec(xmlData)) !== null) {
    transcriptItems.push({
      start: parseFloat(match[1]),
      duration: parseFloat(match[2]),
      text: decodeHtmlEntities(match[3])
    });
  }
  
  return transcriptItems;
}

// Helper function to decode HTML entities
function decodeHtmlEntities(html: string): string {
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'"
  };
  
  return html.replace(/&lt;|&gt;|&amp;|&quot;|&#39;/g, match => entities[match] || match);
}

// Helper function to format ISO 8601 duration to human-readable format
function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';
  
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const seconds = match[3] ? parseInt(match[3]) : 0;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Helper function to format publish date
function formatPublishDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Helper function to format timestamp
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Extract YouTube video ID from various URL formats or standalone ID
 * 
 * This function handles various YouTube URL formats and extracts the video ID:
 * - Standard URLs: https://www.youtube.com/watch?v=VIDEO_ID
 * - Short URLs: https://youtu.be/VIDEO_ID
 * - Embed URLs: https://www.youtube.com/embed/VIDEO_ID
 * - Short format: https://www.youtube.com/shorts/VIDEO_ID
 * - Direct IDs: If the input is already a valid 11-character YouTube ID
 *
 * @param url - The YouTube URL or ID to extract from
 * @returns The extracted YouTube video ID, or null if invalid
 */
export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  
  // If the input is already just an ID (exactly 11 characters of letters, numbers, underscore, and dash)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }
  
  // Extract from various YouTube URL formats
  const regexPatterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:&.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\?.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\?.+)?/
  ];
  
  for (const pattern of regexPatterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // If we get here, the input isn't a valid YouTube URL or ID
  return null;
}

/**
 * Fallback method to handle videos when no YouTube API key is available
 * This uses web scraping to extract basic video information
 */
async function handleVideoWithoutAPIKey(videoId: string) {
  try {
    console.log(`Using fallback method to extract info for video ID: ${videoId}`);
    
    // Fetch the YouTube watch page
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = response.data;
    
    // Extract title using regex
    const titleRegex = /<title>(.*?)<\/title>/;
    const titleMatch = html.match(titleRegex);
    const fullTitle = titleMatch ? titleMatch[1] : 'Untitled Video';
    // Remove " - YouTube" from the end of the title
    const title = fullTitle.replace(/ - YouTube$/, '');
    
    // Extract channel name (this is approximate and may not always work)
    const channelRegex = /"channelName":"([^"]+)"/;
    const channelMatch = html.match(channelRegex);
    const channel = channelMatch ? channelMatch[1] : 'Unknown Channel';
    
    // Try to extract thumbnail URL
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    
    // Get transcript for summary generation
    let transcript = null;
    let summary = null;
    
    try {
      console.log("Fetching transcript for video in fallback method...");
      transcript = await getYoutubeTranscript(videoId);
      console.log(`Fallback transcript fetch result: ${transcript ? 'SUCCESS' : 'FAILED'}`);
      
      if (transcript && isOpenAIConfigured()) {
        console.log("OpenAI is configured. Generating summary from transcript in fallback method...");
        summary = await generateTranscriptSummary(transcript, title);
        console.log(`Fallback summary generation result: ${summary ? 'SUCCESS' : 'FAILED'}`);
      } else {
        console.log(`Skipping fallback summary. Transcript: ${!!transcript}, OpenAI: ${isOpenAIConfigured()}`);
      }
    } catch (error) {
      console.error('Error during fallback transcript/summary:', error);
    }
    
    // Return a simplified video object
    return {
      youtubeId: videoId, // Already contains just the ID due to the extractedId check at the beginning of the processYoutubeVideo function
      title,
      channel,
      thumbnail: thumbnailUrl,
      duration: 'Unknown',  // Can't reliably get duration without API
      publishDate: 'Unknown date',  // Can't reliably get publish date without API
      url: `https://www.youtube.com/watch?v=${videoId}`,
      description: 'Description not available without YouTube API key',
      tags: [],
      viewCount: 'N/A',
      likeCount: 'N/A',
      transcript,
      summary
    };
  } catch (error) {
    console.error('Error in fallback video processing:', error);
    throw new Error('Failed to extract video information. Please try again with a YouTube API key.');
  }
}
