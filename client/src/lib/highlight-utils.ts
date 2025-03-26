interface HighlightTextOptions {
  text: string;
  searchTerm: string;
  caseSensitive?: boolean;
  highlightClass?: string;
  maxContextRadius?: number;
  showFullTextWithHighlights?: boolean;
}

/**
 * Highlights search terms within text and optionally returns context around matches
 * @param options - Configuration options for text highlighting
 * @returns If showFullTextWithHighlights is true, returns the full text with highlighted search terms.
 *          Otherwise, returns context snippets around matches.
 */
export function highlightText({
  text,
  searchTerm,
  caseSensitive = false,
  highlightClass = "bg-yellow-300/30 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 rounded px-0.5",
  maxContextRadius = 50,
  showFullTextWithHighlights = false,
}: HighlightTextOptions): string {
  if (!searchTerm || !text) return text;
  
  // For case-insensitive search, we need to create a case-insensitive RegExp
  const flags = caseSensitive ? 'g' : 'gi';
  // Escape special characters in the search term for RegExp
  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedSearchTerm, flags);
  
  if (showFullTextWithHighlights) {
    // Return the full text with highlighted search terms
    return text.replace(regex, (match) => `<span class="${highlightClass}">${match}</span>`);
  } else {
    // Find all matches and extract context around them
    const matches = [];
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const startPos = Math.max(0, match.index - maxContextRadius);
      const endPos = Math.min(text.length, match.index + match[0].length + maxContextRadius);
      
      // Extract context
      let contextBefore = text.substring(startPos, match.index);
      let matchText = match[0];
      let contextAfter = text.substring(match.index + match[0].length, endPos);
      
      // Add leading/trailing ellipsis if we're not at the start/end of the text
      if (startPos > 0) contextBefore = '...' + contextBefore;
      if (endPos < text.length) contextAfter = contextAfter + '...';
      
      // Create the snippet with the match highlighted
      matches.push(
        `${contextBefore}<span class="${highlightClass}">${matchText}</span>${contextAfter}`
      );
    }
    
    // If no matches, return a null value
    if (matches.length === 0) return '';
    
    // Join all matches with a separator
    return matches.join('<div class="my-2 border-t border-zinc-200 dark:border-zinc-800"></div>');
  }
}

/**
 * Converts a similarity score (0-1) to a visual relevance indicator
 * @param similarity - A number between 0 and 1 representing the similarity score
 * @returns A string with HTML to display the relevance indicator
 */
export function getRelevanceIndicator(similarity: number): string {
  const relevancePercentage = Math.round(similarity * 100);
  const filledWidth = Math.max(5, Math.min(100, relevancePercentage));
  
  return `
    <div class="flex items-center gap-2">
      <div class="relative w-20 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div 
          class="absolute top-0 left-0 h-full bg-primary rounded-full" 
          style="width: ${filledWidth}%"
        ></div>
      </div>
      <span class="text-xs text-muted-foreground">${relevancePercentage}%</span>
    </div>
  `;
}

/**
 * Creates a badge for content type
 * @param contentType - The type of content ('transcript', 'summary', or 'note')
 * @returns HTML string for a badge with appropriate styling
 */
export function getContentTypeBadge(contentType: 'transcript' | 'summary' | 'note'): string {
  const classes = {
    transcript: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    summary: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    note: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  };
  
  const labels = {
    transcript: 'Transcript',
    summary: 'Summary',
    note: 'Note'
  };
  
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes[contentType]}">${labels[contentType]}</span>`;
}

/**
 * Formats a timestamp from seconds to MM:SS format
 * @param seconds - Time in seconds or a formatted timestamp string
 * @returns Formatted timestamp string
 */
export function formatTimestamp(seconds: number | string): string {
  if (typeof seconds === 'string') {
    // If it's already a formatted timestamp, return it
    if (seconds.includes(':')) return seconds;
    // Try to parse it as a number
    seconds = parseFloat(seconds);
  }
  
  if (isNaN(seconds)) return '';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}