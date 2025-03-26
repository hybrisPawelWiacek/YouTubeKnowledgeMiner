import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSummary, isOpenAIConfigured } from './openai';
import { log } from '../vite';
import * as cheerio from 'cheerio';

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
      
      if (transcript && isOpenAIConfigured()) {
        console.log("Generating summary from transcript...");
        summary = await generateTranscriptSummary(transcript, snippet.title);
      }
    } catch (transcriptError) {
      console.warn("Could not fetch transcript:", transcriptError);
      // Don't throw an error here, just continue without transcript
    }
    
    return {
      youtubeId: videoId,
      title: snippet.title,
      channel: snippet.channelTitle,
      thumbnail,
      duration,
      publishDate,
      url: `https://www.youtube.com/watch?v=${videoId}`,
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

// Function to get transcript from YouTube video using direct URL approach
export async function getYoutubeTranscript(videoId: string) {
  try {
    console.log(`Fetching transcript for video ID: ${videoId}`);
    
    // Extract the YouTube ID if a full URL was provided
    const extractedId = extractYoutubeId(videoId);
    if (!extractedId) {
      throw new Error('Invalid YouTube URL or ID');
    }
    
    // Direct fetch approach using the YouTube transcript endpoint
    const response = await axios.get(`https://www.youtube.com/watch?v=${extractedId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;
    
    // Use cheerio to parse the HTML
    const $ = cheerio.load(html);
    
    // Extract the transcript data using patterns found in YouTube pages
    const scriptContent = $('script').map((i, el) => $(el).html()).get().join('');
    
    // Look for the captionTracks data in the script content
    const captionRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = scriptContent.match(captionRegex);
    
    if (!match || !match[1]) {
      throw new Error('No captions available for this video. The video might not have subtitles.');
    }
    
    // Parse the JSON data
    const captionTracksJson = match[1].replace(/\\"/g, '"').replace(/\\u0026/g, '&');
    
    try {
      const captionTracks = JSON.parse(captionTracksJson);
      
      if (captionTracks.length === 0) {
        throw new Error('No caption tracks available for this video.');
      }
      
      // Get the first available track (preferably English)
      let selectedTrack = captionTracks.find((track: any) => 
        track.languageCode === 'en' || track.language === 'English'
      );
      
      // If no English track, just use the first one
      if (!selectedTrack) {
        selectedTrack = captionTracks[0];
      }
      
      if (!selectedTrack || !selectedTrack.baseUrl) {
        throw new Error('Could not find a valid caption track.');
      }
      
      // Fetch the transcript XML
      const transcriptResponse = await axios.get(selectedTrack.baseUrl);
      const transcriptData = transcriptResponse.data;
      
      // Parse the transcript XML data
      const transcriptItems = parseTranscriptXml(transcriptData);
      
      if (transcriptItems.length === 0) {
        throw new Error('Transcript data was empty or could not be parsed.');
      }
      
      console.log(`Successfully parsed ${transcriptItems.length} transcript items`);
      
      // Format the transcript with timestamps
      const formattedTranscript = transcriptItems.map((item, index) => {
        const timestamp = formatTimestamp(item.start);
        // Add data attributes for citation functionality
        return `<p class="mb-3 transcript-line" data-timestamp="${item.start}" data-duration="${item.duration}" data-index="${index}">
          <span class="text-gray-400 timestamp-marker" data-seconds="${item.start}">[${timestamp}]</span> 
          <span class="transcript-text">${item.text}</span>
        </p>`;
      }).join('');
      
      return formattedTranscript;
      
    } catch (parseError) {
      console.error('Error parsing caption tracks:', parseError);
      throw new Error('Failed to parse caption data.');
    }
    
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    
    if (error instanceof Error) {
      // Provide more specific error messages
      if (error.message.includes('captions') || error.message.includes('subtitles')) {
        throw new Error('This video does not have captions available. Try a different video.');
      } else if (error.message.includes('network')) {
        throw new Error('Network error while fetching transcript. Please try again later.');
      } else if (error.message.includes('language')) {
        throw new Error('Transcript is not available in a supported language.');
      }
    }
    
    throw new Error('Failed to fetch transcript. The video may not have captions available.');
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
 * Extract YouTube ID from a URL or ID string
 */
function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  
  // If the input is already just an ID (11 characters of letters, numbers, underscore, and dash)
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
      transcript = await getYoutubeTranscript(videoId);
      if (transcript && isOpenAIConfigured()) {
        summary = await generateTranscriptSummary(transcript, title);
      }
    } catch (error) {
      console.warn('Could not fetch transcript:', error);
    }
    
    // Return a simplified video object
    return {
      youtubeId: videoId,
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
