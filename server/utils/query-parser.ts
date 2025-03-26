import { Video, SearchParams } from '../../shared/schema';

/**
 * Apply search parameters to an array of videos (used for anonymous users)
 * This is a simplified version of the database filtering for anonymous users
 * 
 * @param videos Array of videos to filter
 * @param params Search parameters to apply
 * @returns Filtered array of videos
 */
export function applySearchFilters(videos: Video[], params: SearchParams): Video[] {
  // Start with all videos
  let result = [...videos];
  
  // Apply cursor pagination if specified
  if (params.cursor !== undefined) {
    const cursorIndex = result.findIndex(v => v.id === params.cursor);
    if (cursorIndex !== -1) {
      result = result.slice(cursorIndex + 1);
    }
  }
  
  // Apply category filter
  if (params.category_id !== undefined) {
    result = result.filter(v => v.category_id === params.category_id);
  }
  
  // Apply collection filter
  // Note: This would require additional database lookups in a real implementation
  // For now, we'll just pass it through since collection filtering for anonymous users
  // is probably rare and not worth the complexity
  
  // Apply favorite filter
  if (params.is_favorite !== undefined) {
    result = result.filter(v => v.is_favorite === params.is_favorite);
  }
  
  // Apply rating filter (minimum rating)
  if (params.rating_min !== undefined) {
    const minRating = params.rating_min;
    result = result.filter(v => v.rating !== null && v.rating >= minRating);
  }
  
  // Apply rating filter (maximum rating)
  if (params.rating_max !== undefined) {
    const maxRating = params.rating_max;
    result = result.filter(v => v.rating !== null && v.rating <= maxRating);
  }
  
  // Apply search term
  if (params.query !== undefined && params.query.trim() !== '') {
    const searchLower = params.query.toLowerCase();
    result = result.filter(v => 
      v.title.toLowerCase().includes(searchLower) || 
      v.channel.toLowerCase().includes(searchLower) ||
      (v.notes && v.notes.toLowerCase().includes(searchLower))
    );
  }
  
  // Apply sorting
  if (params.sort_by) {
    result.sort((a, b) => {
      if (params.sort_by === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (params.sort_by === 'title') {
        return a.title.localeCompare(b.title);
      } else if (params.sort_by === 'rating') {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
      }
      return 0;
    });
    
    // Apply sort order if specified
    if (params.sort_order === 'asc') {
      result.reverse();
    }
  }
  
  // Apply limit and calculate pagination
  let hasMore = false;
  let nextCursor = undefined;
  
  if (params.limit) {
    if (result.length > params.limit) {
      hasMore = true;
      nextCursor = result[params.limit - 1].id;
      result = result.slice(0, params.limit);
    }
  }
  
  return result;
}

/**
 * Extracts the YouTube video ID from a URL
 * 
 * @param url YouTube URL to parse
 * @returns YouTube video ID or null if not found
 */
export function extractYoutubeId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}