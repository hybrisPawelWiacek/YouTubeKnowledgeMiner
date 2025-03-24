import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { YoutubeVideo, VideoMetadata, Category } from "@/types";
import { 
  User, Calendar, Link, ThumbsUp, Eye, Clock, 
  Tag as TagIcon, Info 
} from "lucide-react";

interface VideoResultProps {
  video: YoutubeVideo;
}

export function VideoResult({ video }: VideoResultProps) {
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [showDescription, setShowDescription] = useState(false);
  const { toast } = useToast();

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["/api/categories"],
  });

  const { mutate: saveVideo, isPending } = useMutation({
    mutationFn: async (metadata: VideoMetadata) => {
      const videoData = {
        youtubeId: video.youtubeId,
        title: video.title,
        channel: video.channel,
        duration: video.duration,
        publishDate: video.publishDate,
        thumbnail: video.thumbnail,
        transcript: video.transcript,
        ...metadata,
      };
      
      const response = await apiRequest("POST", "/api/videos", videoData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Video saved to your library",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save video",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const metadata: VideoMetadata = {
      notes: notes || undefined,
      category_id: categoryId,
      rating: rating || undefined,
    };
    
    saveVideo(metadata);
  };

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">Video Information</h2>
      <Card className="bg-zinc-900">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Video Thumbnail */}
            <div className="w-full md:w-1/3">
              <div className="relative bg-zinc-800 rounded-lg overflow-hidden">
                <a 
                  href={video.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs">
                    <span>{video.duration}</span>
                  </div>
                </a>
              </div>
              
              {/* Video Stats */}
              {(video.viewCount || video.likeCount) && (
                <div className="mt-3 space-y-2 bg-zinc-800 p-3 rounded-lg">
                  {video.viewCount && (
                    <div className="flex items-center text-sm text-gray-300">
                      <Eye className="w-4 h-4 mr-2" />
                      <span>{video.viewCount} views</span>
                    </div>
                  )}
                  {video.likeCount && (
                    <div className="flex items-center text-sm text-gray-300">
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      <span>{video.likeCount} likes</span>
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-300">
                    <Clock className="w-4 h-4 mr-2" />
                    <span>{video.duration} duration</span>
                  </div>
                </div>
              )}
              
              {/* Tags */}
              {video.tags && video.tags.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center mb-2">
                    <TagIcon className="w-4 h-4 mr-1" />
                    <span className="text-sm font-medium">Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {video.tags.slice(0, 8).map((tag, index) => (
                      <Badge key={index} variant="outline" className="bg-zinc-800 text-gray-300 border-zinc-700">
                        {tag}
                      </Badge>
                    ))}
                    {video.tags.length > 8 && (
                      <Badge variant="outline" className="bg-zinc-800 text-gray-300 border-zinc-700">
                        +{video.tags.length - 8} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Video Metadata */}
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-2">{video.title}</h3>
              
              <div className="text-gray-400 text-sm mb-4">
                <div className="flex items-center mb-1">
                  <User className="w-4 h-4 mr-2" />
                  <span>{video.channel}</span>
                </div>
                <div className="flex items-center mb-1">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>{video.publishDate}</span>
                </div>
                <div className="flex items-center">
                  <Link className="w-4 h-4 mr-2" />
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {video.url}
                  </a>
                </div>
              </div>
              
              {/* Description */}
              {video.description && (
                <div className="mb-4 bg-zinc-800 p-3 rounded-lg">
                  <div 
                    className="flex items-center mb-2 cursor-pointer" 
                    onClick={() => setShowDescription(!showDescription)}
                  >
                    <Info className="w-4 h-4 mr-1" />
                    <span className="text-sm font-medium">
                      {showDescription ? "Hide Description" : "Show Description"}
                    </span>
                  </div>
                  {showDescription && (
                    <p className="text-sm text-gray-300">{video.description}</p>
                  )}
                </div>
              )}
              
              {/* Video Metadata Form */}
              <form className="space-y-4 bg-zinc-800 p-4 rounded-md">
                <div>
                  <label htmlFor="userNotes" className="block text-sm font-medium text-gray-300 mb-1">
                    Notes
                  </label>
                  <Textarea
                    id="userNotes"
                    placeholder="Add your notes about this video..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="resize-none bg-zinc-900 border-zinc-700"
                    rows={2}
                  />
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/2">
                    <label htmlFor="videoCategory" className="block text-sm font-medium text-gray-300 mb-1">
                      Category
                    </label>
                    <Select onValueChange={(value) => setCategoryId(Number(value))}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-700">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {categories?.map((category: Category) => (
                          <SelectItem key={category.id} value={category.id.toString()}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="w-full sm:w-1/2">
                    <label htmlFor="videoRating" className="block text-sm font-medium text-gray-300 mb-1">
                      Rating
                    </label>
                    <StarRating
                      value={rating}
                      onChange={setRating}
                      className="py-2"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={isPending}
                  >
                    {isPending ? "Saving..." : "Save to Library"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
