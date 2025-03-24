import { OpenAI } from 'openai';
import { log } from '../vite';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Check if OpenAI API key is available
export function isOpenAIConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

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
  conversationHistory: { role: 'user' | 'assistant', content: string }[] = []
): Promise<string> {
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
        You'll be given a transcript of a video and need to answer questions about it accurately.
        Focus on information explicitly stated in the transcript. 
        If the answer is not in the transcript, say you don't have enough information rather than guessing.
        Give concise but comprehensive answers with specific timestamps or references when possible.`
      }
    ];

    // First message provides context
    messages.push({
      role: "user" as const,
      content: `Here is the transcript of a YouTube video titled "${videoTitle}":\n\n${truncatedTranscript}\n\nPlease reference this transcript when answering questions.`
    });
    
    messages.push({
      role: "assistant" as const,
      content: "I've reviewed the transcript and I'm ready to answer questions about this video."
    });

    // Add conversation history if it exists
    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory as any);
    }

    // Add the current question
    messages.push({
      role: "user" as const,
      content: question
    });

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.7, // Slightly more creative for natural answers
      max_tokens: 800,  // Allow for longer answers
    });

    // Extract and return the answer
    return response.choices[0].message.content?.trim() || 'Sorry, I could not generate an answer.';
  } catch (error) {
    log(`Error generating answer: ${error}`, 'openai');
    throw error;
  }
}