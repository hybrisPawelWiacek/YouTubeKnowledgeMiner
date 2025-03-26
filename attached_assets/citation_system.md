# Citation System Architecture

## Overview

The Citation System is a core component of the YouTube Knowledge Miner that provides transparency and verification for AI-generated responses. It tracks source information and presents it in a user-friendly way.

## System Architecture

```
┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│                    │     │                    │     │                    │
│  Content Ingestion ├────►│  Vector Database   ├────►│   RAG Generation   │
│                    │     │                    │     │                    │
└────────────────────┘     └────────────────────┘     └─────────┬──────────┘
                                                                │
                                                                │
                                                                ▼
┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│                    │     │                    │     │                    │
│   User Interface   │◄────┤  Citation Renderer │◄────┤ Citation Processor │
│                    │     │                    │     │                    │
└────────────────────┘     └────────────────────┘     └────────────────────┘
```

## Data Flow

1. **Content Ingestion**
   - YouTube video content is processed
   - Transcripts are chunked with timestamp preservation
   - Content is associated with source metadata

2. **Vector Database**
   - Embeddings are stored with source metadata
   - Each chunk maintains its original context
   - Timestamp information is preserved

3. **RAG Generation**
   - User query triggers semantic search
   - Relevant content chunks are retrieved with metadata
   - AI generates response using retrieved context

4. **Citation Processor**
   - Identifies source references in the generated response
   - Creates structured citation objects
   - Attaches metadata (video ID, title, timestamp)

5. **Citation Renderer**
   - Formats citations with visual indicators
   - Adds interactive elements (play buttons)
   - Applies styling based on content type

6. **User Interface**
   - Displays citations inline with responses
   - Provides clickable references
   - Offers clear visual distinction for cited content

## Citation Structure

```typescript
// Simplified citation object structure
interface Citation {
  id: number;
  video_id: number;
  video_title: string;
  content: string;
  content_type: 'transcript' | 'summary' | 'note';
  timestamp?: string;
  chunk_index?: number;
}
```

## Key Features

- **Transparent Source Attribution**: Clear indication of where information comes from
- **Timestamp References**: Direct links to specific moments in videos
- **Content Type Indicators**: Distinguishes between transcript, summary, and notes
- **Interactive Elements**: Clickable citations for immediate verification
- **Consistent Formatting**: Uniform presentation across the application
- **Export Integration**: Citations included in all exported content

## Implementation Notes

- Citations are generated during the RAG process, not pre-computed
- The system preserves context through multiple processing stages
- Visual styling enhances readability without overwhelming the user
- Export formats maintain citation context for reference outside the application