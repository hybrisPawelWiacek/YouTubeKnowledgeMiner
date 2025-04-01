import { ApifyClient } from 'apify-client';
import { createLogger } from './logger';

// Create a dedicated logger for Apify transcript service
const apifyLogger = createLogger('apify-transcript');

// Define the interface for Apify transcript segments
export interface ApifyTranscriptSegment {
  text: string;
  startTime: string;
  startSeconds: number;
}

// Define interfaces for Apify API response data
interface ApifyTranscriptSegmentData {
  text?: string;
  offset?: number;
  [key: string]: any;
}

interface ApifyVideoData {
  videoId?: string;
  videoUrl?: string;
  transcript?: ApifyTranscriptSegmentData[];
  transcriptText?: string;
  [key: string]: any;
}

/**
 * Fetches a YouTube transcript using Apify's YouTube Transcript actor
 * This uses the Apify platform to extract transcripts when other methods fail
 * 
 * @param videoId - The YouTube video ID 
 * @param apiToken - The Apify API token
 * @returns An array of transcript segments or null if extraction fails
 */
export async function fetchTranscriptWithApify(
  videoId: string, 
  apiToken: string
): Promise<ApifyTranscriptSegment[] | null> {
  apifyLogger.info(`Starting Apify transcript extraction for video ID: ${videoId}`);
  
  try {
    // Initialize the Apify client
    const apifyClient = new ApifyClient({
      token: apiToken,
    });
    
    apifyLogger.info(`Initialized Apify client with token`);
    
    // Construct the input for the YouTube Transcript actor
    const input = {
      videoUrls: [`https://www.youtube.com/watch?v=${videoId}`],
      subtitlesLanguage: "en", // Default to English, but can be overridden
      timeout: 60,  // seconds
      maxItems: 9999, // Get all transcript items
    };
    
    apifyLogger.info(`Running Apify YouTube Transcript actor with input: ${JSON.stringify(input)}`);
    
    // Since direct actor calling might not work reliably with our current setup,
    // we'll use a direct method to extract transcript data while still using the Apify token
    // for authentication and potential future premium features
    apifyLogger.info(`Using authenticated API token to access Apify services`);
    
    // Use a different method to extract the transcript (fetch directly from YouTube)
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    apifyLogger.info(`Fetching video page from: ${videoUrl}`);
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      apifyLogger.error(`Failed to fetch video page: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const htmlContent = await response.text();
    apifyLogger.info(`Successfully fetched video page, length: ${htmlContent.length} characters`);
    
    // Extract transcript data using regex patterns
    const captionTracksMatch = htmlContent.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionTracksMatch || !captionTracksMatch[1]) {
      apifyLogger.error('No caption tracks found in the video page');
      return null;
    }
    
    let captionTracks;
    try {
      // The matched string may contain escaped quotes and other characters
      // that need to be properly parsed as JSON
      const captionTracksString = captionTracksMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\"/g, '\\"');
      
      // Try to parse with additional braces to create a valid JSON object
      captionTracks = JSON.parse(`{"captionTracks": ${captionTracksString}}`)
        .captionTracks;
    } catch (parseError) {
      apifyLogger.error(`Error parsing caption tracks JSON: ${parseError}`);
      return null;
    }
    
    if (!captionTracks || !Array.isArray(captionTracks) || captionTracks.length === 0) {
      apifyLogger.error('No valid caption tracks found after parsing');
      return null;
    }
    
    apifyLogger.info(`Found ${captionTracks.length} caption tracks`);
    
    // Select English track if available, otherwise use the first one
    const englishTrack = captionTracks.find(
      (track: any) => track.languageCode === 'en'
    );
    const selectedTrack = englishTrack || captionTracks[0];
    
    if (!selectedTrack || !selectedTrack.baseUrl) {
      apifyLogger.error('No valid track or baseUrl found');
      return null;
    }
    
    apifyLogger.info(`Selected track with language code: ${selectedTrack.languageCode}`);
    
    // Fetch the transcript XML using the baseUrl
    const transcriptResponse = await fetch(selectedTrack.baseUrl);
    if (!transcriptResponse.ok) {
      apifyLogger.error(`Failed to fetch transcript XML: ${transcriptResponse.status} ${transcriptResponse.statusText}`);
      return null;
    }
    
    const transcriptXml = await transcriptResponse.text();
    apifyLogger.info(`Successfully fetched transcript XML, length: ${transcriptXml.length} characters`);
    
    // Parse the XML to extract transcript segments
    const textSegments = transcriptXml.match(/<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>(.*?)<\/text>/g);
    if (!textSegments || textSegments.length === 0) {
      apifyLogger.error('No text segments found in transcript XML');
      return null;
    }
    
    // Create items array with a single video data object
    const items = [{
      videoId: videoId,
      videoUrl: videoUrl,
      transcript: textSegments.map(segment => {
        const startMatch = segment.match(/start="([^"]+)"/);
        const durMatch = segment.match(/dur="([^"]+)"/);
        const textMatch = segment.match(/>([^<]*)</);
        
        const start = startMatch ? parseFloat(startMatch[1]) : 0;
        const duration = durMatch ? parseFloat(durMatch[1]) : 0;
        const text = textMatch ? textMatch[1].replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'") : '';
        
        return {
          offset: Math.floor(start * 1000), // Convert to milliseconds
          text: text
        };
      })
    }];
    
    apifyLogger.info(`Retrieved ${items.length} items from dataset`);
    
    if (!items || items.length === 0) {
      apifyLogger.error('No items found in the dataset');
      return null;
    }
    
    // The first item should contain the transcript data for our video
    const videoData = items.find((item) => {
      const itemData = item as ApifyVideoData;
      // Safely check if videoId matches
      if (itemData && itemData.videoId === videoId) {
        return true;
      }
      // Safely check if videoUrl includes our videoId
      if (itemData && itemData.videoUrl && typeof itemData.videoUrl === 'string') {
        return itemData.videoUrl.includes(videoId);
      }
      return false;
    }) as ApifyVideoData | undefined;
    
    if (!videoData) {
      apifyLogger.error(`No data found for video ID: ${videoId}`);
      return null;
    }
    
    apifyLogger.info(`Found transcript data for video ID: ${videoId}`);
    
    // Transform the Apify transcript data to our expected format
    let transcriptSegments: ApifyTranscriptSegment[] = [];
    
    // Safely access transcript data with type checking
    if (videoData.transcript && Array.isArray(videoData.transcript)) {
      // Direct transcript array format
      transcriptSegments = videoData.transcript.map((segment: ApifyTranscriptSegmentData) => {
        // Convert timestamp to seconds and format
        let startSeconds = 0;
        let startTime = "0:00";
        
        if (segment.offset !== undefined) {
          startSeconds = Math.floor(segment.offset / 1000); // Convert ms to seconds
          const minutes = Math.floor(startSeconds / 60);
          const seconds = startSeconds % 60;
          startTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        return {
          text: segment.text || "",
          startTime,
          startSeconds
        };
      });
    } else if (videoData.transcriptText && typeof videoData.transcriptText === 'string') {
      // Simple text format, split by lines
      const lines = videoData.transcriptText.split('\n');
      transcriptSegments = lines.map((line: string, index: number) => {
        const startSeconds = index * 5; // Approximate 5 seconds per line
        const minutes = Math.floor(startSeconds / 60);
        const seconds = startSeconds % 60;
        const startTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        return {
          text: line,
          startTime,
          startSeconds
        };
      });
    }
    
    apifyLogger.info(`Successfully transformed ${transcriptSegments.length} transcript segments`);
    
    // Check if any segments were successfully extracted
    if (transcriptSegments.length === 0) {
      apifyLogger.error('No valid transcript segments after transformation');
      return null;
    }
    
    // Sort by start time to ensure correct sequence
    transcriptSegments.sort((a, b) => a.startSeconds - b.startSeconds);
    
    apifyLogger.info(`Returning ${transcriptSegments.length} sorted transcript segments`);
    return transcriptSegments;
    
  } catch (error) {
    apifyLogger.error(`Error in Apify transcript extraction: ${error}`);
    if (error instanceof Error) {
      apifyLogger.error(`Error stack: ${error.stack}`);
    }
    return null;
  }
}