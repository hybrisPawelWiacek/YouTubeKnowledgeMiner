import { Router, Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.utils';
import { isSupabaseConfigured } from '../services/supabase';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const router = Router();

const emailSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const magicLinkSchema = z.object({
  email: z.string().email('Invalid email format'),
  redirectTo: z.string().optional(),
});

/**
 * Endpoint to get Supabase configuration for the client
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    // Return Supabase initialization status and config details for the client
    const status = {
      initialized: isSupabaseConfigured(),
      keyExists: Boolean(process.env.SUPABASE_KEY),
      urlExists: Boolean(process.env.SUPABASE_URL),
      // Provide minimal credentials needed for auth to work properly
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_KEY
    };

    return sendSuccess(res, status);
  } catch (error) {
    console.error("Error checking Supabase status:", error);
    return sendError(res, 
      error instanceof Error ? error.message : String(error), 
      500
    );
  }
});

/**
 * Endpoint to send a magic link to a user
 */
router.post('/magic-link', async (req: Request, res: Response) => {
  try {
    const { email, redirectTo } = magicLinkSchema.parse(req.body);
    
    if (!isSupabaseConfigured()) {
      return sendError(res, "Supabase not configured", 500);
    }

    // Import here to prevent circular imports
    const { sendMagicLink } = await import('../services/supabase');
    const finalRedirectTo = redirectTo || `${req.protocol}://${req.get('host')}/auth/callback`;
    
    console.log(`Sending magic link to email: ${email} with redirect to: ${finalRedirectTo}`);
    
    // Send the magic link via Supabase
    await sendMagicLink(email, finalRedirectTo);
    
    return sendSuccess(res, { 
      message: "Magic link sent successfully",
      redirectTo: finalRedirectTo
    });
  } catch (error) {
    console.error("Error sending magic link:", error);
    return sendError(res, 
      error instanceof Error ? error.message : String(error), 
      400
    );
  }
});

/**
 * Endpoint for user registration through Supabase
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    // Validate the email at minimum
    const { email } = emailSchema.parse(req.body);
    
    if (!isSupabaseConfigured()) {
      return sendError(res, "Supabase not configured", 500);
    }

    // The actual registration happens client-side via Supabase SDK
    // This endpoint is primarily for validation and additional server-side processing if needed
    console.log(`Registration request for: ${email}`);
    
    return sendSuccess(res, { 
      message: "Registration request validation successful" 
    });
  } catch (error) {
    console.error("Error in registration request:", error);
    return sendError(res, 
      error instanceof Error ? error.message : String(error), 
      400
    );
  }
});

/**
 * Handle the session verification and update
 * This endpoint will be called on page load to verify the session
 */
router.post('/session', async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured()) {
      return sendError(res, "Supabase not configured", 500);
    }

    // The session itself will be managed by Supabase
    // This endpoint is for any additional server-side processing needed with the session
    return sendSuccess(res, { 
      message: "Session validation endpoint" 
    });
  } catch (error) {
    console.error("Error in session handling:", error);
    return sendError(res, 
      error instanceof Error ? error.message : String(error), 
      400
    );
  }
});

export default router;