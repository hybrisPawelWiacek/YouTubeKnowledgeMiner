import axios from 'axios';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
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
    // Create a temporary Python script to use youtube-transcript-api
    const scriptPath = path.join(__dirname, 'temp_transcript_script.py');
    const scriptContent = `
import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi

try:
    transcript_list = YouTubeTranscriptApi.get_transcript("${videoId}")
    print(json.dumps(transcript_list))
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;
    
    writeFileSync(scriptPath, scriptContent);
    
    try {
      // Execute the Python script
      const output = execSync(`python ${scriptPath}`).toString();
      
      // Parse the transcript
      const transcriptData = JSON.parse(output);
      
      // Format the transcript into a readable format with timestamps
      const formattedTranscript = transcriptData.map((item: any) => {
        const timestamp = formatTimestamp(item.start);
        return `<p class="mb-3"><span class="text-gray-400">[${timestamp}]</span> ${item.text}</p>`;
      }).join('');
      
      return formattedTranscript;
    } finally {
      // Clean up the temporary script
      try {
        unlinkSync(scriptPath);
      } catch (err) {
        console.error('Error deleting temporary script:', err);
      }
    }
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    throw new Error('Failed to fetch transcript');
  }
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
