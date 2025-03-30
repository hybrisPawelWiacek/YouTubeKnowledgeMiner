# Authentication System Bug Fix Plan for YouTube Buddy MVP

## 1. Problem Summary

The authentication implementation shows significant gaps between the planned architecture and actual implementation. Key issues include:

1. **Database Schema Incompatibility**: The current database has a `users` table with a `password` column, but the codebase is trying to use `password_hash` and `salt` columns.

2. **Missing Authentication Tables**: The `auth_tokens` and `auth_sessions` tables defined in the schema are not created in the database.

3. **Endpoint Inconsistencies**: The login endpoint expects `username` but the test plan is using `email`.

4. **Missing Migration Endpoint**: The endpoint for migrating anonymous data to authenticated users is either missing or implemented in a different location.

## 2. Prioritized Issues

### 2.1 Database Schema Issues

**Problem**: The database schema does not match the model in `shared/schema.ts`. 

- Current DB schema has column `password` (text)
- Code expects columns `password_hash` (text) and `salt` (text)
- Auth tables `auth_tokens` and `auth_sessions` are missing from the database

**Impact**: User registration and login fail because the code tries to access non-existent columns.

### 2.2 Endpoint Inconsistencies

**Problem**: Login endpoint expects different parameters than documented.

- Code expects `username` but test plan uses `email`
- Parameter inconsistency causes login validation failures

**Impact**: Registration and login endpoints are failing due to these inconsistencies.

### 2.3 Missing Migration Endpoint

**Problem**: The endpoint for migrating anonymous user data to authenticated users is not implemented or not accessible.

- Code shows it should be at `/api/anonymous/migrate` but tests fail
- Frontend expects `/api/auth/migrate` based on Auth Implementation Plan

**Impact**: Users cannot convert their anonymous activity to a registered account.

### 2.4 Authentication Flow Breakage

**Problem**: The entire authentication flow is broken due to the above issues.

**Impact**: Cannot test or use any authentication features.

## 3. Implementation Approach

### 3.1 Fix Database Schema

1. **Modify the user table schema**:

```sql
-- Option 1: Align database with code (recommended)
ALTER TABLE users 
ADD COLUMN password_hash TEXT,
ADD COLUMN salt TEXT,
ADD COLUMN status TEXT DEFAULT 'active',
ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

-- Temporarily copy password to password_hash for existing users
UPDATE users SET password_hash = password;

-- Add salt with a default value for existing users
UPDATE users SET salt = 'temporary_salt';
```

2. **Create missing authentication tables**:

```sql
-- Create auth_tokens table
CREATE TABLE auth_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  revoked BOOLEAN DEFAULT FALSE NOT NULL,
  revoked_at TIMESTAMP
);

-- Create auth_sessions table
CREATE TABLE auth_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id VARCHAR(128) NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  last_active_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### 3.2 Fix Authentication Services

1. **Modify password service** (`server/services/password.service.ts`):
   - Update implementation to handle the current database schema
   - Add compatibility layer for both `password` and `password_hash`/`salt` fields

```typescript
// Add compatibility function
export function getPasswordData(user: any): { hash: string, salt: string } {
  // Handle both legacy and new format
  if (user.password_hash && user.salt) {
    return { hash: user.password_hash, salt: user.salt };
  }
  
  // Legacy format - password field only
  if (user.password) {
    return { hash: user.password, salt: 'temporary_salt' };
  }
  
  throw new Error('Invalid user password data');
}
```

2. **Update auth service** (`server/services/auth.service.ts`):
   - Modify functions to use the compatibility layer
   - Add handling for both schema formats

```typescript
// Update the login function to handle both schemas
export async function loginUser(data: LoginUserRequest): Promise<LoginResult> {
  const { username, password } = data;
  
  const user = await db.query.users.findFirst({
    where: eq(users.username, username)
  });
  
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  // Use compatibility function
  const passwordData = getPasswordData(user);
  const isValid = verifyPassword(password, passwordData.hash, passwordData.salt);
  
  if (!isValid) {
    throw new Error('Invalid credentials');
  }
  
  // Rest of the function...
}
```

### 3.3 Fix Auth Route Inconsistencies

1. **Update auth routes** (`server/routes/auth.routes.ts`):
   - Ensure the login route validates input correctly
   - Fix parameter naming consistency

```typescript
// Modify login schema to support both email and username
const loginUserSchema = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string()
}).refine(data => data.username || data.email, {
  message: "Either username or email must be provided"
});

// Update login route handler
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validatedData = loginUserSchema.parse(req.body);
    
    // Convert email to username if needed
    if (validatedData.email && !validatedData.username) {
      const user = await db.query.users.findFirst({
        where: eq(users.email, validatedData.email)
      });
      
      if (user) {
        validatedData.username = user.username;
      }
    }
    
    // Continue with login...
  } catch (error) {
    // Error handling...
  }
});
```

### 3.4 Implement Migration Endpoint

1. **Implement/Fix migration endpoint** (`server/routes/auth.routes.ts`):
   - Add the migration endpoint to the auth routes
   - Ensure it accepts the correct parameters

```typescript
// Implement migration endpoint
router.post('/migrate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const sessionId = req.body.sessionId || 
                      (req.headers['x-anonymous-session'] ? 
                      (Array.isArray(req.headers['x-anonymous-session']) ? 
                       req.headers['x-anonymous-session'][0] : 
                       req.headers['x-anonymous-session']) : 
                      null);
                      
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Anonymous session ID is required'
      });
    }
    
    const result = await migrateAnonymousData(sessionId, userId);
    
    return res.json({
      success: true,
      migratedCount: result.migratedCount
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed';
    return res.status(500).json({
      success: false,
      message
    });
  }
});
```

2. **Implement migration service** (`server/services/migration.service.ts`):
   - Create a function to handle the migration process

```typescript
export async function migrateAnonymousData(sessionId: string, userId: number) {
  // Begin a transaction
  return await db.transaction(async (tx) => {
    // Get videos from anonymous session
    const videos = await storage.getVideosByAnonymousSessionId(sessionId);
    
    if (videos.length === 0) {
      return { migratedCount: 0 };
    }
    
    // Transfer videos to authenticated user
    let migratedCount = 0;
    
    for (const video of videos) {
      // Create new video under authenticated user
      await tx.insert(videos).values({
        ...video,
        user_id: userId,
        anonymous_session_id: null
      });
      
      migratedCount++;
    }
    
    // Update anonymous session to mark it as migrated
    await tx.update(anonymous_sessions)
      .set({ migrated_to_user_id: userId })
      .where(eq(anonymous_sessions.session_id, sessionId));
    
    return { migratedCount };
  });
}
```

### The Migration Endpoint Fix: Choose One Path

**Option 1: Fix anonymous.routes.ts endpoint**
- Locate the existing `/migrate` endpoint in `server/routes/anonymous.routes.ts`
- Fix its implementation if it exists but is not working properly

**Option 2: Implement endpoint in auth.routes.ts**
- Add the migration endpoint to `server/routes/auth.routes.ts` as described above
- Ensure it's registered correctly in the Express application

## 4. Testing Strategy

### 4.1 Test Database Alignment

1. **Verify schema**:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users';
```

2. **Test auth tables**:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'auth_%';
```

### 4.2 Test Endpoints

1. **Test registration**:
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

2. **Test login with username**:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }' -c cookies.txt
```

3. **Test login with email**:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' -c cookies.txt
```

4. **Test authentication**:
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

5. **Test migration**:
```bash
# First create an anonymous session with videos
# Then register a user
# Then perform migration
curl -X POST http://localhost:5000/api/auth/migrate \
  -H "Content-Type: application/json" \
  -H "X-Anonymous-Session: <session_id>" \
  -b cookies.txt \
  -d '{
    "sessionId": "<session_id>"
  }'
```

### 4.3 Test Complete Flow

1. Create an anonymous session
2. Add videos to anonymous session
3. Register a new user
4. Login as the new user
5. Migrate anonymous data
6. Verify videos are accessible to the authenticated user

## 5. Implementation Sequence

1. **Database Schema Fixes**
   - Update users table schema
   - Create auth tables
   - Migrate existing data if needed

2. **Authentication Service Updates**
   - Add compatibility layer in password service
   - Update authentication service to handle both schema formats

3. **Endpoint Fixes**
   - Update login route to accept both username and email
   - Fix parameter naming inconsistencies

4. **Migration Endpoint Implementation**
   - Implement/fix the migration endpoint
   - Create/update migration service

5. **Comprehensive Testing**
   - Test each component individually
   - Test the complete authentication flow
   - Verify migration functionality

## 6. Potential Side Effects

1. **Existing Users**: Changes to the user table might affect existing users' ability to login
2. **Anonymous Sessions**: Migration might cause data loss if not implemented carefully
3. **Frontend Integration**: Frontend code may need updates to align with API changes

## Conclusion

This plan addresses the critical issues in the authentication system while minimizing the risk of data loss or disruption to existing functionality. The approach focuses on making the implementation compatible with both the current database schema and the expected schema, allowing for a smoother transition.

The most critical fixes are to the database schema and authentication services, as these form the foundation of the entire authentication system. By implementing these fixes in the proposed sequence, we can quickly restore basic authentication functionality and then progress to more advanced features like migration.