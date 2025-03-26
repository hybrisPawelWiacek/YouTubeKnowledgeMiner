import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { highlightText, getRelevanceIndicator, getContentTypeBadge, formatTimestamp } from "@/lib/highlight-utils";

interface SearchResultItemProps {
  result: {
    id: number;
    video_id: number;
    content: string;
    content_type: 'transcript' | 'summary' | 'note';
    similarity: number;
    metadata: {
      timestamp?: string | number;
      formatted_timestamp?: string;
      position?: number;
      video_title?: string;
      [key: string]: any;
    };
  };
  searchTerm: string;
  onTimestampClick?: (videoId: number, timestamp: string) => void;
}

export function SearchResultItem({ result, searchTerm, onTimestampClick }: SearchResultItemProps) {
  const { video_id, content, content_type, similarity, metadata } = result;
  
  // Extract timestamp if available
  const timestamp = metadata?.timestamp || metadata?.formatted_timestamp;
  const formattedTimestamp = typeof timestamp !== 'undefined' ? formatTimestamp(timestamp) : undefined;
  
  // Highlight the content with the search term
  const highlightedContent = highlightText({
    text: content,
    searchTerm,
    maxContextRadius: 60,
    showFullTextWithHighlights: false,
  });
  
  if (!highlightedContent) return null; // No matches in the content
  
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow border border-border/60">
      <CardContent className="p-4">
        <div className="flex flex-col space-y-2">
          {/* Header with metadata */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {/* Content type badge */}
              <div dangerouslySetInnerHTML={{ __html: getContentTypeBadge(content_type) }} />
              
              {/* Timestamp if available */}
              {formattedTimestamp && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 py-0 text-xs"
                  onClick={() => onTimestampClick && onTimestampClick(video_id, formattedTimestamp)}
                >
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polygon points="10 8 16 12 10 16 10 8"/>
                    </svg>
                    {formattedTimestamp}
                  </span>
                </Button>
              )}
            </div>
            
            {/* Relevance indicator */}
            <div dangerouslySetInnerHTML={{ __html: getRelevanceIndicator(similarity) }} />
          </div>
          
          {/* Content with highlighted search terms */}
          <div 
            className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3 border border-border/40"
            dangerouslySetInnerHTML={{ __html: highlightedContent }}
          />
          
          {/* Footer with link to video */}
          <div className="flex justify-end mt-2">
            <Link href={`/video/${video_id}`}>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                View in video
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}