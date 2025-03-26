import { OpenAI } from 'openai';
import { log } from '../vite';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-ada-002'; // Default embedding model
const EMBEDDING_DIMENSION = 1536; // Dimensionality of the embedding vectors
const MAX_CHUNK_SIZE = 512; // Split text into chunks of this size for embeddings
const CHUNK_OVERLAP = 50; // Overlap between consecutive chunks for context

// Check if OpenAI API key is available
export function isOpenAIConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Helper function to split text into chunks of appropriate size for embedding
export function chunkText(text: string, maxLength = MAX_CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text) return [];
  
  // Simple split by sentences first (not perfect but works for most cases)
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    // If adding this sentence would exceed max length, save current chunk and start a new one
    if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Start new chunk with overlap from previous chunk if possible
      const words = currentChunk.split(' ');
      if (words.length > overlap) {
        currentChunk = words.slice(-overlap).join(' ') + ' ';
      } else {
        currentChunk = '';
      }
    }
    
    currentChunk += sentence + ' ';
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Generate embeddings for a single text input
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI API key not configured');
  }
  
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' '), // Replace newlines with spaces for better quality
    });
    
    return response.data[0].embedding;
  } catch (error) {
    log(`Error generating embedding: ${error}`, 'openai');
    throw error;
  }
}

// Generate embeddings for multiple text inputs in batch
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI API key not configured');
  }
  
  if (texts.length === 0) return [];
  
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map(t => t.replace(/\n/g, ' ')),
    });
    
    return response.data.map(item => item.embedding);
  } catch (error) {
    log(`Error generating embeddings batch: ${error}`, 'openai');
    throw error;
  }
}

/**
 * Generates a summary of a transcript using OpenAI
 * @param transcript The full transcript text
 * @param videoTitle The title of the video for better context
 * @returns An array of summary bullet points
 */
export async function generateSummary(transcript: string, videoTitle: string): Promise<string[]> {
  try {
    if (!isOpenAIConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    // Limit transcript length to avoid token limits
    const maxChars = 14000; // Approximate limit for gpt-3.5-turbo
    const truncatedTranscript = transcript.length > maxChars 
      ? transcript.substring(0, maxChars) + "... (transcript truncated)"
      : transcript;

    log(`Generating summary for video: ${videoTitle}`, 'openai');

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that creates concise, informative summaries of YouTube video transcripts. Generate 5-7 bullet points that capture the key points discussed in the video."
        },
        {
          role: "user",
          content: `Please provide a summary of this YouTube video titled "${videoTitle}" in the form of 5-7 bullet points. Here's the transcript:\n\n${truncatedTranscript}`
        }
      ],
      temperature: 0.5, // More focused/deterministic outputs
      max_tokens: 500,  // Limit response length
    });

    // Extract the response content
    const summaryText = response.choices[0].message.content?.trim() || '';
    
    // Process the bullet points
    const bulletPoints = summaryText
      .split('\n')
      .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*'))
      .map(line => line.trim().replace(/^[•\-\*]\s*/, '').trim());

    // If we couldn't parse bullet points properly, return the whole text
    if (bulletPoints.length === 0 && summaryText) {
      return [summaryText];
    }

    return bulletPoints;
  } catch (error) {
    log(`Error generating summary: ${error}`, 'openai');
    throw error;
  }
}

/**
 * Answers a question about a video using its transcript content
 * @param transcript The full transcript text to reference
 * @param videoTitle The title of the video for better context
 * @param question The user's specific question about the video
 * @param conversationHistory Optional previous Q&A exchanges for context
 * @returns A detailed answer to the question based on the transcript
 */
export async function generateAnswer(
  transcript: string, 
  videoTitle: string, 
  question: string,
  conversationHistory: { role: 'user' | 'assistant', content: string }[] = [],
  searchResults: Array<{
    id: number,
    video_id: number,
    content: string,
    content_type: string,
    similarity: number,
    metadata: any
  }> = []
): Promise<{ answer: string, citations: any[] }> {
  try {
    if (!isOpenAIConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    // Limit transcript length to avoid token limits
    const maxChars = 14000; // Approximate limit for gpt-3.5-turbo
    const truncatedTranscript = transcript.length > maxChars 
      ? transcript.substring(0, maxChars) + "... (transcript truncated)"
      : transcript;

    log(`Generating answer for question about video: ${videoTitle}`, 'openai');
    log(`Question: ${question}`, 'openai');

    // Build the conversation including history if provided
    const messages = [
      {
        role: "system" as const,
        content: `You are an AI assistant that helps users understand YouTube video content. 
        You'll be given a transcript of a video and search results from the transcript, and need to answer questions accurately.
        Focus on information explicitly stated in the transcript and search results. 
        If the answer is not in the provided information, say you don't have enough information rather than guessing.
        Give concise but comprehensive answers.
        
        IMPORTANT: For each piece of information you cite, indicate the source with citation markers [1], [2], etc.,
        corresponding to the numbered search results. This allows users to verify information.`
      }
    ];

    // Format search results to provide as context
    let searchResultsText = '';
    const citationMap: Array<{
      id: number;
      video_id: number;
      video_title: string;
      content: string;
      content_type: string;
      timestamp?: string;
      chunk_index?: number;
    }> = [];
    
    if (searchResults && searchResults.length > 0) {
      searchResultsText = "Here are relevant excerpts from the video that might help answer the question:\n\n";
      
      searchResults.forEach((result, index) => {
        const citation = {
          id: index + 1,
          video_id: result.video_id,
          video_title: videoTitle,
          content: result.content,
          content_type: result.content_type,
          timestamp: result.metadata?.timestamp || result.metadata?.formatted_timestamp || undefined,
          chunk_index: result.metadata?.position || undefined
        };
        citationMap.push(citation);
        
        const timestamp = result.metadata?.formatted_timestamp 
          ? `[${result.metadata.formatted_timestamp}]` 
          : '';
          
        searchResultsText += `[${index + 1}] ${timestamp} ${result.content}\n\n`;
      });
    }

    // First message provides context
    messages.push({
      role: "user",
      content: `Here is the transcript of a YouTube video titled "${videoTitle}":\n\n${truncatedTranscript}\n\n${searchResultsText}\nPlease reference this information when answering questions, using citation numbers [1], [2], etc.`
    } as any);
    
    messages.push({
      role: "assistant",
      content: "I've reviewed the transcript and relevant sections, and I'm ready to answer questions about this video with proper citations."
    } as any);

    // Add conversation history if it exists
    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory as any);
    }

    // Add the current question
    messages.push({
      role: "user",
      content: question
    } as any);

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.7, // Slightly more creative for natural answers
      max_tokens: 800,  // Allow for longer answers
    });

    // Extract the answer
    const answerContent = response.choices[0].message.content?.trim() || 'Sorry, I could not generate an answer.';
    
    // Create the used citations array based on citation numbers in the answer
    const usedCitations: typeof citationMap = [];
    const citationRegex = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    
    while ((match = citationRegex.exec(answerContent)) !== null) {
      const citationNumber = parseInt(match[1]);
      if (citationNumber > 0 && citationNumber <= citationMap.length) {
        const citation = citationMap[citationNumber - 1];
        if (!usedCitations.some(c => c.id === citation.id)) {
          usedCitations.push(citation);
        }
      }
    }
    
    return {
      answer: answerContent,
      citations: usedCitations
    };
  } catch (error) {
    log(`Error generating answer: ${error}`, 'openai');
    throw error;
  }
}