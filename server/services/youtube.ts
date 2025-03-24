import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube API key from environment variables
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// Function to process a YouTube video and get its metadata
export async function processYoutubeVideo(videoId: string) {
  try {
    if (!YOUTUBE_API_KEY) {
      throw new Error('YouTube API key is not set');
    }
    
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet,contentDetails`
    );
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Video not found');
    }
    
    const video = response.data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;
    
    // Format duration from ISO 8601 to readable format
    const duration = formatDuration(contentDetails.duration);
    
    // Format publish date
    const publishDate = formatPublishDate(snippet.publishedAt);
    
    return {
      title: snippet.title,
      channel: snippet.channelTitle,
      thumbnail: snippet.thumbnails.high.url,
      duration,
      publishDate,
      url: `https://www.youtube.com/watch?v=${videoId}`
    };
  } catch (error) {
    console.error('Error fetching YouTube video metadata:', error);
    throw new Error('Failed to fetch video metadata');
  }
}

// Function to get transcript from YouTube video
export async function getYoutubeTranscript(videoId: string) {
  try {
    // Direct fetch approach using the YouTube transcript endpoint
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
    const html = response.data;
    
    // Extract the transcript data from the HTML
    // This regex pattern looks for the captions track data in the YouTube page HTML
    const regex = /"captionTracks":\[.*?"baseUrl":"([^"]+)"/;
    const match = html.match(regex);
    
    if (!match || !match[1]) {
      throw new Error('No captions found for this video');
    }
    
    // The URL needs to be decoded since it's HTML encoded in the source
    const captionUrl = match[1].replace(/\\u0026/g, '&');
    
    // Fetch the actual transcript data
    const transcriptResponse = await axios.get(captionUrl);
    const transcriptData = transcriptResponse.data;
    
    // Parse the XML transcript
    const transcriptItems = parseTranscriptXml(transcriptData);
    
    // Format the transcript into a readable format with timestamps
    const formattedTranscript = transcriptItems.map(item => {
      const timestamp = formatTimestamp(item.start);
      return `<p class="mb-3"><span class="text-gray-400">[${timestamp}]</span> ${item.text}</p>`;
    }).join('');
    
    return formattedTranscript;
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    throw new Error('Failed to fetch transcript');
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
