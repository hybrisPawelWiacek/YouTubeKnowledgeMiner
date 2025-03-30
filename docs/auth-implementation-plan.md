# Authentication System Implementation Plan for YouTube Buddy MVP

## Architectural Choice Rationale

After reviewing the project documents and analyzing the current codebase, I recommend implementing **direct database authentication** rather than Supabase for the following reasons:

1. **Simplicity and Control**: Direct database auth gives us complete control over the authentication flow without dependencies on external services, making it easier to debug and maintain.

2. **Consistency with Existing Architecture**: The project already has a robust database schema and storage layer. Direct auth maintains consistency with this pattern rather than introducing a parallel system.

3. **Integration with Anonymous Flow**: Direct auth will integrate more seamlessly with the existing anonymous session management, which already uses database-backed sessions.

4. **Future Extensibility**: We can add OAuth providers later through passport.js or similar libraries, maintaining a unified authentication approach.

5. **Reduced Dependencies**: Eliminates potential issues with Supabase configuration, rate limits, or service disruptions.

## Implementation Plan Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Authentication System                        │
│                                                                 │
│  ┌──────────────┐     ┌───────────────┐     ┌──────────────┐   │
│  │ Client-Side  │     │  Server-Side  │     │   Database   │   │
│  │ Components   │     │   Services    │     │    Layer     │   │
│  └──────────────┘     └───────────────┘     └──────────────┘   │
│                                                                 │
│  • Auth Context       • Auth Service        • User Entity      │
│  • Login Form         • Auth Controller     • Session Entity   │
│  • Register Form      • Auth Middleware     • Token Storage    │
│  • Auth Hooks         • Password Utilities  • Data Migration   │
│  • Session Manager    • Token Management    • Query Utilities  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Authentication Flow Diagram

```
┌───────────┐      ┌────────────┐      ┌────────────┐      ┌──────────────┐
│  User     │      │  Frontend  │      │  Backend   │      │  Database    │
│  Browser  │      │  (React)   │      │  (Express) │      │  (PostgreSQL)│
└─────┬─────┘      └─────┬──────┘      └─────┬──────┘      └──────┬───────┘
      │                  │                   │                    │
      │  Login Request   │                   │                    │
      │─────────────────>│                   │                    │
      │                  │  Auth API Call    │                    │
      │                  │──────────────────>│                    │
      │                  │                   │  Verify User       │
      │                  │                   │───────────────────>│
      │                  │                   │  User Data         │
      │                  │                   │<───────────────────│
      │                  │                   │                    │
      │                  │                   │  Create Session    │
      │                  │                   │───────────────────>│
      │                  │                   │  Session ID        │
      │                  │                   │<───────────────────│
      │                  │                   │                    │
      │                  │  Auth Token +     │                    │
      │                  │  Session Cookie   │                    │
      │                  │<──────────────────│                    │
      │  Auth Success    │                   │                    │
      │<─────────────────│                   │                    │
      │                  │                   │                    │
      │  Subsequent      │                   │                    │
      │  API Requests    │                   │                    │
      │  with Session    │                   │                    │
      │─────────────────>│                   │                    │
      │                  │  API Call with    │                    │
      │                  │  Session Token    │                    │
      │                  │──────────────────>│                    │
      │                  │                   │  Validate Session  │
      │                  │                   │───────────────────>│
      │                  │                   │  Session Valid     │
      │                  │                   │<───────────────────│
      │                  │                   │                    │
      │                  │  API Response     │                    │
      │                  │<──────────────────│                    │
      │  Response Data   │                   │                    │
      │<─────────────────│                   │                    │
      │                  │                   │                    │
```

## Component Breakdown

### 1. User Domain Entity Design

#### Updated Schema Design (`shared/schema.ts`)

```typescript
// Add user status enum
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'pending_verification']);

// Enhanced user entity
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  email_verified: boolean("email_verified").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  last_login_at: timestamp("last_login_at"),
});

// User auth sessions
export const user_sessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  session_token: text("session_token").notNull().unique(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
});

// Password reset tokens
export const password_reset_tokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
});
```

### 2. Authentication Service Architecture

#### Password Utilities (`server/services/password.service.ts`)

```typescript
import crypto from 'crypto';

// Generate a random salt
export function generateSalt(length = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

// Hash password with salt using PBKDF2
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(
    password,
    salt,
    10000, // Iterations
    64,    // Key length
    'sha512'
  ).toString('hex');
}

// Verify password against stored hash
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const hash = hashPassword(password, salt);
  return storedHash === hash;
}
```

#### Token Service (`server/services/token.service.ts`)

```typescript
import crypto from 'crypto';
import { addDays, addHours } from 'date-fns';
import { db } from '../db';
import { user_sessions, password_reset_tokens } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Generate a secure random token
export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Create a new session for a user
export async function createSession(userId: number, ipAddress?: string, userAgent?: string) {
  const token = generateToken();
  const expiresAt = addDays(new Date(), 7); // 7-day session
  
  const session = await db.insert(user_sessions).values({
    user_id: userId,
    session_token: token,
    expires_at: expiresAt,
    ip_address: ipAddress || null,
    user_agent: userAgent || null
  }).returning();
  
  return {
    token,
    expiresAt,
    sessionId: session[0].id
  };
}

// Validate a session token
export async function validateSession(token: string) {
  const session = await db.query.user_sessions.findFirst({
    where: eq(user_sessions.session_token, token)
  });
  
  if (!session) return null;
  
  // Check if session is expired
  if (new Date() > session.expires_at) {
    // Delete expired session
    await db.delete(user_sessions).where(eq(user_sessions.id, session.id));
    return null;
  }
  
  return session;
}

// Create a password reset token
export async function createPasswordResetToken(userId: number) {
  const token = generateToken();
  const expiresAt = addHours(new Date(), 24); // 24-hour expiry
  
  await db.insert(password_reset_tokens).values({
    user_id: userId,
    token,
    expires_at: expiresAt,
  });
  
  return {
    token,
    expiresAt
  };
}
```

#### Authentication Service (`server/services/auth.service.ts`)

```typescript
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generateSalt, hashPassword, verifyPassword } from './password.service';
import { createSession, validateSession } from './token.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth-service');

export interface RegisterUserParams {
  username: string;
  email: string;
  password: string;
}

export interface LoginParams {
  username: string;
  password: string;
}

// Register a new user
export async function registerUser(params: RegisterUserParams) {
  const { username, email, password } = params;
  
  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, username)
  });
  
  if (existingUser) {
    throw new Error('Username already exists');
  }
  
  // Check if email already exists
  const existingEmail = await db.query.users.findFirst({
    where: eq(users.email, email)
  });
  
  if (existingEmail) {
    throw new Error('Email already exists');
  }
  
  // Create password hash
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  
  // Create user
  const newUser = await db.insert(users).values({
    username,
    email,
    password_hash: passwordHash,
    salt,
    status: 'active', // For MVP, skip email verification
    email_verified: false // Will implement verification later
  }).returning();
  
  logger.info('New user registered', { userId: newUser[0].id, username });
  
  return {
    id: newUser[0].id,
    username: newUser[0].username,
    email: newUser[0].email,
    created_at: newUser[0].created_at
  };
}

// Login user
export async function loginUser(params: LoginParams, ipAddress?: string, userAgent?: string) {
  const { username, password } = params;
  
  // Find user by username
  const user = await db.query.users.findFirst({
    where: eq(users.username, username)
  });
  
  if (!user) {
    logger.warn('Login failed - User not found', { username });
    throw new Error('Invalid credentials');
  }
  
  // Verify password
  if (!verifyPassword(password, user.password_hash, user.salt)) {
    logger.warn('Login failed - Invalid password', { userId: user.id });
    throw new Error('Invalid credentials');
  }
  
  // Check if user is active
  if (user.status !== 'active') {
    logger.warn('Login failed - User not active', { userId: user.id, status: user.status });
    throw new Error('User account is not active');
  }
  
  // Create session
  const session = await createSession(user.id, ipAddress, userAgent);
  
  // Update last login
  await db.update(users)
    .set({ last_login_at: new Date() })
    .where(eq(users.id, user.id));
    
  logger.info('User logged in successfully', { userId: user.id });
  
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    },
    session
  };
}

// Get user by ID
export async function getUserById(userId: number) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });
  
  if (!user) return null;
  
  // Don't return sensitive fields
  const { password_hash, salt, ...userWithoutSensitiveInfo } = user;
  return userWithoutSensitiveInfo;
}

// Logout (invalidate session)
export async function logoutUser(sessionToken: string) {
  await db.delete(user_sessions)
    .where(eq(user_sessions.session_token, sessionToken));
    
  logger.info('User logged out', { sessionToken });
  return true;
}
```

### 3. Session Management Approach

#### Auth Middleware (`server/middleware/auth.middleware.ts`)

```typescript
import { Request, Response, NextFunction } from 'express';
import { validateSession } from '../services/token.service';
import { getUserById } from '../services/auth.service';
import { dbStorage } from '../database-storage';
import { createLogger } from '../utils/logger';
import { ErrorCode, SessionError } from '../utils/error.utils';
import { handleApiError } from '../utils/response.utils';

const logger = createLogger('auth-middleware');

// Extract auth token from request
function getAuthToken(req: Request): string | null {
  // Check for token in cookies first (most secure)
  if (req.cookies && req.cookies.auth_token) {
    return req.cookies.auth_token;
  }
  
  // Fallback to Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

// Extract anonymous session ID from request
function getAnonymousSessionId(req: Request): string | null {
  const sessionHeader = req.headers['x-anonymous-session'];
  if (!sessionHeader) return null;
  
  return Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
}

// Get user info from request - works for both authenticated and anonymous users
export async function getUserInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const authToken = getAuthToken(req);
    const anonymousSessionId = getAnonymousSessionId(req);
    
    // Set default user info
    let userInfo = {
      user_id: null,
      anonymous_session_id: null,
      is_anonymous: true
    };
    
    // Check for authenticated user first
    if (authToken) {
      const session = await validateSession(authToken);
      if (session) {
        const user = await getUserById(session.user_id);
        if (user) {
          userInfo = {
            user_id: user.id,
            anonymous_session_id: null,
            is_anonymous: false
          };
          logger.debug('Authenticated user identified', { userId: user.id });
        }
      }
    }
    
    // If no authenticated user, check for anonymous session
    if (userInfo.is_anonymous && anonymousSessionId) {
      // Get or create anonymous session
      let session = await dbStorage.getAnonymousSessionBySessionId(anonymousSessionId);
      
      if (!session) {
        // Create a new session if it doesn't exist
        session = await dbStorage.createAnonymousSession({
          session_id: anonymousSessionId,
          user_agent: req.headers['user-agent'] || null,
          ip_address: req.ip || null
        });
      }
      
      // Update last active timestamp
      await dbStorage.updateAnonymousSessionLastActive(anonymousSessionId);
      
      userInfo.anonymous_session_id = anonymousSessionId;
    }
    
    // Store user info for route handlers
    res.locals.userInfo = userInfo;
    next();
  } catch (error) {
    logger.error('Error in getUserInfo middleware', { error });
    next(error);
  }
}

// Require authenticated user
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userInfo = res.locals.userInfo;
  
  if (!userInfo || userInfo.is_anonymous) {
    const error = new SessionError(
      "Authentication required", 
      ErrorCode.AUTHENTICATION_REQUIRED,
      "This endpoint requires user authentication"
    );
    return handleApiError(res, error);
  }
  
  next();
}

// Require valid session (authenticated or anonymous)
export function requireSession(req: Request, res: Response, next: NextFunction) {
  const userInfo = res.locals.userInfo;
  
  if (!userInfo) {
    return getUserInfo(req, res, next);
  }
  
  if (userInfo.is_anonymous && !userInfo.anonymous_session_id) {
    const error = new SessionError(
      "Valid session required", 
      ErrorCode.SESSION_REQUIRED,
      "Anonymous users must have a valid session ID"
    );
    return handleApiError(res, error);
  }
  
  next();
}

// Get user ID from request
export async function getUserIdFromRequest(req: Request): Promise<number | null> {
  const userInfo = res.locals.userInfo;
  
  if (!userInfo) {
    const userInfoResult = await getUserInfoFromRequest(req);
    return userInfoResult.user_id;
  }
  
  return userInfo.user_id;
}
```

#### CSRF Protection (`server/middleware/csrf.middleware.ts`)

```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Generate CSRF token
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create CSRF middleware
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip for GET, HEAD, OPTIONS requests (they should be idempotent)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const csrfToken = req.headers['x-csrf-token'] as string;
  const storedToken = req.cookies.csrf_token;
  
  if (!csrfToken || !storedToken || csrfToken !== storedToken) {
    return res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'INVALID_CSRF_TOKEN'
    });
  }
  
  next();
}

// Middleware to set CSRF token cookie
export function setCsrfToken(req: Request, res: Response, next: NextFunction) {
  // Only set for GET requests that could lead to forms
  if (req.method === 'GET') {
    const token = generateCsrfToken();
    res.cookie('csrf_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }
  
  next();
}
```

### 4. Migration Pathway

#### Enhanced Migration Service (`server/services/migration.service.ts`)

```typescript
import { db } from '../db';
import { storage } from '../storage';
import { createLogger } from '../utils/logger';

const logger = createLogger('migration-service');

/**
 * Migrate anonymous user data to a newly registered user
 * @param sessionId Anonymous session ID
 * @param userId User ID to migrate data to
 * @returns Object with migration results
 */
export async function migrateAnonymousUserData(
  sessionId: string,
  userId: number
): Promise<{ success: boolean; migratedVideos: number; error?: string }> {
  logger.info('Starting migration process', { sessionId, userId });
  
  try {
    // Check if the anonymous session exists
    const session = await storage.getAnonymousSessionBySessionId(sessionId);
    if (!session) {
      logger.warn('No anonymous session found for migration', { sessionId });
      return { success: false, migratedVideos: 0, error: 'Anonymous session not found' };
    }

    // Check if the user exists
    const user = await storage.getUser(userId);
    if (!user) {
      logger.warn('User not found for migration', { userId });
      return { success: false, migratedVideos: 0, error: 'User not found' };
    }

    // Get videos from the anonymous session
    const videos = await storage.getVideosByAnonymousSessionId(sessionId);
    if (!videos.length) {
      logger.info('No videos to migrate', { sessionId });
      return { success: true, migratedVideos: 0 };
    }

    // Migrate the videos in a transaction
    const migratedCount = await db.transaction(async (tx) => {
      let count = 0;
      
      // Update each video to belong to the authenticated user
      for (const video of videos) {
        await tx.update(videos)
          .set({ user_id: userId })
          .where(eq(videos.id, video.id));
        count++;
      }
      
      return count;
    });
    
    logger.info('Migration completed successfully', { 
      sessionId, 
      userId, 
      migratedVideos: migratedCount 
    });
    
    return {
      success: true,
      migratedVideos: migratedCount
    };
  } catch (error) {
    logger.error('Error during anonymous data migration', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      userId
    });
    
    return {
      success: false,
      migratedVideos: 0,
      error: 'Failed to migrate anonymous user data'
    };
  }
}
```

### 5. Client-Side Components

#### Auth Context (`client/src/contexts/auth-context.tsx`)

```typescript
import { 
  createContext, 
  useState, 
  useEffect, 
  useContext, 
  ReactNode 
} from 'react';
import { getAnonymousSessionId } from '@/lib/anonymous-session';
import { apiRequest } from '@/lib/api';

interface User {
  id: number;
  username: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAnonymous: boolean;
  anonymousSessionId: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  migrateAnonymousData: () => Promise<{ success: boolean; migratedCount: number }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [anonymousSessionId, setAnonymousSessionId] = useState<string | null>(null);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        // Try to get the current user
        const response = await apiRequest('/api/auth/me', {
          method: 'GET',
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Set anonymous session ID
    setAnonymousSessionId(getAnonymousSessionId());
    
    loadUser();
  }, []);

  // Login function
  const login = async (username: string, password: string) => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }
      
      const data = await response.json();
      setUser(data.user);
      
      // Store the token in local storage or cookie (handled by server)
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  // Register function
  const register = async (username: string, email: string, password: string) => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }
      
      const data = await response.json();
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
      });
      
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Migrate anonymous data
  const migrateAnonymousData = async () => {
    if (!user || !anonymousSessionId) {
      return { success: false, migratedCount: 0 };
    }
    
    try {
      const response = await apiRequest('/api/auth/migrate', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id }),
        headers: {
          'X-Anonymous-Session': anonymousSessionId
        }
      });
      
      if (!response.ok) {
        throw new Error('Migration failed');
      }
      
      const result = await response.json();
      return {
        success: true,
        migratedCount: result.migratedCount || 0
      };
    } catch (error) {
      console.error('Migration error:', error);
      return { success: false, migratedCount: 0 };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isAnonymous: !user,
        anonymousSessionId,
        login,
        register,
        logout,
        migrateAnonymousData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

#### Auth Routes (`server/routes/auth.routes.ts`)

```typescript
import { Router, Request, Response } from 'express';
import { registerUser, loginUser, logoutUser, getUserById } from '../services/auth.service';
import { migrateAnonymousUserData } from '../services/migration.service';
import { validateRequest } from '../middleware/validation.middleware';
import { getUserInfo, requireAuth } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';
import { z } from 'zod';

const router = Router();

// Input validation schemas
const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
});

const migrateSchema = z.object({
  userId: z.number().positive(),
});

// Register a new user
router.post('/register', validateRequest(registerSchema), async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    
    const user = await registerUser({ username, email, password });
    
    return sendSuccess(res, {
      message: 'Registration successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return sendError(res, message, 400);
  }
});

// Login user
router.post('/login', validateRequest(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    
    const result = await loginUser({ username, password }, ipAddress, userAgent);
    
    // Set auth cookie
    res.cookie('auth_token', result.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    return sendSuccess(res, {
      message: 'Login successful',
      user: result.user
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return sendError(res, message, 401);
  }
});

// Get current user
router.get('/me', getUserInfo, async (req: Request, res: Response) => {
  try {
    const userInfo = res.locals.userInfo;
    
    // If not authenticated, return null user
    if (!userInfo || userInfo.is_anonymous) {
      return sendSuccess(res, { user: null });
    }
    
    const user = await getUserById(userInfo.user_id);
    
    if (!user) {
      return sendSuccess(res, { user: null });
    }
    
    return sendSuccess(res, { user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get user';
    return sendError(res, message, 500);
  }
});

// Logout
router.post('/logout', getUserInfo, async (req: Request, res: Response) => {
  try {
    const authToken = req.cookies.auth_token;
    
    if (authToken) {
      await logoutUser(authToken);
      
      // Clear auth cookie
      res.clearCookie('auth_token');
    }
    
    return sendSuccess(res, { message: 'Logout successful' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    return sendError(res, message, 500);
  }
});

// Migrate anonymous user data
router.post('/migrate', validateRequest(migrateSchema), async (req: Request, res: Response) => {
  try {
    // Get session ID from header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (!sessionHeader) {
      return sendError(res, "No anonymous session ID provided", 400);
    }
    
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    const { userId } = req.body;
    
    const result = await migrateAnonymousUserData(sessionId, userId);
    
    if (!result.success) {
      return sendError(res, result.error || "Migration failed", 400);
    }
    
    return sendSuccess(res, { 
      message: "Videos successfully migrated", 
      migratedCount: result.migratedVideos,
      sessionId
    });
  } catch (error) {
    console.error("Error migrating anonymous session:", error);
    return sendError(res, "Failed to migrate anonymous session", 500);
  }
});

export default router;
```

## Files to Create/Modify

### New Files:
1. `server/services/password.service.ts`
2. `server/services/token.service.ts`
3. `server/services/auth.service.ts`
4. `server/middleware/csrf.middleware.ts`
5. `client/src/contexts/auth-context.tsx`

### Files to Modify:
1. `shared/schema.ts` - Update user schema and add new auth tables
2. `server/middleware/auth.middleware.ts` - Enhance to support authenticated users
3. `server/routes/auth.routes.ts` - Implement complete auth routes
4. `server/services/migration.service.ts` - Enhance transaction support
5. `server/index.ts` - Register auth routes and middleware
6. `client/src/App.tsx` - Add AuthProvider

## Security Considerations

1. **Password Security:**
   - Implementing PBKDF2 for password hashing with salt
   - Storage of password hash rather than plain password
   - Secure comparison for password verification

2. **Session Management:**
   - Secure HTTP-only cookies for session tokens
   - Session expiration and cleanup mechanisms
   - Validation of session tokens on each request
   - IP and user agent tracking for anomaly detection

3. **Protection Against Attacks:**
   - CSRF protection for sensitive operations
   - Rate limiting for authentication endpoints
   - Validation of all user inputs
   - Safe error responses (not leaking sensitive information)

4. **Data Privacy:**
   - Not returning sensitive user data to client
   - Proper validation in data migration process
   - Secure token generation with sufficient entropy

5. **Implementation Best Practices:**
   - Using standard crypto libraries
   - Following OWASP guidelines for authentication
   - Comprehensive logging of security events
   - Clear separation of authentication and business logic

## Implementation Approach

1. **Schema Updates First:** Begin with updating the database schema to support the new user and session entities.

2. **Backend Services Next:** Implement the core authentication services (password, token, auth service).

3. **Middleware and Routes:** Develop the authentication middleware and routes.

4. **Client Integration:** Create the client-side authentication context and components.

5. **Testing and Integration:** Verify the authentication flow works end-to-end.

This implementation plan provides a comprehensive approach to rebuilding the authentication system while maintaining compatibility with the existing anonymous user flow. The direct database authentication approach aligns with the project's existing architecture and provides a solid foundation for adding more advanced features in the future.