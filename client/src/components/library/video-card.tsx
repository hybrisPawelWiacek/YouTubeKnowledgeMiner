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
  MoreVertical, Clock, User, Play, Heart, Trash, FolderPlus, Edit, Bookmark, Eye
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface VideoCardProps {
  video: Video;
  isSelected: boolean;
  onToggleSelect: () => void;
  categories: Category[];
}

export function VideoCard({ video, isSelected, onToggleSelect, categories }: VideoCardProps) {
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
    <Card className="bg-zinc-900 overflow-hidden h-full flex flex-col group relative">
      {/* Selection checkbox overlay */}
      <div className="absolute top-2 left-2 z-10">
        <Checkbox 
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          className="bg-zinc-800/80"
        />
      </div>
      
      {/* Video thumbnail and quick actions */}
      <div className="relative">
        <Link href={`/video/${video.id}`}>
          <img 
            src={video.thumbnail} 
            alt={video.title}
            className="w-full aspect-video object-cover" 
          />
        </Link>
        
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs">
          {video.duration}
        </div>
        
        {/* Favorite indicator */}
        {isFavorite && (
          <div className="absolute top-2 right-2">
            <Heart className="h-5 w-5 text-red-500 fill-red-500" />
          </div>
        )}
        
        {/* Quick action buttons (visible on hover) */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Link href={`/video/${video.id}`}>
            <Button size="sm" variant="secondary" className="rounded-full p-2">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full p-2"
            onClick={() => toggleFavorite()}
          >
            <Heart 
              className={`h-4 w-4 ${isFavorite ? "text-red-500 fill-red-500" : ""}`}
            />
          </Button>
          <a href={`https://youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="secondary" className="rounded-full p-2">
              <Play className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </div>
      
      {/* Video info */}
      <CardContent className="p-4 flex-1 flex flex-col">
        <div className="flex-1">
          <Link href={`/video/${video.id}`}>
            <h3 className="font-medium mb-1 line-clamp-2 hover:text-primary transition-colors">
              {video.title}
            </h3>
          </Link>
          
          <div className="flex items-center text-sm text-gray-400 mb-2">
            <User className="h-3 w-3 mr-1" />
            <span className="truncate">{video.channel}</span>
          </div>
          
          {categoryName && (
            <Badge variant="outline" className="mb-2 bg-zinc-800">
              {categoryName}
            </Badge>
          )}
          
          {video.rating && (
            <div className="mb-3">
              <StarRating value={video.rating} onChange={() => {}} readonly size="sm" />
            </div>
          )}
          
          {video.notes && (
            <p className="text-sm text-gray-400 line-clamp-2 mb-2">
              {video.notes}
            </p>
          )}
        </div>
        
        <div className="flex justify-between items-center mt-2">
          <div className="text-xs text-gray-400 flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            <span>
              {new Date(video.created_at).toLocaleDateString()}
            </span>
          </div>
          
          {/* Actions menu */}
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
        </div>
      </CardContent>
    </Card>
  );
}