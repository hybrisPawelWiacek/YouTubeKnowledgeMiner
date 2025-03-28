import { useState } from "react";
import { Link } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { truncateText } from "@/lib/utils";
import { Video, Category } from "@/types";
import { Heart } from "lucide-react";

interface VideoCardProps {
  video: Video;
  isSelected: boolean;
  onToggleSelect: () => void;
  categories: Category[];
}

export function VideoCard({ video, isSelected, onToggleSelect, categories }: VideoCardProps) {
  const [isHovering, setIsHovering] = useState(false);
  
  // Format date for display
  const formattedDate = new Date(video.created_at).toLocaleDateString();
  
  // Get category name if category_id exists and categories is an array
  const categoryName = Array.isArray(categories) 
    ? categories.find(c => c.id === video.category_id)?.name 
    : undefined;
  
  return (
    <div 
      className={`group relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Checkbox overlayed on hover or when selected */}
      <div className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected || isHovering ? 'opacity-100' : 'opacity-0'}`}>
        <Checkbox 
          checked={isSelected} 
          onCheckedChange={() => onToggleSelect()}
          className="data-[state=checked]:bg-primary"
        />
      </div>
      
      {/* Favorite indicator */}
      {video.is_favorite && (
        <div className="absolute top-2 right-2 z-10">
          <Heart className="h-5 w-5 fill-red-500 text-red-500 drop-shadow-md" />
        </div>
      )}
      
      {/* Thumbnail with duration */}
      <Link href={`/video/${video.id}`}>
        <div className="aspect-video bg-zinc-800 relative">
          <img 
            src={video.thumbnail} 
            alt={video.title} 
            className="w-full h-full object-cover" 
          />
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs">
            {video.duration}
          </div>
        </div>
      </Link>
      
      {/* Video Information */}
      <div className="p-3">
        <Link href={`/video/${video.id}`} className="hover:underline">
          <h3 className="font-medium mb-1">
            {truncateText(video.title, 60)}
          </h3>
        </Link>
        
        <div className="text-xs text-gray-400 mb-2">
          {video.channel}
        </div>
        
        <div className="flex flex-wrap gap-2 mb-2">
          {categoryName && (
            <Badge variant="outline" className="text-xs py-0 h-5">
              {categoryName}
            </Badge>
          )}
          
          <Badge variant="secondary" className="text-xs py-0 h-5">
            {formattedDate}
          </Badge>
        </div>
        
        {video.rating && (
          <div className="mt-2">
            <StarRating value={video.rating} onChange={() => {}} readonly size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}