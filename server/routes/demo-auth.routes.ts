import { Router, Request, Response } from 'express';
import { dbStorage } from '../database-storage';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../../shared/schema';

/**
 * Demo Authentication Routes
 * 
 * This file contains routes for demonstration users authentication
 * and is mapped to /api/demo-auth/* in the main routes index.
 * 
 * It provides a way to log in with predefined demo users without
 * going through the actual Supabase authentication process.
 * This is useful for testing authenticated features in development
 * or giving demos of the application.
 * 
 * This system works alongside both the Supabase auth and anonymous
 * session systems as part of the complete authentication solution.
 */

// Create router for demo authentication endpoints
const router = Router();

// Demo user configurations that match the setup-demo-users.ts script
const DEMO_USERS = [
  {
    username: 'demo_basic',
    displayName: 'Demo User',
    description: 'Regular user with basic content'
  },
  {
    username: 'demo_power',
    displayName: 'Power User',
    description: 'Power user with extensive content and customizations'
  }
];

/**
 * Demo authentication endpoint to directly log in as predefined demo users
 * Note: This is only for testing purposes and should not be used in production
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    // Return the list of available demo users (without sensitive information)
    res.status(200).json({
      success: true,
      data: {
        users: DEMO_USERS.map(user => ({
          username: user.username,
          displayName: user.displayName,
          description: user.description
        }))
      }
    });
  } catch (error: any) {
    console.error('Error fetching demo users:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching demo users',
      error: error.message
    });
  }
});

/**
 * Login as a demo user by username
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }
    
    // Verify that requested username is one of our demo users
    const demoUser = DEMO_USERS.find(
      user => user.username.toLowerCase() === username.toLowerCase()
    );
    
    if (!demoUser) {
      return res.status(404).json({
        success: false,
        message: 'Demo user not found'
      });
    }
    
    // Fetch the actual user record from the database
    const user = await dbStorage.getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Demo user not found in database. Please run the setup script first.'
      });
    }
    
    // Return only necessary user data
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: demoUser.displayName,
        demoType: demoUser.username === 'demo_power' ? 'power' : 'basic'
      }
    });
    
  } catch (error: any) {
    console.error('Error logging in as demo user:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during demo login',
      error: error.message
    });
  }
});

/**
 * Reset a demo user's data to default state
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }
    
    // Verify that requested username is one of our demo users
    const isDemoUser = DEMO_USERS.some(
      user => user.username.toLowerCase() === username.toLowerCase()
    );
    
    if (!isDemoUser) {
      return res.status(404).json({
        success: false,
        message: 'Not a valid demo user'
      });
    }
    
    // Get the user's ID
    const user = await dbStorage.getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Demo user not found in database'
      });
    }
    
    // Make sure we don't accidentally delete a real user's data
    if (!username.startsWith('demo_')) {
      return res.status(403).json({
        success: false,
        message: 'Cannot reset non-demo user accounts'
      });
    }
    
    // Import and run the setup demo users script
    const { exec } = require('child_process');
    
    // Execute the setup script to recreate the demo data
    // We use the TypeScript execution command to ensure it runs properly
    const command = `npx tsx scripts/setup-demo-users.ts`;
    
    exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        console.error(`Error executing setup script: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Failed to reset demo user data',
          error: error.message
        });
      }
      
      if (stderr) {
        console.error(`Setup script stderr: ${stderr}`);
      }
      
      console.log(`Setup script output: ${stdout}`);
      
      return res.status(200).json({
        success: true,
        message: 'Demo user data has been reset to default state'
      });
    });
    
  } catch (error: any) {
    console.error('Error resetting demo user:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting demo user data',
      error: error.message
    });
  }
});

export default router;