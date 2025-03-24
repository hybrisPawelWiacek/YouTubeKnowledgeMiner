import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TranscriptSection } from "@/components/transcript-section";
import { SummarySection } from "@/components/summary-section";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Heart, Edit, Play, User, Calendar, Clock, Tag as TagIcon, Eye, ThumbsUp
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Video, Category } from "@/types";

export default function VideoDetailPage() {
  const [, params] = useRoute<{ id: string }>("/video/:id");
  const videoId = params?.id ? parseInt(params.id) : 0;
  const { toast } = useToast();
  
  // State for editable fields
  const [notes, setNotes] = useState<string>("");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Fetch video details
  const { data: video, isLoading: isLoadingVideo } = useQuery({
    queryKey: [`/api/videos/${videoId}`],
    queryFn: async () => {
      const response = await fetch(`/api/videos/${videoId}`);
      if (!response.ok) throw new Error("Failed to fetch video");
      const data = await response.json();
      
      // Initialize state with fetched data
      setNotes(data.notes || "");
      setRating(data.rating);
      setCategoryId(data.category_id);
      setIsFavorite(data.is_favorite || false);
      
      return data;
    },
    enabled: !!videoId,
  });
  
  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["/api/categories"],
  });
  
  // Update video mutation
  const { mutate: updateVideo, isPending: isUpdating } = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/videos/${videoId}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Video updated",
        description: "Your changes have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}`] });
      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update video. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Toggle favorite mutation
  const { mutate: toggleFavorite } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/videos/${videoId}`, {
        is_favorite: !isFavorite,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setIsFavorite(data.is_favorite);
      toast({
        title: data.is_favorite ? "Added to favorites" : "Removed from favorites",
        description: `"${video?.title}" has been ${data.is_favorite ? "added to" : "removed from"} your favorites.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive",
      });
    },
  });
  
  const handleSaveChanges = () => {
    updateVideo({
      notes,
      rating,
      category_id: categoryId,
    });
  };
  
  if (isLoadingVideo) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        
        <main className="flex-grow py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <Skeleton className="h-8 w-48" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <Skeleton className="h-64 w-full rounded-lg" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
              
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-32 w-full" />
              </div>
            </div>
          </div>
        </main>
        
        <Footer />
      </div>
    );
  }
  
  if (!video) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        
        <main className="flex-grow py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Video Not Found</h2>
            <p className="text-gray-400 mb-6">The video you're looking for doesn't exist or has been deleted.</p>
            <Link href="/library">
              <Button>
                Back to Library
              </Button>
            </Link>
          </div>
        </main>
        
        <Footer />
      </div>
    );
  }
  
  // Get category name
  const categoryName = categories?.find((c: Category) => c.id === video.category_id)?.name;
  
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-grow py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button & Actions */}
          <div className="flex justify-between items-center mb-6">
            <Link href="/library">
              <Button variant="outline" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back to Library
              </Button>
            </Link>
            
            <div className="flex gap-2">
              <Button
                variant={isFavorite ? "default" : "outline"}
                size="sm"
                onClick={() => toggleFavorite()}
                className="gap-1"
              >
                <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
                {isFavorite ? "Favorited" : "Add to Favorites"}
              </Button>
              
              {isEditing ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveChanges}
                  disabled={isUpdating}
                  className="gap-1"
                >
                  {isUpdating ? "Saving..." : "Save Changes"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="gap-1"
                >
                  <Edit className="h-4 w-4" />
                  Edit Details
                </Button>
              )}
              
              <a href={`https://youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1">
                  <Play className="h-4 w-4" />
                  Watch on YouTube
                </Button>
              </a>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left column: Video thumbnail and metadata */}
            <div className="lg:col-span-1">
              <div className="bg-zinc-900 rounded-lg overflow-hidden sticky top-8">
                <div className="relative">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs">
                    {video.duration}
                  </div>
                </div>
                
                <div className="p-4">
                  <h1 className="text-xl font-bold mb-2">{video.title}</h1>
                  
                  <div className="space-y-2 text-sm text-gray-400">
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      <span>{video.channel}</span>
                    </div>
                    
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>{video.publish_date}</span>
                    </div>
                    
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2" />
                      <span>{video.duration}</span>
                    </div>
                    
                    {video.views && (
                      <div className="flex items-center">
                        <Eye className="h-4 w-4 mr-2" />
                        <span>{video.views} views</span>
                      </div>
                    )}
                    
                    {video.likes && (
                      <div className="flex items-center">
                        <ThumbsUp className="h-4 w-4 mr-2" />
                        <span>{video.likes} likes</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Tags */}
                  {video.tags && video.tags.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <TagIcon className="h-4 w-4 mr-1 text-gray-400" />
                        <span className="text-sm font-medium text-gray-400">Tags</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {video.tags.map((tag, index) => (
                          <Badge key={index} variant="outline" className="bg-zinc-800 text-gray-300 border-zinc-700">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Category */}
                  {!isEditing && categoryName && (
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <span className="text-sm font-medium text-gray-400">Category</span>
                      </div>
                      <Badge variant="secondary">{categoryName}</Badge>
                    </div>
                  )}
                  
                  {/* Rating */}
                  {!isEditing && video.rating && (
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <span className="text-sm font-medium text-gray-400">Your Rating</span>
                      </div>
                      <StarRating value={video.rating} onChange={() => {}} readonly />
                    </div>
                  )}
                  
                  {/* Edit Form (when in edit mode) */}
                  {isEditing && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <label htmlFor="category" className="block text-sm font-medium text-gray-400 mb-1">
                          Category
                        </label>
                        <Select
                          value={categoryId?.toString() || ""}
                          onValueChange={(value) => setCategoryId(value ? parseInt(value) : undefined)}
                        >
                          <SelectTrigger id="category" className="bg-zinc-800 border-zinc-700">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-800 border-zinc-700">
                            <SelectItem value="">No Category</SelectItem>
                            {categories?.map((category: Category) => (
                              <SelectItem key={category.id} value={category.id.toString()}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <label htmlFor="rating" className="block text-sm font-medium text-gray-400 mb-1">
                          Your Rating
                        </label>
                        <StarRating
                          value={rating || 0}
                          onChange={setRating}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right column: Content tabs */}
            <div className="lg:col-span-2">
              <Tabs defaultValue="content" className="w-full">
                <TabsList className="mb-6 bg-zinc-800">
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>
                
                <TabsContent value="content" className="space-y-6">
                  {/* Video Description */}
                  {video.description && (
                    <div className="bg-zinc-900 rounded-lg p-6">
                      <h2 className="text-xl font-bold mb-4">Description</h2>
                      <p className="whitespace-pre-line text-gray-300">
                        {video.description}
                      </p>
                    </div>
                  )}
                  
                  {/* Summary if available */}
                  {video.summary && video.summary.length > 0 && (
                    <div className="bg-zinc-900 rounded-lg p-6">
                      <h2 className="text-xl font-bold mb-4">AI Summary</h2>
                      <SummarySection summary={video.summary} />
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="summary">
                  {video.summary && video.summary.length > 0 ? (
                    <div className="bg-zinc-900 rounded-lg p-6">
                      <SummarySection summary={video.summary} />
                    </div>
                  ) : (
                    <div className="bg-zinc-900 rounded-lg p-6 text-center">
                      <p className="text-gray-400">No summary available for this video.</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="transcript">
                  {video.transcript ? (
                    <div className="bg-zinc-900 rounded-lg p-6">
                      <TranscriptSection transcript={video.transcript} />
                    </div>
                  ) : (
                    <div className="bg-zinc-900 rounded-lg p-6 text-center">
                      <p className="text-gray-400">No transcript available for this video.</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="notes">
                  <div className="bg-zinc-900 rounded-lg p-6">
                    <h2 className="text-xl font-bold mb-4">Your Notes</h2>
                    
                    {isEditing ? (
                      <Textarea
                        value={notes || ""}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add your notes about this video..."
                        className="resize-none bg-zinc-800 border-zinc-700 mb-4"
                        rows={8}
                      />
                    ) : (
                      <div className="bg-zinc-800 rounded-lg p-4 mb-4 min-h-[100px]">
                        {notes ? (
                          <p className="whitespace-pre-line text-gray-300">{notes}</p>
                        ) : (
                          <p className="text-gray-500 italic">No notes added yet.</p>
                        )}
                      </div>
                    )}
                    
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNotes(video.notes || "");
                            setRating(video.rating);
                            setCategoryId(video.category_id);
                            setIsEditing(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSaveChanges}
                          disabled={isUpdating}
                        >
                          {isUpdating ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setIsEditing(true)}
                        className="w-full"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Notes
                      </Button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}