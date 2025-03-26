import { Video, QAConversation, QAMessage, ExportRequest } from '@shared/schema';
import { dbStorage } from '../database-storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type ExportResult = {
  filename: string;
  content: string;
  mimeType: string;
};

/**
 * Formats transcript content into different output formats
 */
function formatTranscriptContent(transcript: string, format: 'txt' | 'csv' | 'json'): string {
  // Clean up transcript by removing html tags
  const cleanedTranscript = transcript.replace(/<[^>]*>?/gm, '');
  
  switch (format) {
    case 'txt':
      return cleanedTranscript;
    
    case 'csv':
      // Simple CSV format - can be enhanced with timestamp extraction
      const lines = cleanedTranscript.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      return 'Line,Content\n' + 
        lines.map((line, index) => `${index + 1},"${line.replace(/"/g, '""')}"`).join('\n');
    
    case 'json':
      const paragraphs = cleanedTranscript.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      return JSON.stringify({
        transcript: paragraphs,
        metadata: {
          totalLines: paragraphs.length,
          exportedAt: new Date().toISOString()
        }
      }, null, 2);
  }
}

/**
 * Formats summary content into different output formats
 */
function formatSummaryContent(summary: string[], format: 'txt' | 'csv' | 'json'): string {
  switch (format) {
    case 'txt':
      return summary.map((point, index) => `${index + 1}. ${point}`).join('\n\n');
    
    case 'csv':
      return 'Point,Content\n' + 
        summary.map((point, index) => `${index + 1},"${point.replace(/"/g, '""')}"`).join('\n');
    
    case 'json':
      return JSON.stringify({
        summary: summary,
        metadata: {
          totalPoints: summary.length,
          exportedAt: new Date().toISOString()
        }
      }, null, 2);
  }
}

/**
 * Formats Q&A conversation into different output formats
 */
function formatQAContent(
  conversation: { title: string, messages: QAMessage[] }, 
  format: 'txt' | 'csv' | 'json'
): string {
  switch (format) {
    case 'txt':
      let output = `# ${conversation.title}\n\n`;
      
      conversation.messages.forEach((message, index) => {
        const role = message.role === 'user' ? 'User' : 'Assistant';
        output += `${role}: ${message.content}\n\n`;
      });
      
      return output;
    
    case 'csv':
      let csv = 'Role,Message\n';
      
      conversation.messages.forEach(message => {
        csv += `${message.role},"${message.content.replace(/"/g, '""')}"\n`;
      });
      
      return csv;
    
    case 'json':
      return JSON.stringify({
        title: conversation.title,
        messages: conversation.messages,
        metadata: {
          messageCount: conversation.messages.length,
          exportedAt: new Date().toISOString()
        }
      }, null, 2);
  }
}

/**
 * Determines appropriate mime type based on export format
 */
function getMimeType(format: 'txt' | 'csv' | 'json'): string {
  switch (format) {
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
  }
}

/**
 * Generates filename for exported content
 */
function generateFilename(
  contentType: 'transcript' | 'summary' | 'qa', 
  format: 'txt' | 'csv' | 'json',
  videoTitle: string,
  isBatch = false
): string {
  const sanitizedTitle = videoTitle
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
  
  const timestamp = new Date().toISOString().replace(/[:T.]/g, '-').substring(0, 19);
  
  if (isBatch) {
    return `${contentType}_batch_${timestamp}.${format}`;
  } else {
    return `${sanitizedTitle}_${contentType}_${timestamp}.${format}`;
  }
}

/**
 * Exports transcript, summary, or Q&A content for a single video
 */
export async function exportVideoContent(
  request: ExportRequest
): Promise<ExportResult> {
  const { content_type, format, video_ids, qa_conversation_id } = request;
  const videoId = video_ids[0]; // First ID for single exports
  
  // Fetch video details
  const video = await dbStorage.getVideo(videoId);
  if (!video) {
    throw new Error(`Video with ID ${videoId} not found`);
  }
  
  let content = '';
  let filename = '';
  
  switch (content_type) {
    case 'transcript':
      if (!video.transcript) {
        throw new Error('No transcript available for this video');
      }
      content = formatTranscriptContent(video.transcript, format);
      filename = generateFilename('transcript', format, video.title);
      break;
    
    case 'summary':
      if (!video.summary || video.summary.length === 0) {
        throw new Error('No summary available for this video');
      }
      content = formatSummaryContent(video.summary, format);
      filename = generateFilename('summary', format, video.title);
      break;
    
    case 'qa':
      if (!qa_conversation_id) {
        throw new Error('Q&A conversation ID is required for QA exports');
      }
      
      const conversation = await dbStorage.getQAConversation(qa_conversation_id);
      if (!conversation) {
        throw new Error(`Q&A conversation with ID ${qa_conversation_id} not found`);
      }
      
      content = formatQAContent(
        { title: conversation.title, messages: conversation.messages as any as QAMessage[] }, 
        format
      );
      
      filename = generateFilename('qa', format, `${video.title}_${conversation.title}`);
      break;
  }
  
  return {
    filename,
    content,
    mimeType: getMimeType(format)
  };
}

/**
 * Exports content for multiple videos at once (batch export)
 */
export async function exportBatchVideoContent(
  request: ExportRequest
): Promise<ExportResult> {
  const { content_type, format, video_ids } = request;
  
  if (content_type === 'qa') {
    throw new Error('Batch export is not supported for Q&A conversations');
  }
  
  // Fetch videos
  const videos: Video[] = [];
  for (const videoId of video_ids) {
    const video = await dbStorage.getVideo(videoId);
    if (video) {
      videos.push(video);
    }
  }
  
  if (videos.length === 0) {
    throw new Error('No valid videos found for batch export');
  }
  
  let content = '';
  
  switch (format) {
    case 'txt':
      content = videos.map(video => {
        let videoContent = `# ${video.title}\n\n`;
        
        if (content_type === 'transcript' && video.transcript) {
          videoContent += formatTranscriptContent(video.transcript, 'txt');
        } else if (content_type === 'summary' && video.summary && video.summary.length > 0) {
          videoContent += formatSummaryContent(video.summary, 'txt');
        } else {
          videoContent += 'No content available for this video.\n';
        }
        
        return videoContent;
      }).join('\n\n---\n\n');
      break;
    
    case 'csv':
      if (content_type === 'transcript') {
        // CSV header
        content = 'Video Title,Video ID,Content\n';
        
        // Add data for each video
        videos.forEach(video => {
          if (video.transcript) {
            const cleanedTranscript = video.transcript.replace(/<[^>]*>?/gm, '');
            const lines = cleanedTranscript.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0);
            
            lines.forEach(line => {
              content += `"${video.title.replace(/"/g, '""')}","${video.id}","${line.replace(/"/g, '""')}"\n`;
            });
          }
        });
      } else { // summary
        // CSV header
        content = 'Video Title,Video ID,Summary Point\n';
        
        // Add data for each video
        videos.forEach(video => {
          if (video.summary && video.summary.length > 0) {
            video.summary.forEach(point => {
              content += `"${video.title.replace(/"/g, '""')}","${video.id}","${point.replace(/"/g, '""')}"\n`;
            });
          }
        });
      }
      break;
    
    case 'json':
      const jsonData = videos.map(video => {
        let contentData = null;
        
        if (content_type === 'transcript' && video.transcript) {
          const cleanedTranscript = video.transcript.replace(/<[^>]*>?/gm, '');
          contentData = cleanedTranscript.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        } else if (content_type === 'summary' && video.summary && video.summary.length > 0) {
          contentData = video.summary;
        }
        
        return {
          id: video.id,
          title: video.title,
          youtube_id: video.youtube_id,
          [content_type]: contentData
        };
      });
      
      content = JSON.stringify({
        videos: jsonData,
        metadata: {
          exportType: content_type,
          totalVideos: videos.length,
          exportedAt: new Date().toISOString()
        }
      }, null, 2);
      break;
  }
  
  return {
    filename: generateFilename(content_type, format, 'multiple_videos', true),
    content,
    mimeType: getMimeType(format)
  };
}

/**
 * Saves user's export format preferences
 * @param userId The user ID, or null for anonymous users (will be rejected)
 * @param defaultFormat The preferred export format
 * @throws Error if userId is null (anonymous users can't save preferences)
 */
export async function saveExportPreference(
  userId: number | null, 
  defaultFormat: 'txt' | 'csv' | 'json'
): Promise<void> {
  // Anonymous users can't save preferences
  if (userId === null) {
    throw new Error("Anonymous users cannot save export preferences");
  }
  
  // Check if user already has preferences
  const existingPrefs = await dbStorage.getExportPreferencesByUserId(userId);
  
  if (existingPrefs) {
    await dbStorage.updateExportPreferences(existingPrefs.id, { default_format: defaultFormat });
  } else {
    await dbStorage.createExportPreferences({
      user_id: userId,
      default_format: defaultFormat
    });
  }
}

/**
 * Gets user's export format preferences
 * @param userId The user ID, or null for anonymous users
 * @returns The preferred export format, defaulting to 'txt' for anonymous users or users without preferences
 */
export async function getExportPreference(userId: number | null): Promise<'txt' | 'csv' | 'json'> {
  // For anonymous users (null userId), return default format
  if (userId === null) {
    return 'txt';
  }
  
  // For registered users, fetch preferences from database
  const prefs = await dbStorage.getExportPreferencesByUserId(userId);
  return prefs?.default_format || 'txt'; // Default to txt if no preferences are saved
}