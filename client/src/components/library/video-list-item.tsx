import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { truncateText } from "@/lib/utils";
import { Video, Category } from "@/types";
import { Calendar, Clock, Heart } from "lucide-react";

interface VideoListItemProps {
  video: Video;
  isSelected: boolean;
  onToggleSelect: () => void;
  categories: Category[];
}

export function VideoListItem({ video, isSelected, onToggleSelect, categories }: VideoListItemProps) {
  const [isHovering, setIsHovering] = useState(false);
  
  // Get category name if category_id exists
  const categoryName = categories?.find(c => c.id === video.category_id)?.name;
  
  // Format date for display
  const formattedDate = new Date(video.created_at).toLocaleDateString();
  
  return (
    <div 
      className={`group flex border-b border-zinc-800 p-3 hover:bg-zinc-900 transition-colors ${isSelected ? 'bg-zinc-900' : ''}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex-shrink-0 flex items-center mr-4">
        <Checkbox 
          checked={isSelected} 
          onCheckedChange={() => onToggleSelect()}
          className="mr-2 data-[state=checked]:bg-primary"
        />
      </div>
      
      <div className="flex-shrink-0 mr-4">
        <Link href={`/video/${video.id}`}>
          <div className="w-24 h-16 overflow-hidden rounded-md relative">
            <img 
              src={video.thumbnail} 
              alt={video.title} 
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 px-1 text-[10px] rounded">
              {video.duration}
            </div>
          </div>
        </Link>
      </div>
      
      <div className="flex-grow min-w-0">
        <div className="flex items-start justify-between">
          <Link href={`/video/${video.id}`} className="hover:underline">
            <h3 className="font-medium text-sm sm:text-base mb-1">
              {truncateText(video.title, 70)}
            </h3>
          </Link>
          {video.is_favorite && (
            <Heart className="h-4 w-4 fill-red-500 text-red-500 flex-shrink-0 ml-2" />
          )}
        </div>
        
        <div className="text-xs text-gray-400 mb-1">
          {video.channel}
        </div>
        
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-400">
          <div className="flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            <span>{formattedDate}</span>
          </div>
          
          <div className="flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            <span>{video.duration}</span>
          </div>
          
          {categoryName && (
            <Badge variant="outline" className="text-xs py-0 h-5">
              {categoryName}
            </Badge>
          )}
          
          {video.rating && (
            <div className="flex items-center">
              <StarRating value={video.rating} onChange={() => {}} readonly size="sm" />
            </div>
          )}
        </div>
      </div>
      
      <div className="ml-2 flex-shrink-0 self-center">
        <Link href={`/video/${video.id}`}>
          <Button 
            variant="ghost" 
            size="sm" 
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            View
          </Button>
        </Link>
      </div>
    </div>
  );
}