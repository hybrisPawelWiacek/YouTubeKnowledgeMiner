# Comprehensive Authentication Testing Plan for YouTube Buddy MVP

This testing plan focuses on validating the authentication backend before proceeding with frontend integration. I'll provide detailed instructions for testing each component of our authentication system.

## 1. Manual API Testing Instructions

### 1.1. Testing Authentication Endpoints

#### Register a New User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
```

**Expected Success Response (200):**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": 123,
      "username": "testuser",
      "email": "test@example.com"
    }
  }
}
```

**Possible Error Responses:**
- 400: Email or username already exists
- 400: Invalid email format
- 400: Password too weak (must have minimum length and complexity)

#### Login with Credentials

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }' \
  -c cookies.txt
```

**Expected Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 123,
      "username": "testuser",
      "email": "test@example.com"
    }
  }
}
```

**Note:** Observe that the response sets a secure HTTP-only cookie (`auth_token`). You can inspect this with the `-c cookies.txt` option to save cookies.

**Possible Error Responses:**
- 401: Invalid email or password
- 400: Missing required fields
- 429: Too many login attempts (if rate limiting is implemented)

#### Get Current User (Authentication Check)

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Expected Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "username": "testuser",
      "email": "test@example.com"
    }
  }
}
```

**Possible Error Responses:**
- 401: Not authenticated

#### Request Password Reset

```bash
curl -X POST http://localhost:5000/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**Expected Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset link sent to your email"
}
```

**Note:** For testing purposes, check the server logs to see the generated reset token.

**Possible Error Responses:**
- 400: Invalid email
- 404: User not found

#### Reset Password (with Token)

After requesting a password reset and obtaining the token from server logs:

```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "obtained_reset_token",
    "password": "NewSecurePassword123!"
  }'
```

**Expected Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

**Possible Error Responses:**
- 400: Invalid or expired token
- 400: Password too weak

#### Logout

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Expected Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Note:** This should clear the auth cookie. Verify by trying to access `/api/auth/me` again.

### 1.2. Testing Anonymous-to-Authenticated Migration

First, create an anonymous session and add some videos to it, then register a user and migrate the data.

#### 1. Get Anonymous Session Video Count

```bash
curl -X GET http://localhost:5000/api/anonymous/videos/count \
  -H "X-Anonymous-Session: anon_1743156070346_4bw2br1lc"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "count": 3,
    "session_id": "anon_1743156070346_4bw2br1lc",
    "max_allowed": 3
  }
}
```

#### 2. Register User (from step 1.1)

#### 3. Login User (from step 1.1)

#### 4. Migrate Anonymous Data

```bash
curl -X POST http://localhost:5000/api/anonymous/migrate \
  -H "Content-Type: application/json" \
  -H "X-Anonymous-Session: anon_1743156070346_4bw2br1lc" \
  -b cookies.txt \
  -d '{
    "sessionId": "anon_1743156070346_4bw2br1lc"
  }'
```

**Expected Success Response (200):**
```json
{
  "success": true,
  "message": "Successfully migrated 3 videos",
  "data": {
    "migratedVideos": 3
  }
}
```

**Possible Error Responses:**
- 401: Not authenticated
- 400: Missing session ID
- 404: Anonymous session not found

## 2. Integration Verification

### 2.1. Anonymous Session and Authentication Integration

**Test Scenario 1: Anonymous Flow to Authentication**

1. **Setup Anonymous Session:**
   ```bash
   # Get current video count
   curl -X GET http://localhost:5000/api/anonymous/videos/count \
     -H "X-Anonymous-Session: anon_$(date +%s)_testflow"
   ```

2. **Register a User:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "migratetest",
       "email": "migrate@example.com",
       "password": "SecureMigrate123!"
     }' \
     -c cookies.txt
   ```

3. **Login:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "migrate@example.com",
       "password": "SecureMigrate123!"
     }' \
     -c cookies.txt
   ```

4. **Migrate Data:**
   ```bash
   curl -X POST http://localhost:5000/api/anonymous/migrate \
     -H "Content-Type: application/json" \
     -H "X-Anonymous-Session: anon_$(date +%s)_testflow" \
     -b cookies.txt \
     -d '{
       "sessionId": "anon_$(date +%s)_testflow"
     }'
   ```

5. **Verify Migration:**
   - Check that videos are now associated with the authenticated user
   - Verify anonymous session video count is reset to 0

### 2.2. Video Count Tracking Verification

1. **Test Anonymous Video Count Update:**
   ```bash
   # Note: This assumes you have created a video. In a real test scenario, 
   # you would need to add a video with a POST request first
   curl -X GET http://localhost:5000/api/anonymous/videos/count \
     -H "X-Anonymous-Session: anon_$(date +%s)_counttest"
   ```

2. **Check Limit Enforcement:**
   After adding 3 videos, try to add a 4th video to verify the limit is enforced.

### 2.3. Data Migration Integrity Test

1. **Create Anonymous Session:**
   ```bash
   export SESSION_ID="anon_$(date +%s)_integritytest"
   ```

2. **Add Videos to Anonymous Session:**
   (Not shown - would require POST requests to add videos)

3. **Register and Login:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "integritytest",
       "email": "integrity@example.com",
       "password": "SecureIntegrity123!"
     }' \
     -c cookies.txt
   ```

4. **Migrate Data:**
   ```bash
   curl -X POST http://localhost:5000/api/anonymous/migrate \
     -H "Content-Type: application/json" \
     -H "X-Anonymous-Session: $SESSION_ID" \
     -b cookies.txt \
     -d "{
       \"sessionId\": \"$SESSION_ID\"
     }"
   ```

5. **Verify Integrity:**
   - Check that all video metadata is correctly preserved
   - Verify video count on the user account is accurate
   - Confirm category associations are maintained

## 3. Security Verification

### 3.1. Password Hashing Verification

1. **Register User:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "hashtest",
       "email": "hash@example.com",
       "password": "SecureHash123!"
     }'
   ```

2. **Database Verification:**
   Use the execute_sql_tool to check that the password is properly hashed:

   ```sql
   SELECT username, email, password, password_salt FROM users WHERE email = 'hash@example.com';
   ```

   **Expected Result:**
   - Password should be stored as a hash, not plaintext
   - A unique salt should be present
   - The hash should be using PBKDF2 (based on implementation)

### 3.2. Authentication Token Security

1. **Login:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "hash@example.com",
       "password": "SecureHash123!"
     }' \
     -v
   ```

2. **Inspect Cookies:**
   The `-v` flag will show the Set-Cookie header. Verify that:
   - Cookie is marked HttpOnly
   - Cookie has Secure flag (if using HTTPS)
   - Cookie has SameSite attribute
   - Cookie has appropriate expiration

### 3.3. CSRF Protection

1. **Login (as above)**

2. **Send Request Without CSRF Token:**
   For endpoints that require CSRF protection:
   ```bash
   curl -X POST http://localhost:5000/api/auth/change-password \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{
       "currentPassword": "SecureHash123!",
       "newPassword": "UpdatedPassword123!"
     }'
   ```

   **Expected Result:** 403 Forbidden or 400 Bad Request (Missing CSRF token)

3. **Get CSRF Token (Normally From Frontend):**
   ```bash
   curl -X GET http://localhost:5000/api/auth/csrf-token \
     -b cookies.txt
   ```

4. **Send Request With CSRF Token:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/change-password \
     -H "Content-Type: application/json" \
     -H "X-CSRF-Token: obtained_token" \
     -b cookies.txt \
     -d '{
       "currentPassword": "SecureHash123!",
       "newPassword": "UpdatedPassword123!"
     }'
   ```

   **Expected Result:** 200 OK

### 3.4. Session Invalidation on Logout

1. **Login:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "hash@example.com",
       "password": "SecureHash123!"
     }' \
     -c cookies.txt
   ```

2. **Access Protected Resource:**
   ```bash
   curl -X GET http://localhost:5000/api/auth/me \
     -b cookies.txt
   ```

   **Expected Result:** 200 OK with user data

3. **Logout:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/logout \
     -b cookies.txt \
     -c cookies_after_logout.txt
   ```

4. **Try to Access Protected Resource Again:**
   ```bash
   curl -X GET http://localhost:5000/api/auth/me \
     -b cookies_after_logout.txt
   ```

   **Expected Result:** 401 Unauthorized

5. **Verify Cookie Cleared:**
   Check that `cookies_after_logout.txt` no longer contains the auth token cookie.

## 4. Potential Issues & Gaps

Based on the implemented functionality, here are potential issues to check:

1. **Session Management:**
   - **Concern:** Proper session expiration for inactive sessions
   - **Verification:** Check if long-unused sessions are automatically cleared
   - **Expected Behavior:** Anonymous sessions older than the defined threshold (e.g., 30 days) should be removed

2. **Rate Limiting:**
   - **Concern:** Protection against brute force attacks
   - **Verification:** Attempt multiple failed logins in succession
   - **Expected Behavior:** After multiple failures, requests should be temporarily blocked

3. **Error Handling:**
   - **Concern:** Consistent error responses
   - **Verification:** Check all endpoints return properly formatted error objects
   - **Expected Behavior:** All errors should have a consistent structure with appropriate status codes

4. **Token Regeneration:**
   - **Concern:** Token rotation and refresh mechanisms
   - **Verification:** Check if tokens are refreshed periodically
   - **Expected Behavior:** Long-lived sessions should have their tokens rotated regularly

5. **Anonymous Session Data Limits:**
   - **Concern:** Proper enforcement of the 3-video limit
   - **Verification:** Test adding more than the allowed videos
   - **Expected Behavior:** System should reject additions beyond the limit

6. **Data Persistence:**
   - **Concern:** Ensure data isn't lost during migration
   - **Verification:** Inspect database state before and after migration
   - **Expected Behavior:** All relevant data should transfer from anonymous to authenticated user

7. **Edge Cases:**
   - Migration with no videos
   - Migration with the maximum number of videos
   - Multiple migration attempts with the same anonymous session
   - Concurrent access to the same anonymous session

8. **Security Headers:**
   - **Concern:** Proper security headers set
   - **Verification:** Check Content-Security-Policy and other security headers
   - **Expected Behavior:** All responses should include appropriate security headers

## 5. Testing Configuration

Before running these tests, ensure:

1. The application is running (server started)
2. The database is properly initialized with all tables
3. Any required environment variables are set
4. Required packages for testing (curl, jq, etc.) are available

## 6. Documentation for Test Results

When executing these tests, document:

1. Each test executed and its result (pass/fail)
2. Any unexpected behavior or errors
3. Response times for critical operations
4. Any security concerns discovered
5. Recommendations for improvements before frontend integration

By thoroughly testing these components, we can ensure the authentication backend is robust and ready for integration with the frontend.