# Authentication System Testing Plan

This document outlines the testing approach for the YouTube Knowledge Miner authentication system after connecting the frontend to the existing backend endpoints.

## 1. Anonymous User Flow

### 1.1 New User Getting an Anonymous Session
- **Test Steps**:
  1. Clear all cookies and site data
  2. Open the application
  3. Check browser cookies and network requests
  4. Verify anonymous session cookie is created
  5. Check console logs for session ID creation

### 1.2 Adding Videos and Tracking the Count
- **Test Steps**:
  1. With an anonymous session active, add a new video
  2. Check network requests to verify `/api/anonymous/videos/count` is called
  3. Add a second video and verify count increments
  4. Check backend logs for count updates

### 1.3 Approaching and Hitting the 3-Video Limit
- **Test Steps**:
  1. Add videos until reaching the limit (3 videos)
  2. Verify the UI shows appropriate warnings when approaching the limit
  3. Attempt to add a 4th video and verify restriction
  4. Observe UI prompts encouraging registration

### 1.4 Strategic Prompts
- **Test Steps**:
  1. Observe when promotional/registration prompts appear
  2. Verify prompts are contextual and appear at appropriate times
  3. Test "dismiss" functionality if available
  4. Verify suppressed prompts remain hidden per user preference

## 2. Registration & Login

### 2.1 Creating a New Account
- **Test Steps**:
  1. Navigate to registration form
  2. Submit with valid credentials
  3. Verify network requests and responses
  4. Check database for user creation
  5. Verify authentication state changes correctly

### 2.2 Login with Different Methods
- **Test Steps**:
  1. Test login with username
  2. Test login with email
  3. Verify appropriate success/error messages
  4. Check authentication cookies

### 2.3 Form Validation and Error Handling
- **Test Steps**:
  1. Test all validation rules (password strength, email format, etc.)
  2. Submit duplicate username/email
  3. Test invalid credentials
  4. Verify error messages are clear and helpful

### 2.4 Session Persistence after Page Reload
- **Test Steps**:
  1. Login successfully
  2. Reload the page
  3. Verify authentication state remains
  4. Check network requests for session validation

## 3. Migration Process

### 3.1 Migrating Anonymous Content During Registration
- **Test Steps**:
  1. Create anonymous session and add videos
  2. Complete registration process with migration option
  3. Verify migration happens on backend
  4. Check database for updated video ownership
  5. Verify success messages and UI updates

### 3.2 Migrating Content After Login
- **Test Steps**:
  1. Create anonymous session with videos
  2. Login to existing account
  3. Trigger migration process manually
  4. Verify backend migration endpoint is called
  5. Check for success/error notifications

### 3.3 Verifying Correct Video Transfer
- **Test Steps**:
  1. Verify videos maintain all metadata after migration
  2. Check video count before and after migration
  3. Verify videos appear in user's library after migration
  4. Ensure anonymous session videos are properly handled

### 3.4 Edge Cases
- **Test Steps**:
  1. Test migration with no anonymous content
  2. Test migration with maximum content (3 videos)
  3. Test migration to account that already has videos
  4. Test migration with invalid session ID

## 4. Session Management

### 4.1 Logout Functionality
- **Test Steps**:
  1. Login and verify authentication
  2. Trigger logout
  3. Verify cookies are cleared
  4. Check authentication state changes
  5. Attempt to access protected resources after logout

### 4.2 Session Expiration (if implemented)
- **Test Steps**:
  1. Login and check cookie expiration times
  2. Test session behavior after extended periods
  3. Verify graceful handling of expired sessions

### 4.3 Security Aspects
- **Test Steps**:
  1. Verify cookies have appropriate security flags (HttpOnly, SameSite)
  2. Check for CSRF protections
  3. Test API endpoints for proper authentication requirements
  4. Verify sensitive operations require re-authentication if applicable

## Testing Tools

- Browser Developer Tools (Network, Application, Console tabs)
- Database inspection tools (PostgreSQL client)
- Server logs
- Browser automation (if needed for complex scenarios)

## Test Documentation Format

For each test scenario, we will document:
- Steps taken to reproduce
- Screenshots of key UI elements
- Network request/response details
- Any issues or unexpected behavior
- Verification steps for backend changes

## Success Criteria

The authentication system will be considered successfully implemented if:
1. Anonymous users can create sessions and add videos up to the limit
2. Registration and login function correctly with appropriate validation
3. Migration of anonymous content works reliably
4. Sessions are secure and properly managed
5. The UI provides appropriate guidance and error feedback
6. All backend endpoints return expected responses

## Test Report

After completion, findings will be documented with details on:
- Completed authentication implementation
- Integration between frontend and backend components
- Any outstanding issues or limitations
- Recommendations for future improvements

### Test Reports
- [Authentication Testing Report 1](Authentication%20Testing%20Report%201.md) - Initial testing of authentication system
- [Authentication Testing Report 2](Authentication%20Testing%20Report%202.md) - Follow-up testing with improvements
- [Authentication Testing Report 3](Authentication%20Testing%20Report%203.md) - Latest comprehensive testing (March 30, 2025)

The latest report contains the most up-to-date testing results and should be consulted for the current state of the authentication system.