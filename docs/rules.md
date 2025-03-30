# CTO-CEO and AI Dev Agent Communication Guidelines

## Context Awareness

| Entity | Application Context | Conversation Context | Documentation Access |
|--------|---------------------|----------------------|----------------------|
| **CTO-CEO Chat** | Limited - no direct access to codebase or environment | Full - aware of overall progress, goals, and strategic direction | Can read all documents, can modify PRD and status.md |
| **AI Dev Agent** | Full - has access to codebase and environment | Limited - not aware of previous conversations unless explicitly told | Can read all documents, can modify arch.md |

## Key Documents

### Core Documents

| Document | Purpose | Access Rights |
|----------|---------|---------------|
| **prd.md** | Product requirements document | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |
| **arch.md** | System architecture and technology documentation | CTO-CEO: Read-only<br>AI Dev Agent: Read/Write |
| **status.md** | Overall product status and roadmap | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |
| **rules.md** | Communication rules between AI Dev Agent and CTO | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |

### Sprint-Specific Documents

The project is implemented in sprints, with dedicated documentation for each sprint located in the corresponding `docs/sprint_X` folder (e.g., `docs/sprint_1` for Sprint 1).

| Document | Purpose | Access Rights |
|----------|---------|---------------|
| **sprint{X}-progress-report.md** | Current implementation progress, issue tracking, and references to other relevant documents | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |
| **sprint{X}-implementation-plan.md** | Specific implementation plan outlining the overall goals and tasks for the sprint (may have alternate names, e.g., `auth-implementation-plan.md` for Sprint 1) | CTO-CEO: Read/Write<br>AI Dev Agent: Read-only |
| **Other sprint-specific documents** | May include testing plans, design documents, research findings, etc. specific to the sprint | Varies by document |

## Communication Protocol

1. **Context Bridging**: CTO-CEO must explicitly remind AI Dev Agent about relevant conversation context in each prompt, as the Agent doesn't retain conversation history between sessions.

2. **Document References**: The AI Dev Agent must be explicitly instructed to read specific documents if that context is needed for the current task.

3. **Sprint Context**: When working on a specific sprint, the AI Dev Agent should be directed to review the relevant sprint documentation in the `docs/sprint_X` folder. The sprint progress report in particular provides critical context about current implementation status and priorities.

3. **Progress Tracking**: CTO-CEO maintains awareness of overall progress and strategic direction, while AI Dev Agent has detailed knowledge of implementation status.

4. **Task Scoping**: 
   - CTO-CEO defines strategic goals and requirements
   - AI Dev Agent handles technical implementation details
   - CTO-CEO should provide appropriate scope (MVP vs. comprehensive implementation)

5. **Implementation Approach**:
   - AI Dev Agent works better with broader-scoped (coarse-grained) tasks rather than incremental steps
   - CTO-CEO should provide prompts that encompass related components in a cohesive unit of work
   - Avoid breaking tasks into too many small steps, which leads to fragmented implementation
   - CTO-CEO should explicitly remind AI Dev Agent about MVP scope when relevant

6. **Session Management**:
   - When starting a new chat session, CTO-CEO must recap progress and goals
   - AI Dev Agent will have full access to application context but not previous conversation details

7. **Integration Verification**:
   - CTO-CEO should request testing instructions and verification for all implementations
   - AI Dev Agent should provide clear testing steps for both developer and end-user testing
   - Request evidence that new components integrate properly with existing code

## Understanding AI Dev Agent's Strengths

1. **Project Structure Comprehension**:
   - Excels at understanding overall project architecture
   - Strong ability to grasp existing code patterns and conventions
   - Good at configuration, environments, and infrastructure setups

2. **Technical Implementation**:
   - Capable of translating requirements into working code
   - Follows clean architecture and domain-driven design principles 
   - Implements iterative solutions starting with MVPs

3. **Challenges**:
   - Can sometimes get lost in the codebase
   - May not retain previous conversation context
   - Works better with cohesive tasks than fragmented instructions

## Optimal Prompt Structure

For optimal results, structure prompts following this pattern:

```
For our [Project Name] MVP, we need to implement [Feature]. This aligns with our objectives outlined in [Document Reference].

This task is part of Sprint [X] as detailed in docs/sprint_[X]/sprint[X]-progress-report.md.

Before implementation, please review:
- docs/sprint_[X]/sprint[X]-progress-report.md for current sprint status
- docs/sprint_[X]/[implementation-plan-document].md for detailed implementation guidelines
- [Document 1] for [specific context]
- [Document 2] for [specific context]
- [Document 3] for [specific context]

For this implementation, focus on:
1. [Component 1 with clear deliverables]
2. [Component 2 with clear deliverables]
3. [Component 3 with clear deliverables]

Implementation considerations:
- [Architectural principle to follow]
- [Integration requirements]
- [Security/performance considerations]
- [How this fits into the sprint objectives]

When complete, provide:
- Testing instructions to verify functionality
- Examples of how to use the new features
- Any configuration changes needed
- How this implementation addresses the sprint goals

Start by showing your implementation plan, then proceed with the code.
```

## Common Pitfalls to Avoid

1. **Over-Segmentation**:
   - Avoid breaking tasks into too many small steps
   - The agent works better with cohesive, related functionality
   - Smaller prompts can lead to fragmented implementations

2. **Assumed Knowledge**:
   - Don't assume the agent remembers previous conversations
   - Always restate critical context and requirements
   - Reference specific documents rather than relying on memory

3. **Ambiguous Requirements**:
   - Provide clear decisions on implementation approaches
   - Specify technology choices when relevant
   - Define expected behaviors explicitly

## Best Practices

1. **Sprint-Oriented Communication**: Begin each prompt with a clear statement of the current goal, which sprint it belongs to, and how it relates to the overall MVP. Reference the specific sprint progress report to provide context.

2. **Progress Recaps**: Provide a brief summary of what's been accomplished when starting new sessions.

3. **Scope Management**: Explicitly state when implementing for MVP vs. when adding enhancements.

4. **Implementation Verification**: 
   - Request testing instructions for all implementations
   - Ask for both developer testing (API/code) and end-user testing (UI workflow)
   - Ensure implementations work correctly with existing functionality

5. **Integration Focus**: Prioritize ensuring new components work with existing code.

6. **Documentation Updates**: Periodically request updates to architectural documentation to reflect implementation changes.

7. **Testable Deliverables**: Prefer prompts that result in functionality that can be tested end-to-end rather than partial implementations.

8. **Sprint Document References**: Always reference the current sprint's progress report and implementation plan documents to ensure the AI Dev Agent has the most up-to-date context for the task.
