# CTO-CEO and AI Dev Agent Communication Guidelines

## Context Awareness

| Entity | Application Context | Conversation Context | Documentation Access |
|--------|---------------------|----------------------|----------------------|
| **CTO-CEO Chat** | Limited - no direct access to codebase or environment | Full - aware of overall progress, goals, and strategic direction | Can read all documents, can modify PRD and status.md |
| **AI Dev Agent** | Full - has access to codebase and environment | Limited - not aware of previous conversations unless explicitly told | Can read all documents, can modify arch.md |

## Key Documents

| Document | Purpose | Access Rights |
|----------|---------|---------------|
| **prd.md** | Product requirements document | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |
| **arch.md** | System architecture and technology documentation | CTO-CEO: Read-only<br>AI Dev Agent: Read/Write |
| **status.md** | Overall product status and roadmap | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |
| **rules.md** | Communication rules between AI Dev Agent and CTO | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |

## Communication Protocol

1. **Context Bridging**: CTO-CEO must explicitly remind AI Dev Agent about relevant conversation context in each prompt, as the Agent doesn't retain conversation history between sessions.

2. **Document References**: The AI Dev Agent must be explicitly instructed to read specific documents if that context is needed for the current task.

3. **Progress Tracking**: CTO-CEO maintains awareness of overall progress and strategic direction, while AI Dev Agent has detailed knowledge of implementation status.

4. **Task Scoping**: 
   - CTO-CEO defines strategic goals and requirements
   - AI Dev Agent handles technical implementation details
   - CTO-CEO should provide appropriate scope (MVP vs. comprehensive implementation)

5. **Implementation Approach**:
   - AI Dev Agent seems to work better with broader-scoped tasks rather than incremental steps
   - CTO-CEO should provide coarse-grained prompts that encompass related components
   - CTO-CEO should explicitly remind AI Dev Agent about MVP scope when relevant

6. **Session Management**:
   - When starting a new chat session, CTO-CEO must recap progress and goals
   - AI Dev Agent will have full access to application context but not previous conversation details

7. **Integration Verification**:
   - CTO-CEO should request verification that new components integrate properly with existing code
   - AI Dev Agent should proactively check for integration issues

## Best Practices

1. **Clear Goal Setting**: Begin each prompt with a clear statement of the current goal and how it relates to the overall MVP.

2. **Progress Recaps**: Provide a brief summary of what's been accomplished when starting new sessions.

3. **Scope Management**: Explicitly state when implementing for MVP vs. when adding enhancements.

4. **Implementation Verification**: Regularly request evidence that implementations are working (e.g., "Show me the code").

5. **Integration Focus**: Prioritize ensuring new components work with existing code.

6. **Documentation Updates**: Periodically request updates to architectural documentation to reflect implementation changes.

7. **Practical Testing**: Request simple test cases to verify functionality rather than comprehensive test suites.
