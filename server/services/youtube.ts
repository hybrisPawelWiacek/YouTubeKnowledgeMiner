import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSummary, isOpenAIConfigured } from './openai';
import { log } from '../vite';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube API key from environment variables
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// Function to process a YouTube video and get its metadata
export async function processYoutubeVideo(videoId: string) {
  try {
    if (!YOUTUBE_API_KEY) {
      throw new Error('YouTube API key is not set. Please add a valid YouTube API key to your environment variables.');
    }
    
    console.log(`Fetching metadata for video ID: ${videoId}`);
    
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet,contentDetails,statistics`
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
    
    return {
      title: snippet.title,
      channel: snippet.channelTitle,
      thumbnail,
      duration,
      publishDate,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      description,
      tags,
      viewCount,
      likeCount
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

// Function to get transcript from YouTube video
export async function getYoutubeTranscript(videoId: string) {
  try {
    console.log(`Fetching transcript for video ID: ${videoId}`);
    // Direct fetch approach using the YouTube transcript endpoint
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;
    
    // Extract the transcript data from the HTML
    // This regex pattern looks for the captions track data in the YouTube page HTML
    const regex = /"captionTracks":\[.*?"baseUrl":"([^"]+)"/;
    const match = html.match(regex);
    
    if (!match || !match[1]) {
      console.log('No caption tracks found in the YouTube page HTML');
      // Attempt an alternative approach - try to find the playerCaptionsTracklistRenderer
      const altRegex = /"playerCaptionsTracklistRenderer":\{.*?"captionTracks":\[(.*?)\]/;
      const altMatch = html.match(altRegex);
      
      if (!altMatch || !altMatch[1]) {
        throw new Error('No captions available for this video. The video might not have subtitles.');
      }
      
      // Extract the first baseUrl from the alternative match
      const baseUrlRegex = /"baseUrl":"([^"]+)"/;
      const baseUrlMatch = altMatch[1].match(baseUrlRegex);
      
      if (!baseUrlMatch || !baseUrlMatch[1]) {
        throw new Error('Could not extract transcript URL from the video page.');
      }
      
      // Use the alternative baseUrl
      const captionUrl = baseUrlMatch[1].replace(/\\u0026/g, '&');
      return await processTranscriptUrl(captionUrl);
    }
    
    // The URL needs to be decoded since it's HTML encoded in the source
    const captionUrl = match[1].replace(/\\u0026/g, '&');
    return await processTranscriptUrl(captionUrl);
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    
    if (error instanceof Error) {
      // Provide more specific error messages
      if (error.message.includes('captions')) {
        throw new Error('This video does not have captions available. Try a different video.');
      } else if (error.message.includes('network')) {
        throw new Error('Network error while fetching transcript. Please try again later.');
      }
    }
    
    throw new Error('Failed to fetch transcript. The video may not have captions available.');
  }
}

// Helper function to process transcript URL and format the transcript
async function processTranscriptUrl(captionUrl: string): Promise<string> {
  try {
    // Fetch the actual transcript data
    console.log(`Fetching transcript data from URL: ${captionUrl.substring(0, 100)}...`);
    const transcriptResponse = await axios.get(captionUrl);
    const transcriptData = transcriptResponse.data;
    
    // Parse the XML transcript
    const transcriptItems = parseTranscriptXml(transcriptData);
    
    if (transcriptItems.length === 0) {
      throw new Error('Transcript data was empty or could not be parsed correctly.');
    }
    
    console.log(`Successfully parsed ${transcriptItems.length} transcript items`);
    
    // Format the transcript into a readable format with timestamps
    const formattedTranscript = transcriptItems.map(item => {
      const timestamp = formatTimestamp(item.start);
      return `<p class="mb-3"><span class="text-gray-400">[${timestamp}]</span> ${item.text}</p>`;
    }).join('');
    
    return formattedTranscript;
  } catch (error) {
    console.error('Error processing transcript URL:', error);
    throw new Error('Failed to process transcript data');
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
