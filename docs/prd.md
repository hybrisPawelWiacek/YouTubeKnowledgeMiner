# YouTube Buddy: Video Summary & Q&A
## Product Requirements Document (PRD)

### Document Information
- **Version:** 1.0
- **Date:** March 29, 2025
- **Status:** Planning Phase

## 1. Executive Summary

YouTube Buddy is a comprehensive web application that enables users to save, summarize, and interact with YouTube videos. The platform leverages AI to automatically generate concise summaries of video content and allows users to ask questions about specific videos through an interactive Q&A interface. Users can build a personal library of videos, organize them with categories and collections, and search across their entire library using advanced semantic search capabilities.

The application addresses information overload and time constraints by providing efficient tools to extract, organize, and retrieve valuable knowledge from YouTube content. It serves both casual users with limited needs (via anonymous sessions) and power users requiring advanced organization and unlimited storage.

## 2. Product Vision

YouTube Buddy transforms how users consume and interact with YouTube content by:

- Enabling quick understanding of video content through AI-generated summaries
- Creating a personalized knowledge base of video content
- Facilitating deeper exploration through contextual Q&A
- Providing powerful organization and retrieval mechanisms
- Offering a frictionless experience from anonymous to authenticated usage

The product serves audiences who consume educational, informational, and professional content on YouTube, including researchers, students, professionals, and lifelong learners.

## 3. Target Users & Use Cases

### Target Users
- Knowledge workers and professionals who use YouTube for learning
- Students and researchers gathering information
- Content creators researching topics
- Anyone who wants to save time while consuming video content

### Primary Use Cases
1. **Quick Content Review:** Generate and read summaries of videos without watching the full content
2. **Personal Knowledge Library:** Save and organize valuable videos for future reference
3. **Deep Content Interaction:** Ask specific questions about video content
4. **Information Retrieval:** Search across collected videos to find specific information
5. **Progressive Engagement:** Start as anonymous user and transition to authenticated user without data loss

## 4. Core Requirements & Features

### Phase 1: Core Functionality & Foundation

#### Infrastructure & Setup
- Responsive web application (desktop, tablet, mobile)
- Dark-themed UI with clean, modern interface using Tailwind CSS and Shadcn UI components
- Database integration with PostgreSQL and vector extensions
- Basic authentication system

#### Video Processing Pipeline
- YouTube URL input with validation
- YouTube Data API integration for metadata (title, channel, duration, etc.)
- YouTube Transcript API integration for extracting transcripts
- OpenAI integration for generating summaries
- Error handling for videos without available transcripts

#### Basic Video Storage & Display
- Storage of video metadata, transcript, and summary in database
- Form interface for user metadata (notes, category, rating)
- Basic video detail view with summary display

#### Anonymous User Foundation
- Server-side session management for anonymous users
- Database-backed session tracking and persistence
- Unique session IDs with creation and last-active timestamps
- Video count tracking for anonymous users
- 3-video limit enforcement for anonymous sessions

#### UI Foundation
- Responsive layout for all device sizes
- Dark theme with consistent styling
- Basic navigation structure

### Phase 2: Library Management & Organization

#### Video Library Views
- Grid/Tile view with thumbnails (default)
- List view as alternative
- View toggle controls
- Display of key video metadata
- Responsive design across screen sizes

#### Advanced Search & Filtering
- Full-text search across video data
- Category-based filtering
- Rating-based filtering
- Date range filtering
- Combined filters
- Sorting options (date, title, rating)
- Saved searches functionality

#### Video Collection Organization
- Creation of named collections
- Adding/removing videos from collections
- Collection membership display on video cards
- Bulk operations:
  - Multi-select videos
  - Batch categorization
  - Bulk delete with confirmation
  - Bulk add to collections

#### Video Management
- Comprehensive edit capabilities:
  - Notes/comments
  - Category assignment
  - Ratings
  - Timestamps/highlights
- Video deletion functionality
- Favorite/bookmark functionality

#### Category Management
- Global category system with predefined options:
  - Educational, AI Dev, and Agentic Flow global categories
  - Visual distinction between global and user categories
  - Consistent styling with blue color for global categories
  - Clear "(Global)" label identifier in UI elements
- User-specific custom categories
- Authentication requirement for creating custom categories
- Organized dropdown with separators between global and user categories

### Phase 3: Advanced Features

#### Interactive Q&A System
- Tabbed interface with Summary and Q&A sections
- Text input for asking questions about video content
- OpenAI integration for processing questions with transcript context
- Chat-like interface for conversation history
- Storage of Q&A exchanges in database
- Follow-up question capability

#### Enhanced Summary Features
- Summary viewing capabilities with clean formatting
- "Copy All" functionality for one-click copying
- Summary editing capabilities
- Visual highlighting for key moments
- Timestamp references to summary points

#### Export Functionality
- Transcript export in multiple formats (TXT, CSV, JSON)
- Summary export functionality with format options
- Option to export Q&A history
- Batch export capability for multiple videos

#### Performance Optimizations
- Efficient loading of video libraries
- Responsive UI with minimal lag
- Optimized API calls
- Client-side caching for frequent operations

### Phase 4: Semantic Search with RAG Implementation

#### Vector Database Setup
- pgvector extension configuration in Neon PostgreSQL (native to Replit)
- Vector embeddings table for storing transcript chunks
- Backend functionality to generate and store embeddings
- Batch processing for existing video content

#### Text Embedding Generation
- Integration with OpenAI embedding model
- Transcript chunking strategy
- Embeddings for transcripts, summaries, and notes
- Metadata linkage between vector embeddings and source content

#### Semantic Search Implementation
- Natural language query input
- Filters for content type
- Source video filtering options
- Vector similarity search implementation
- Relevance scoring and ranking
- Text highlighting of search matches with proper context
- Visual indicators for search result relevance
- Consistent highlighting across all content types (transcripts, summaries, notes, Q&A)

#### RAG-Enhanced Responses
- Retrieval system for relevant transcript sections
- Context assembly mechanism for feeding into generative AI
- Prompt engineering for contextually accurate responses
- Citation system to reference source videos and timestamps
- User feedback loop for response quality improvement

#### Performance & UX Optimization
- Caching for frequent searches
- Pagination with infinite scroll optimization
- Search suggestions based on content analysis
- Debounced search
- Clear visualization of search matches

### Phase 5: Authentication & User Onboarding

#### Google Authentication Integration
- Google OAuth provider with Supabase Auth
- Secure configuration for Google API credentials
- Login button with Google branding
- User profile retrieval from Google account
- Authentication state management
- Account linking for existing emails
- Storage of Google-provided user metadata

#### Strategic Account Creation Prompts
- Detection for unauthenticated users with stateful tracking
- Progressive engagement tracking system:
  - Tracks user interactions with application features
  - Uses different thresholds based on previous prompts
  - Prevents excessive prompting while guiding toward account creation
- Modal prompts at strategic moments:
  - When saving a video after analysis to highlight data persistence
  - When accessing the library to emphasize organization benefits
  - After reaching the 3-video limit to encourage premium features
  - When attempting high-value actions (collections, export, etc.)
- Non-intrusive prompt UI with clear value proposition
- Option to continue as guest with limited functionality
- "Remind me later" functionality with increasing thresholds
- Visual indicators showing usage limits (3 videos maximum)

#### Anonymous-to-Authenticated Transition
- Server-side anonymous session management:
  - Database-backed anonymous sessions with unique session IDs
  - Automatic creation and tracking of anonymous sessions
  - Last-active timestamp updates for session freshness
  - Session expiration and cleanup for inactive users
  - Strict enforcement of 3-video limit per anonymous session
- Comprehensive data migration path:
  - Function to retrieve session-specific content
  - Seamless transition function to authenticated state
  - Optimized data transfer preserving all user-created content
  - Proper session cleanup after successful migration
- Conflict resolution strategies for duplicate content
- Progress indicators during migration process
- Error handling with fallback options for failed migrations

#### Authentication UX Enhancements
- Persistent login state with secure token storage
- Intuitive login/logout UX in navigation
- User profile dropdown with account management options
- Clear authentication error messages
- Magic link email alternative for non-Google users

#### User Preference Management
- Basic settings for authentication preferences
- Advanced options for session duration
- Basic privacy controls for user data
- Account linking options for existing users
- Email notification preferences

### Phase 6: Final Refinements

#### User Experience Improvements
- Keyboard shortcuts for power users
- Onboarding tutorial/help system
- Enhanced user feedback mechanisms
- Performance optimizations for large libraries
- Offline capabilities for limited functionality
- Theme customization options

## 5. Technical Architecture

### Frontend Technologies

- **Framework:** React (with TypeScript)
- **Routing:** Wouter (lightweight router)
- **State Management:** React Query and React hooks
- **UI Framework:** Shadcn UI (based on Radix UI primitives)
- **Styling:** Tailwind CSS with theming support
- **Build Tools:** Vite (modern, fast bundler)
- **Form Handling:** React Hook Form with Zod validation

### Backend Technologies

- **Runtime:** Node.js
- **Framework:** Express.js (with TypeScript)
- **API Design:** RESTful API with proper error handling
- **Data Validation:** Zod schema validation
- **Database ORM:** Drizzle ORM for type-safe database operations
- **Database:** Neon PostgreSQL with pgvector (native to Replit)
- **TypeScript Execution:** tsx for running TypeScript directly

### Database and Storage

- **Primary Database:** Neon PostgreSQL (native to Replit)
- **Vector Capabilities:** pgvector extension for embeddings and semantic search
- **Schema Management:** Drizzle Schema with migration support
- **Data Validation:** Zod schemas with strong typing
- **Storage Architecture:** Simplified schema design with more integrated tables and fewer junction tables
- **Anonymous Data:** Server-side session management with database persistence

### Authentication & Security

- **Auth Provider:** Supabase Auth for Google OAuth and user management
- **Strategic Prompting:** Non-intrusive authentication prompts at key moments
- **Session Management:** Persistent login state with secure token storage
- **Anonymous Users:** Support for anonymous usage with optional account creation
- **Fallback System:** Application can function with or without Supabase configuration

### AI and Natural Language Processing

- **LLM Integration:** OpenAI API for text processing
- **Vector Embeddings:** Text embeddings for semantic search
- **Transcript Processing:** YouTube transcript API extraction
- **Batch Processing:** Optimized embedding generation to manage API rate limits
- **Context-Aware Q&A:** Retrieval-augmented generation for video-specific questions

### Data Model
The application uses a hybrid architecture with multi-tier storage approach:

**Primary Storage (Authenticated Users):**
- Neon PostgreSQL for persistent relational data storage
- pgvector extension for vector operations and semantic search
- Standardized schema with proper relationships and constraints
- Type-safe database operations via Drizzle ORM

**Anonymous User Storage:**
- Server-side session management with database persistence
- Standardized session schema with the following structure:
  ```typescript
  {
    id: number;                   // Auto-incrementing primary key
    session_id: string;           // Unique identifier (anon_[timestamp]_[random])
    created_at: Date;             // Session creation timestamp
    last_active_at: Date;         // Last activity timestamp (updated on each request)
    video_count: number;          // Number of videos saved by this anonymous user
    user_agent: string | null;    // Optional browser/device information
    ip_address: string | null;    // Optional IP address for security
  }
  ```
- Maximum limit enforcement (3 videos per anonymous session)
- Client-side caching of session ID in localStorage
- Backend validation on all API requests
- Database compatibility via special handling of null user_id values

**Authentication Integration:**
- Supabase for user authentication and session management
- Dual-mode architecture allowing operation with or without authentication
- Clean migration path from anonymous to authenticated state
- Fallback mechanisms for operation without Supabase configuration

### Key Libraries

#### Frontend Libraries

- **@radix-ui:** Comprehensive set of accessible UI primitives
- **@tanstack/react-query:** Data fetching and state management
- **react-hook-form:** Form state management and validation
- **zod:** Schema validation for form inputs
- **tailwind-merge & class-variance-authority:** Utility for managing CSS classes
- **lucide-react:** Icon library
- **recharts:** Data visualization
- **wouter:** Lightweight router

#### Backend Libraries

- **express:** Web server framework
- **drizzle-orm:** Type-safe ORM for database operations
- **openai:** OpenAI API client
- **supabase-js:** Supabase client for authentication
- **pg:** PostgreSQL client
- **zod:** Schema validation for API requests
- **cheerio:** HTML parsing for additional metadata
- **dotenv:** Environment variable management
- **youtube-transcript-api:** Extracts transcripts from YouTube videos

#### Development Tools

- **typescript:** Static typing
- **vite:** Modern build tool
- **drizzle-kit:** Database schema management
- **postcss & tailwindcss:** CSS processing
- **tsx:** TypeScript execution without compilation

## 6. Implementation Timeline

### Phase 1: Core Functionality & Foundation (Weeks 1-4)
- Set up project structure and CI/CD pipeline
- Implement database schema and ORM integration
- Create basic UI layout and responsive design
- Build YouTube video processing pipeline
- Implement anonymous session management system
- Develop basic video storage and display functionality

### Phase 2: Library Management & Organization (Weeks 5-8)
- Implement video library views (grid, list)
- Build search and filtering capabilities
- Create collection organization system
- Develop comprehensive video management features
- Implement category management system

### Phase 3: Advanced Features (Weeks 9-12)
- Build interactive Q&A system
- Implement enhanced summary features
- Develop export functionality
- Optimize performance for core features

### Phase 4: Semantic Search with RAG Implementation (Weeks 13-16)
- Configure vector database capabilities
- Implement text embedding generation
- Build semantic search functionality
- Develop RAG-enhanced responses
- Optimize search performance and UX

### Phase 5: Authentication & User Onboarding (Weeks 17-20)
- Integrate Google OAuth authentication
- Implement strategic account creation prompts
- Build anonymous-to-authenticated transition
- Develop authentication UX enhancements
- Create user preference management system

### Phase 6: Final Refinements (Weeks 21-24)
- Implement keyboard shortcuts
- Create onboarding tutorial system
- Optimize for large libraries
- Add offline capabilities
- Develop theme customization options

## 7. Success Metrics & Evaluation

### User Engagement
- Number of videos processed
- Number of questions asked per video
- Session duration and frequency
- Collection organization activity
- Search query volume

### Conversion & Retention
- Anonymous to authenticated user conversion rate
- Week 1/2/4 retention rates
- Monthly active users
- Account creation conversion rate
- Premium conversion rate (future)

### Performance
- Video processing time
- Summary quality (user rating)
- Q&A response accuracy
- Search result relevance
- System reliability and uptime

### User Experience
- Task completion rates
- UI satisfaction ratings
- Feature discovery metrics
- Error rates and recovery
- Session abandonment rate

## 8. Architectural Decisions

### 1. Architecture Overview
- **Full-Stack TypeScript Application**
- **Client-Server Architecture:** Clear separation between frontend and backend
- **RESTful API Design:** Well-structured API endpoints
- **Hybrid Database Approach:** Primary data in Neon PostgreSQL with vector search capabilities
- **AI Integration:** Uses OpenAI for text analysis and LLM interactions
- **Dual-mode Authentication:** Supabase Auth with local fallback option

### 2. Architecture Patterns
- **Component-Based UI:** React components with clear separation of concerns
- **API Service Layer:** Backend services organized by functionality
- **Repository Pattern:** Database operations abstracted through storage interfaces
- **Schema-Driven Development:** Strong typing with Zod and TypeScript
- **Middleware-Based Processing:** Express middleware for request handling
- **Hybrid Storage Architecture:** PostgreSQL for primary data, pgvector for embeddings
- **Dual-Mode Authentication:** Works with or without Supabase integration
- **Progressive Data Migration:** Anonymous-to-authenticated user data transition
- **Feature-Based Access Control:** Graceful degradation of features based on authentication status

### 3. Anonymous Session Architecture
- **Server-Side Sessions:** Unlike traditional client-side anonymous user tracking, all anonymous user state is managed on the server
- **Database-Backed Storage:** Anonymous sessions are stored in the database with the following key attributes:
  - Unique session ID (format: `anon_[timestamp]_[random]`)
  - Creation timestamp
  - Last active timestamp (updated on every interaction)
  - Video count (for enforcing the 3-video limit)
  - Optional metadata (user agent, IP address)

- **Database Integration:**
  - Anonymous videos are associated with a dedicated user ID and a unique anonymous_session_id
  - User identification is primarily done via anonymous_session_id for unregistered users
  - Special handling in database queries to filter by session ID rather than user ID
  - Session cleanup mechanism removes inactive sessions after a configurable time period

- **Frontend-Backend Communication:**
  - Session ID stored in browser's localStorage
  - Session ID included in all API requests via custom headers
  - Backend validates session existence and freshness with every request
  - Automatic session creation for new users without existing sessions

- **Entitlements Management:**
  - Strict enforcement of 3-video limit per anonymous session
  - Video count incremented with each successful video save
  - Count checked before allowing new video processing
  - Strategic prompts when limit is reached to encourage account creation

- **Migration Path:**
  - When an anonymous user creates an account, their videos can be transferred to their new user account
  - Content migration preserves all metadata and associated data (embeddings, etc.)
  - Session cleanup after successful migration

### 4. Authentication Strategy
- **Dual-Mode Operation:**
  - Application functions both with and without authentication
  - Anonymous users have access to core features with limitations
  - Authenticated users gain unlimited access and additional features
- **Supabase Integration:**
  - Google OAuth provider for seamless login
  - Magic link email authentication alternative
  - Secure token storage and session management
- **Strategic User Conversion:**
  - Progressive engagement tracking for optimal prompting
  - Value-driven authentication prompts at key moments
  - Feature limitations (3-video limit) to encourage conversion
  - Seamless data migration from anonymous to authenticated state

### 5. AI Integration
- **OpenAI Integration:**
  - Text embeddings generation for semantic search
  - GPT models for summary generation and Q&A
  - Context-aware prompting with transcript data
- **Optimization Strategies:**
  - Batched processing to manage API costs and rate limits
  - Efficient transcript chunking for context management
  - Vector similarity search for retrieval-augmented generation
  - Citation system to reference original content

### 6. Performance Optimizations
- **Data Loading:**
  - Lazy loading of components and data
  - Cursor-based pagination with infinite scroll
  - Client-side caching for frequent operations
- **Processing Efficiency:**
  - Batched embedding generation
  - Optimized vector similarity searches
  - State preservation during content loading
- **Infrastructure:**
  - Replit native PostgreSQL for reduced latency
  - Hot module replacement for development efficiency
  - Production build optimizations

## 9. Future Enhancements

### Phase 7: Usage Metering System
- LLM API call tracking and cost monitoring
- User-level usage analytics
- Quota management system
- Usage dashboards for administrators
- Alerting for unusual usage patterns
- Rate limiting implementation

### Phase 8: Monetization & Payment Integration
- Tiered subscription plans
- Stripe payment processing integration
- Free/premium feature differentiation
- Trial period implementation
- Subscription management interface
- Usage-based billing system
- Payment history and receipts

### Additional Future Enhancements
- Mobile applications (iOS/Android)
- Browser extension for quick saving
- Team/enterprise collaboration features
- Integration with other video platforms
- AI-powered content recommendations
- Advanced analytics for personal learning
- Public/private sharing options for summaries

## 10. Risk Assessment

### Technical Risks
- **OpenAI API Reliability:** Potential for rate limiting or service disruptions
- **YouTube API Limitations:** Possible restrictions on transcript access or quota limits
- **Vector Search Performance:** Scaling challenges with large user libraries
- **Database Size Growth:** Management of large transcript and embedding datasets

### Mitigation Strategies
- Implement robust error handling and retry mechanisms for all API calls
- Add fallback options for key functionality where appropriate
- Deploy monitoring systems for early detection of performance issues
- Develop efficient data storage and archiving strategies
- Create graceful degradation paths for features relying on external services

### Business Risks
- **User Adoption:** Uncertainty around user willingness to create accounts
- **LLM Costs:** Potential for high operational costs with growing usage
- **Feature Complexity:** Risk of overwhelming users with too many options
- **Privacy Concerns:** User sensitivity around data storage and processing

### Mitigation Strategies
- Implement strategic, value-driven authentication prompts
- Design tiered plans with appropriate usage limits
- Develop a progressive UI that introduces features gradually
- Create comprehensive privacy controls and transparent data policies

## 11. Appendix

### Technology Stack Summary

#### Frontend Technologies
- **Framework:** React (with TypeScript)
- **Routing:** Wouter (lightweight router)
- **State Management:** React Query and React hooks
- **UI Framework:** Shadcn UI (based on Radix UI primitives)
- **Styling:** Tailwind CSS with theming support
- **Build Tools:** Vite (modern, fast bundler)
- **Form Handling:** React Hook Form with Zod validation

#### Backend Technologies
- **Runtime:** Node.js
- **Framework:** Express.js (with TypeScript)
- **API Design:** RESTful API with proper error handling
- **Data Validation:** Zod schema validation
- **Database ORM:** Drizzle ORM for type-safe database operations
- **Database:** Neon PostgreSQL with pgvector (native to Replit)
- **TypeScript Execution:** tsx for running TypeScript directly

#### DevOps and Infrastructure
- **Environment:** Replit hosting and development environment
- **Development Workflow:** Hot module replacement with Vite
- **Performance Optimizations:** 
  - Batched embedding generation
  - Vector similarity search optimization
  - Lazy loading of components and data
- **Deployment:** Configuration for production builds

### API & Service References
- YouTube Data API: https://developers.google.com/youtube/v3
- YouTube Transcript API: https://github.com/jdepoix/youtube-transcript-api
- OpenAI API: https://platform.openai.com/docs/guides/gpt
- Supabase: https://supabase.com/docs
- PostgreSQL: https://www.postgresql.org/docs/
- pgvector: https://github.com/pgvector/pgvector
