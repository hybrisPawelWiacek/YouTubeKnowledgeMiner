import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { 
  insertQAConversationSchema, 
  qaQuestionSchema 
} from '@shared/schema';
import { storage } from '../storage';
import { generateAnswer } from '../services/openai';
import { performSemanticSearch } from '../services/embeddings';
import { initializeVectorFunctions } from '../services/supabase';
import { requireAuth, requireAnyUser } from '../middleware/auth.middleware';
import { validateNumericParam } from '../middleware/validation.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';

const router = Router();

/**
 * Helper function to get user information from request object
 * This function adapts the new auth middleware format to the existing code
 */
function getUserInfoFromRequest(req: Request) {
  // Get the anonymous session ID from multiple possible sources
  let anonymousSessionId = null;
  
  // First check if it's in req.sessionId (from auth middleware)
  if (req.isAnonymous && req.sessionId) {
    anonymousSessionId = req.sessionId;
    console.log(`[QA routes] Found session ID in req.sessionId: ${anonymousSessionId}`);
  }
  
  // If not found, check the header
  if (!anonymousSessionId && req.isAnonymous) {
    const headerSessionId = req.headers['x-anonymous-session'];
    if (headerSessionId) {
      anonymousSessionId = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId;
      console.log(`[QA routes] Found session ID in headers: ${anonymousSessionId}`);
    }
  }
  
  // If a session ID is in the user object, use that (sometimes the middleware sets it there)
  if (!anonymousSessionId && req.isAnonymous && req.user?.anonymous_session_id) {
    anonymousSessionId = req.user.anonymous_session_id;
    console.log(`[QA routes] Found session ID in user object: ${anonymousSessionId}`);
  }
  
  // Log the auth properties and headers
  console.log(`[QA routes] Auth properties: isAuthenticated=${req.isAuthenticated}, isAnonymous=${req.isAnonymous}`);
  console.log(`[QA routes] User object:`, req.user || 'undefined');
  console.log(`[QA routes] Using anonymous_session_id: ${anonymousSessionId}`);
  
  return {
    user_id: req.user?.id,
    is_anonymous: req.isAnonymous,
    anonymous_session_id: anonymousSessionId
  };
}

/**
 * Helper function to get user ID from request
 * Returns the user ID or null if anonymous
 */
function getUserIdFromRequest(req: Request): number | null {
  return req.user?.id || null;
}

/**
 * Support the original route format that the frontend expects:
 * GET /api/videos/:videoId/qa
 */
router.get('/:videoId/qa', validateNumericParam('videoId'), async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.videoId);
    
    const conversations = await storage.getQAConversationsByVideoId(videoId);
    return sendSuccess(res, conversations);
  } catch (error) {
    console.error("Error fetching Q&A conversations:", error);
    return sendError(res, "Failed to fetch Q&A conversations");
  }
});

/**
 * Support the original route format for creating conversations:
 * POST /api/videos/:videoId/qa
 * Supports both authenticated users and anonymous sessions
 */
router.post('/:videoId/qa', requireAnyUser, validateNumericParam('videoId'), async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.videoId);
    
    // Get user ID using our helper function (now returns 7 for anonymous users)
    const userId = getUserIdFromRequest(req);
    
    console.log("CREATE Q&A CONVERSATION: Using user ID from request:", userId);
    console.log("Creating Q&A conversation with body:", req.body);
    
    try {
      // Ensure all required fields are in the request body
      const requestWithDefaults = {
        ...req.body,
        messages: req.body.messages || [],
        video_id: videoId,
        user_id: userId // userId is now always a number (7 for anonymous users)
      };

      // Validate with schema
      const validatedData = insertQAConversationSchema.parse(requestWithDefaults);

      // Create the conversation
      const conversation = await storage.createQAConversation({
        ...validatedData,
        video_id: videoId,
        user_id: validatedData.user_id
      });

      // If there are initial messages, process them for embeddings
      if (Array.isArray(validatedData.messages) && validatedData.messages.length > 0) {
        try {
          const { processConversationEmbeddings } = await import('../services/embeddings');
          await processConversationEmbeddings(
            videoId,
            validatedData.user_id,
            validatedData.messages as any[]
          );
          console.log(`Generated embeddings for new conversation ${conversation.id}`);
        } catch (embeddingError) {
          // Non-critical operation, log the error but don't fail the request
          console.error(`Failed to generate embeddings for new conversation: ${embeddingError}`);
        }
      }

      return sendSuccess(res, conversation, 201);
    } catch (validationError) {
      console.error("Validation error details:", validationError);
      throw validationError;
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400);
    }
    console.error("Error creating Q&A conversation:", error);
    return sendError(res, `Failed to create Q&A conversation: ${error}`);
  }
});

/**
 * Get all Q&A conversations for a specific video
 */
router.get('/video/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    
    const conversations = await storage.getQAConversationsByVideoId(videoId);
    return sendSuccess(res, conversations);
  } catch (error) {
    console.error("Error fetching Q&A conversations:", error);
    return sendError(res, "Failed to fetch Q&A conversations");
  }
});

/**
 * IMPORTANT: This route must be registered AFTER the /:videoId/qa route
 * to prevent conflicts in parameter matching
 * 
 * Get a specific Q&A conversation by ID
 */
router.get('/:id([0-9]+)', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const conversationId = parseInt(req.params.id);
    
    const conversation = await storage.getQAConversation(conversationId);
    if (!conversation) {
      return sendError(res, "Conversation not found", 404);
    }

    return sendSuccess(res, conversation);
  } catch (error) {
    console.error("Error fetching Q&A conversation:", error);
    return sendError(res, "Failed to fetch Q&A conversation");
  }
});

/**
 * Create a new Q&A conversation for a specific video
 * Supports both authenticated users and anonymous sessions
 */
router.post('/video/:id', requireAnyUser, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    
    // Get user ID using our helper function (now returns 7 for anonymous users)
    const userId = getUserIdFromRequest(req);
    
    console.log("CREATE Q&A CONVERSATION: Using user ID from request:", userId);
    console.log("Creating Q&A conversation with body:", req.body);
    
    try {
      // Validate schema requirements first
      console.log("Schema requirements:", Object.keys(insertQAConversationSchema.shape));
      
      // Ensure all required fields are in the request body
      const requestWithDefaults = {
        ...req.body,
        messages: req.body.messages || [],
        video_id: videoId,
        user_id: userId // userId is now always a number (7 for anonymous users)
      };

      console.log("Modified request with defaults:", requestWithDefaults);

      // Validate with schema
      const validatedData = insertQAConversationSchema.parse(requestWithDefaults);

      console.log("Validated data:", validatedData);

      // Create the conversation
      const conversation = await storage.createQAConversation({
        ...validatedData,
        video_id: videoId,
        user_id: validatedData.user_id
      });

      // If there are initial messages, process them for embeddings
      if (Array.isArray(validatedData.messages) && validatedData.messages.length > 0) {
        try {
          const { processConversationEmbeddings } = await import('../services/embeddings');
          await processConversationEmbeddings(
            videoId,
            validatedData.user_id,
            validatedData.messages as any[]
          );
          console.log(`Generated embeddings for new conversation ${conversation.id}`);
        } catch (embeddingError) {
          // Non-critical operation, log the error but don't fail the request
          console.error(`Failed to generate embeddings for new conversation: ${embeddingError}`);
        }
      }

      return sendSuccess(res, conversation, 201);
    } catch (validationError) {
      console.error("Validation error details:", validationError);
      throw validationError;
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400);
    }
    console.error("Error creating Q&A conversation:", error);
    return sendError(res, `Failed to create Q&A conversation: ${error}`);
  }
});

/**
 * Ask a question in a Q&A conversation
 */
router.post('/:id/ask', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const conversationId = parseInt(req.params.id);
    
    // Validate the question
    const { question } = qaQuestionSchema.parse(req.body);

    // Get the existing conversation
    const conversation = await storage.getQAConversation(conversationId);
    if (!conversation) {
      return sendError(res, "Conversation not found", 404);
    }

    // Get the video for the transcript
    const video = await storage.getVideo(conversation.video_id);
    if (!video || !video.transcript) {
      return sendError(res, "Video transcript not available for Q&A", 400);
    }

    // Build the conversation history from existing messages
    const messages = conversation.messages || [];
    const conversationHistory = Array.isArray(messages) ? messages.map((message: any) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content
    })) : [];

    // Perform semantic search to find relevant content for citations
    await initializeVectorFunctions();
    const searchResults = await performSemanticSearch(
      conversation.user_id,
      question,
      { 
        videoId: conversation.video_id,
        contentTypes: ['transcript', 'summary', 'note'] 
      },
      5 // Limit to top 5 results for citation purposes
    );

    // Generate an answer using OpenAI with citations
    const { answer, citations } = await generateAnswer(
      video.transcript,
      video.title,
      question,
      conversationHistory,
      searchResults
    );

    // Add the new question and answer to the messages
    const newAssistantMessage = { 
      role: 'assistant' as const, 
      content: answer,
      citations: citations || []
    };

    const updatedMessages = Array.isArray(messages) ? [
      ...messages,
      { role: 'user', content: question },
      newAssistantMessage
    ] : [
      { role: 'user', content: question },
      newAssistantMessage
    ];

    // Update the conversation with the new messages
    const updatedConversation = await storage.updateQAConversation(
      conversationId,
      updatedMessages
    );

    // Process the conversation for embeddings after updating
    try {
      const { processConversationEmbeddings } = await import('../services/embeddings');
      await processConversationEmbeddings(
        conversation.video_id, 
        conversation.user_id, 
        updatedMessages as any[]
      );
      console.log(`Generated embeddings for conversation ${conversationId}`);
    } catch (embeddingError) {
      // Non-critical operation, log the error but don't fail the request
      console.error(`Failed to generate embeddings for conversation: ${embeddingError}`);
    }

    return sendSuccess(res, {
      conversation: updatedConversation,
      answer,
      citations
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400);
    }
    console.error("Error processing question:", error);
    return sendError(res, "Failed to process question");
  }
});

/**
 * Delete a Q&A conversation
 */
router.delete('/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const conversationId = parseInt(req.params.id);
    
    const deleted = await storage.deleteQAConversation(conversationId);
    if (!deleted) {
      return sendError(res, "Conversation not found", 404);
    }

    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting Q&A conversation:", error);
    return sendError(res, "Failed to delete Q&A conversation");
  }
});

export default router;