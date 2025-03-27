# Anonymous User Flow Testing Suite

This suite of tests verifies the functionality of the anonymous user flow in the application. It includes tests for:

- Session creation and management
- Video storage and retrieval
- Video limit enforcement (3 videos per anonymous session)
- Q&A conversation functionality
- Search capabilities
- Edge cases and error handling

## Test Scripts

1. **test-anonymous-flow.ts**: Tests the basic end-to-end flow for anonymous users, including session creation, video creation, and Q&A functionality.

2. **test-anonymous-client.ts**: Simulates client-side interactions, testing the API from a client perspective with proper headers and session management.

3. **test-anonymous-edge-cases.ts**: Tests various edge cases including session expiration, invalid sessions, concurrent operations, and resource limits.

4. **test-anonymous-sessions.ts**: Focuses specifically on session management functionality, including creation, updating, and cleaning up inactive sessions.

5. **run-all-anonymous-tests.ts**: Runs all the above tests in sequence and generates a consolidated report. (Note: May time out if tests take too long)

## Running the Tests

You can run individual tests with:

```bash
node --import tsx scripts/test-anonymous-flow.ts
node --import tsx scripts/test-anonymous-client.ts
node --import tsx scripts/test-anonymous-edge-cases.ts
node --import tsx scripts/test-anonymous-sessions.ts
```

Or run all tests sequentially using the provided shell script:

```bash
./run-anonymous-tests.sh
```

## Test Plan

For detailed information about the test approach, goals, and specific test cases, refer to the `test-plan-anonymous-user-flow.md` document.

## Notes

- All tests use a dedicated anonymous user ID (7) for testing purposes
- Test sessions are identified with predictable IDs to facilitate cleanup
- Most tests clean up after themselves, but if needed, run the `scripts/cleanup-inactive-sessions.ts` script to remove any lingering test sessions