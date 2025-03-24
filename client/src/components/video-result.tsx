import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { useToast } from "@/hooks/use-toast";
import { YoutubeVideo, VideoMetadata, Category } from "@/types";

interface VideoResultProps {
  video: YoutubeVideo;
}

export function VideoResult({ video }: VideoResultProps) {
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [rating, setRating] = useState(0);
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
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full aspect-video object-cover"
                />
                <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs">
                  <span>{video.duration}</span>
                </div>
              </div>
            </div>
            
            {/* Video Metadata */}
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-2">{video.title}</h3>
              <div className="text-gray-400 text-sm mb-4">
                <div className="flex items-center mb-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>{video.channel}</span>
                </div>
                <div className="flex items-center mb-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{video.publishDate}</span>
                </div>
                <div className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
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
