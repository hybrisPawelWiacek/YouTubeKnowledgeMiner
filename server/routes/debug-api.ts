import { Router, Request, Response } from 'express';
import { dbStorage } from '../database-storage';
import { getUserInfo } from '../middleware/auth.middleware';

// Create router
const router = Router();

// Apply user info middleware to all routes
router.use(getUserInfo);

// Debug endpoint for logging request information
router.get('/videos', async (req: Request, res: Response) => {
  console.log("================================================");
  console.log("🔴 VIDEO DEBUG INFO 🔴");
  console.log("================================================");
  console.log(`Received ${req.method} ${req.path} request at ${new Date().toISOString()}`);
  console.log("Request query params:", req.query);
  console.log("Request cookies:", req.cookies);
  console.log("Request headers:", req.headers);
  console.log("User info:", res.locals.userInfo);
  
  // Check if there's a valid anonymous session and add that info
  let anonymousVideos: any[] = [];
  if (res.locals.userInfo?.anonymous_session_id) {
    try {
      anonymousVideos = await dbStorage.getVideosByAnonymousSessionId(res.locals.userInfo.anonymous_session_id);
      console.log("Found anonymous videos:", anonymousVideos.length);
    } catch (error) {
      console.error("Error fetching anonymous videos:", error);
    }
  }
  
  return res.status(200).json({
    message: "Debug info logged to console",
    userInfo: res.locals.userInfo,
    query: req.query,
    headers: req.headers,
    anonymous_video_count: anonymousVideos.length,
    anonymous_videos: anonymousVideos
  });
});

export default router;