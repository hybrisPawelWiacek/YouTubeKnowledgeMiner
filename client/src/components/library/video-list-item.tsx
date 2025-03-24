import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StarRating } from "@/components/ui/star-rating";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Video, Category } from "@/types";
import {
  MoreVertical, Clock, User, Play, Heart, Trash, Edit, Eye
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface VideoListItemProps {
  video: Video;
  isSelected: boolean;
  onToggleSelect: () => void;
  categories: Category[];
}

export function VideoListItem({ video, isSelected, onToggleSelect, categories }: VideoListItemProps) {
  const { toast } = useToast();
  const [isFavorite, setIsFavorite] = useState(video.is_favorite || false);
  
  // Get category name
  const categoryName = categories.find(c => c.id === video.category_id)?.name;
  
  // Toggle favorite mutation
  const { mutate: toggleFavorite } = useMutation({
    mutationFn: async () => {
      const newFavoriteState = !isFavorite;
      const response = await apiRequest("PATCH", `/api/videos/${video.id}`, {
        is_favorite: newFavoriteState
      });
      return response.json();
    },
    onSuccess: () => {
      setIsFavorite(!isFavorite);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: isFavorite ? "Removed from favorites" : "Added to favorites",
        description: `"${video.title}" has been ${isFavorite ? "removed from" : "added to"} your favorites.`
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive"
      });
    }
  });
  
  // Delete video mutation
  const { mutate: deleteVideo } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/videos/${video.id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Video deleted",
        description: `"${video.title}" has been removed from your library.`
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete video",
        variant: "destructive"
      });
    }
  });
  
  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${video.title}"?`)) {
      deleteVideo();
    }
  };
  
  return (
    <Card className="bg-zinc-900 overflow-hidden group">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Selection checkbox */}
          <div className="flex items-start pt-1">
            <Checkbox 
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className="bg-zinc-800/80"
            />
          </div>
          
          {/* Thumbnail */}
          <div className="w-40 flex-shrink-0">
            <div className="relative">
              <Link href={`/video/${video.id}`}>
                <img 
                  src={video.thumbnail} 
                  alt={video.title}
                  className="w-full aspect-video object-cover rounded-md" 
                />
              </Link>
              
              <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 px-1.5 py-0.5 rounded text-xs">
                {video.duration}
              </div>
              
              {/* Favorite indicator */}
              {isFavorite && (
                <div className="absolute top-1 right-1">
                  <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                </div>
              )}
            </div>
          </div>
          
          {/* Video info */}
          <div className="flex-1">
            <div className="flex justify-between">
              <div className="flex-1">
                <Link href={`/video/${video.id}`}>
                  <h3 className="font-medium mb-1 line-clamp-1 hover:text-primary transition-colors">
                    {video.title}
                  </h3>
                </Link>
                
                <div className="flex items-center text-sm text-gray-400 mb-2">
                  <User className="h-3 w-3 mr-1" />
                  <span className="truncate">{video.channel}</span>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  {categoryName && (
                    <Badge variant="outline" className="bg-zinc-800">
                      {categoryName}
                    </Badge>
                  )}
                  
                  <div className="text-xs text-gray-400 flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    <span>
                      {new Date(video.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                {video.rating && (
                  <div className="mb-2">
                    <StarRating value={video.rating} onChange={() => {}} readonly size="sm" />
                  </div>
                )}
                
                {video.notes && (
                  <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                    {video.notes}
                  </p>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex flex-col items-end gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
                    <DropdownMenuItem asChild>
                      <Link href={`/video/${video.id}`}>
                        <div className="flex items-center">
                          <Eye className="mr-2 h-4 w-4" />
                          <span>View Details</span>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleFavorite()}>
                      <div className="flex items-center">
                        <Heart className="mr-2 h-4 w-4" />
                        <span>{isFavorite ? "Remove from Favorites" : "Add to Favorites"}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/edit/${video.id}`}>
                        <div className="flex items-center">
                          <Edit className="mr-2 h-4 w-4" />
                          <span>Edit</span>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} className="text-red-500 focus:text-red-500">
                      <div className="flex items-center">
                        <Trash className="mr-2 h-4 w-4" />
                        <span>Delete</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <div className="flex gap-1">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 w-7 p-0 rounded-full"
                    onClick={() => toggleFavorite()}
                  >
                    <Heart 
                      className={`h-4 w-4 ${isFavorite ? "text-red-500 fill-red-500" : ""}`}
                    />
                  </Button>
                  <a href={`https://youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full">
                      <Play className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}