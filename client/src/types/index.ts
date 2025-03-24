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
}

export interface User {
  id: number;
  username: string;
  email: string;
}
