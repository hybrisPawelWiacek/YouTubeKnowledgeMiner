# Anonymous User Flow Integration Test Plan

## 1. Overview

This test plan outlines a comprehensive approach to verify that the anonymous user flow works correctly end-to-end in YouTubeKnowledgeMiner. It includes test cases for all CRUD operations, session handling, error cases, and edge conditions.

### 1.1 System Architecture Summary

The anonymous user functionality is based on:
- Client-side session ID management via localStorage
- Server-side session tracking in the database
- Dedicated anonymous user ID (7) with session-specific filtering
- 3-video limit enforcement per anonymous session
- Support for Q&A conversations, search, and categories
- Migration path to authenticated user accounts

## 2. Test Environment Setup

### 2.1 Prerequisites
- Clean database state
- Browser with localStorage access
- Access to API endpoints

### 2.2 Test Data
- YouTube video URLs for analysis
- Test questions for Q&A functionality
- Test search queries

## 3. Test Scenarios

### 3.1 Session Management Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| SM-01 | New session creation | 1. Clear localStorage<br>2. Load application | - New anonymous session ID created and stored<br>- Session visible in database with 0 video count | None |
| SM-02 | Session persistence | 1. Load application with existing session<br>2. Refresh page | - Original session ID preserved<br>- No new session created | SM-01 |
| SM-03 | Session header inclusion | 1. Monitor network requests<br>2. Perform any API operation | - All requests include x-anonymous-session header<br>- Header value matches localStorage value | SM-01 |
| SM-04 | Last active update | 1. Track session's last_active_at in DB<br>2. Perform API operation<br>3. Check updated timestamp | - last_active_at timestamp updated after operation | SM-01 |
| SM-05 | Video count tracking | 1. Add a video<br>2. Check video_count in DB | - video_count incremented by 1<br>- Count displayed correctly in UI | SM-01 |

### 3.2 Video Analysis Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| VA-01 | Add first video | 1. Enter YouTube URL<br>2. Submit for analysis | - Video analyzed successfully<br>- Video appears in library<br>- Video count = 1 | SM-01 |
| VA-02 | Add second video | 1. Enter different YouTube URL<br>2. Submit for analysis | - Second video analyzed successfully<br>- Both videos appear in library<br>- Video count = 2 | VA-01 |
| VA-03 | Add third video | 1. Enter third YouTube URL<br>2. Submit for analysis | - Third video analyzed successfully<br>- All three videos appear in library<br>- Video count = 3<br>- UI indicates limit reached | VA-02 |
| VA-04 | Attempt to exceed limit | 1. Enter fourth YouTube URL<br>2. Submit for analysis | - Error message indicating limit reached<br>- Prompt to create account<br>- No video processed<br>- Video count remains 3 | VA-03 |
| VA-05 | View video details | 1. Click on a video in library | - Video details page loads<br>- Transcript, summary visible<br>- Q&A tab accessible | VA-01 |
| VA-06 | Edit video (add notes) | 1. Add notes to a video<br>2. Save changes | - Notes saved successfully<br>- Changes persist after refresh | VA-05 |
| VA-07 | Edit video (change category) | 1. Assign global category to video<br>2. Save changes | - Category assigned successfully<br>- Changes persist after refresh | VA-05 |
| VA-08 | Mark video as favorite | 1. Mark video as favorite<br>2. Check library view | - Favorite status saved<br>- Video appears with favorite indicator | VA-05 |
| VA-09 | Delete video | 1. Delete one video<br>2. Check video count | - Video removed from library<br>- Video count decremented<br>- Can add a new video | VA-03 |

### 3.3 Q&A Conversation Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| QA-01 | Create conversation | 1. Open video details<br>2. Click Q&A tab<br>3. Start new conversation | - New conversation created<br>- Conversation appears in list | VA-05 |
| QA-02 | Ask initial question | 1. Type question<br>2. Submit | - Question processed<br>- AI response generated with citations<br>- Messages saved in conversation | QA-01 |
| QA-03 | Ask follow-up question | 1. Type follow-up question<br>2. Submit | - Follow-up processed in context<br>- AI response considers conversation history<br>- New messages added to conversation | QA-02 |
| QA-04 | View conversations | 1. Navigate away from video<br>2. Return to video<br>3. Open Q&A tab | - All conversations preserved<br>- Can access previous conversations | QA-01 |
| QA-05 | Delete conversation | 1. Delete a conversation<br>2. Check conversation list | - Conversation removed<br>- Other conversations preserved | QA-01 |
| QA-06 | Create multiple conversations | 1. Create additional conversation<br>2. Check conversation list | - Multiple conversations visible<br>- Can switch between conversations | QA-01 |

### 3.4 Search Functionality Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| SF-01 | Basic transcript search | 1. Enter search term in global search<br>2. Submit search | - Results returned from transcript content<br>- Results filtered to anonymous session's videos | VA-01 |
| SF-02 | Search with no results | 1. Search for term not in any content<br>2. View results | - "No results" message displayed<br>- Option to try different search terms | SF-01 |
| SF-03 | Search across video types | 1. Search with videos in different categories<br>2. View results | - Results from multiple videos displayed<br>- Results properly categorized | VA-07 |
| SF-04 | Search Q&A content | 1. Search for term mentioned in Q&A<br>2. View results | - Q&A conversations included in results<br>- Can navigate to conversation from results | QA-02 |
| SF-05 | Search with filters | 1. Apply filters to search (e.g., content type)<br>2. View filtered results | - Results correctly filtered<br>- Only matching content types displayed | SF-01 |

### 3.5 Category Management Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| CM-01 | View global categories | 1. Open category dropdown in video edit | - Global categories (Educational, AI Dev, Agentic Flow) visible<br>- Marked as "(Global)" | VA-05 |
| CM-02 | Assign global category | 1. Select global category<br>2. Save video | - Category assigned successfully<br>- Category visible in video details | CM-01 |
| CM-03 | Filter by category | 1. Select category filter in library<br>2. View filtered results | - Only videos in selected category displayed<br>- Filter state preserved on refresh | CM-02 |
| CM-04 | Attempt custom category | 1. Try to create custom category | - Prompt to create account<br>- No custom category created | CM-01 |

### 3.6 Session Limit & Error Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| SL-01 | Video limit UI | 1. Add 3 videos<br>2. Check limit indicators | - UI shows 3/3 videos used<br>- Visual indicators of limit reached | VA-03 |
| SL-02 | Missing session ID | 1. Manually remove session header<br>2. Attempt API operation | - Error with SESSION_REQUIRED code<br>- Appropriate error message | SM-01 |
| SL-03 | Invalid session ID | 1. Modify session ID to invalid value<br>2. Attempt API operation | - New session created<br>- Operation proceeds with new session | SM-01 |
| SL-04 | Session expiration | 1. Modify session timestamp to be old<br>2. Wait for cleanup<br>3. Attempt operation | - Old session removed<br>- New session created<br>- Previous videos not accessible | SM-01 |

### 3.7 Anonymous-to-Authenticated Migration Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| AM-01 | Account creation prompt | 1. Reach video limit<br>2. Attempt to add more | - Clear account creation prompt<br>- Value proposition explained | VA-03 |
| AM-02 | Migration preparation | 1. Simulate account creation<br>2. Check migration API | - Anonymous session ID passed to migration endpoint<br>- User ID assigned correctly | AM-01 |
| AM-03 | Content migration | 1. Complete migration process<br>2. Check user library | - All videos transferred to new account<br>- Associated data (Q&A, categories) preserved<br>- Anonymous session cleared | AM-02 |

## 4. Edge Cases & Resilience Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| EC-01 | Multiple browser tabs | 1. Open application in multiple tabs<br>2. Perform operations in each | - Session consistent across tabs<br>- No conflicts between operations | SM-01 |
| EC-02 | Network interruption | 1. Start video analysis<br>2. Disconnect network<br>3. Reconnect and retry | - Graceful error handling<br>- Clear recovery options<br>- Ability to retry failed operation | VA-01 |
| EC-03 | Browser storage cleared | 1. Start session<br>2. Clear browser storage<br>3. Reload page | - New session created<br>- Previous data not accessible<br>- Fresh start experience | SM-01 |
| EC-04 | Concurrent operations | 1. Start multiple operations simultaneously<br>2. Check results | - Operations processed correctly<br>- No data corruption<br>- All operations tracked in session | VA-01 |
| EC-05 | Large content processing | 1. Analyze very long video<br>2. Check processing and results | - Video processed successfully<br>- No timeouts or truncation<br>- Complete transcript and analysis available | VA-01 |

## 5. Performance & Load Tests

| ID | Test Case | Steps | Expected Result | Dependencies |
|----|-----------|-------|----------------|--------------|
| PL-01 | Multiple video navigation | 1. Add maximum videos<br>2. Navigate quickly between them | - Responsive UI during navigation<br>- Content loads without significant delay | VA-03 |
| PL-02 | Rapid Q&A exchanges | 1. Create conversation<br>2. Submit multiple questions quickly | - Questions queued appropriately<br>- All questions processed<br>- No lost responses | QA-01 |
| PL-03 | Search performance | 1. Build library with maximum videos<br>2. Perform complex searches | - Search results returned in reasonable time<br>- UI remains responsive during search | SF-01 |

## 6. Test Execution & Reporting

### 6.1 Test Execution Sequence
1. Start with Session Management tests
2. Proceed to Video Analysis tests
3. Continue with dependent test categories
4. Complete with edge cases and performance tests

### 6.2 Test Results Documentation
For each test case, document:
- Pass/Fail status
- Actual result versus expected result
- Screenshots of key interactions
- Any errors encountered
- Browser and device information

### 6.3 Issue Tracking
For failed tests:
- Document steps to reproduce
- Note expected vs. actual behavior
- Assign priority based on impact
- Create fix plan

## 7. Success Criteria

The anonymous user flow will be considered successful if:
1. All test cases marked as critical pass
2. No high-priority bugs remain unresolved
3. The full anonymous user journey can be completed without interruption
4. Performance metrics meet acceptable thresholds
5. Error cases are handled gracefully with clear user guidance