export interface YoutubeVideo {
  youtubeId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: string;
  publishDate: string;
  url: string;
  transcript?: string;
  summary?: string[];
  description?: string;
  tags?: string[];
  viewCount?: string;
  likeCount?: string;
}

export interface VideoMetadata {
  notes?: string;
  category_id?: number;
  rating?: number;
  is_favorite?: boolean;
  collection_ids?: number[];
  timestamps?: string[];
  
  // Additional metadata from YouTube API
  viewCount?: string;
  likeCount?: string;
  description?: string;
  tags?: string[];
  summary?: string[];
}

export interface Category {
  id: number;
  name: string;
  user_id: number;
  is_global?: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
}

// Interface for stored videos from the database
export interface Video {
  id: number;
  youtube_id: string;
  title: string;
  channel: string;
  duration: string;
  publish_date: string;
  thumbnail: string;
  transcript?: string | null;
  summary?: string[] | null;
  views?: string | null;
  likes?: string | null;
  description?: string | null;
  tags?: string[] | null;
  user_id: number;
  notes?: string | null;
  category_id?: number | null;
  rating?: number | null;
  is_favorite?: boolean;
  timestamps?: string[] | null;
  created_at: Date | string;
}

// Interface for collections
export interface Collection {
  id: number;
  name: string;
  description?: string | null;
  user_id: number;
  created_at: Date | string;
}

// Interface for saved searches
export interface SavedSearch {
  id: number;
  name: string;
  query: string;
  filters?: string | null;
  user_id: number;
  created_at: Date | string;
}

// Interface for collection-video relationships
export interface CollectionVideo {
  collection_id: number;
  video_id: number;
  added_at: Date | string;
}
