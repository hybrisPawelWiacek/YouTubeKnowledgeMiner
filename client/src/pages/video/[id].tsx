import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { StarRating } from "@/components/ui/star-rating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { TranscriptSection } from "@/components/transcript-section";
import { SummarySection } from "@/components/summary-section";
import { QASection } from "@/components/qa-section";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Video, Category } from "@/types";
import { useSupabase } from "@/hooks/use-supabase";
import {
  ArrowLeft,
  Heart,
  Calendar,
  Clock,
  ExternalLink,
  Save,
  Tag,
  Edit,
  Eye,
  ThumbsUp,
  Bookmark,
  Plus,
} from "lucide-react";

export default function VideoDetailPage() {
  // Extract video ID from route
  const [, params] = useRoute("/video/:id");
  const videoId = params?.id ? parseInt(params.id) : 0;
  
  // State
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState(false);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [customTimestamps, setCustomTimestamps] = useState<string[]>([]);
  const [newTimestamp, setNewTimestamp] = useState("");
  
  // Hooks
  const { toast } = useToast();
  
  // Get user from Supabase
  const { user } = useSupabase();
  
  // Queries
  const videoQuery = useQuery({
    queryKey: ["/api/videos", videoId],
    queryFn: async () => {
      // Initialize headers
      const headers: HeadersInit = {};
      
      // If user is authenticated, add user ID to headers
      if (user?.id) {
        let userIdValue;
        
        // Ensure userId is sent as a clean number in string format
        if (typeof user.id === 'number') {
          userIdValue = String(user.id);
        } else {
          // For strings or other types, extract numeric portion if possible
          const match = String(user.id).match(/\d+/);
          const extractedId = match ? parseInt(match[0], 10) : NaN;
          console.log('[VideoDetailPage] Extracted numeric user ID from string:', extractedId);
          
          if (!isNaN(extractedId)) {
            userIdValue = String(extractedId);
          } else {
            console.warn('[VideoDetailPage] Failed to extract valid user ID from:', user.id);
          }
        }
        
        if (userIdValue) {
          headers['x-user-id'] = userIdValue;
          console.log('[VideoDetailPage] Setting x-user-id header to:', userIdValue);
        }
      } else {
        // If not authenticated, add anonymous session ID
        try {
          // Import here to avoid circular dependencies
          const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
          const sessionId = getOrCreateAnonymousSessionId();
          
          // Add session ID to headers if we have one
          if (sessionId) {
            console.log("[VideoDetailPage] Using anonymous session:", sessionId);
            headers['x-anonymous-session'] = sessionId;
          }
        } catch (error) {
          console.error("[VideoDetailPage] Error getting anonymous session:", error);
        }
      }
      
      console.log("[VideoDetailPage] Request headers:", headers);
      
      const response = await fetch(`/api/videos/${videoId}`, { 
        headers, 
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch video");
      }
      
      return response.json();
    },
    enabled: !!videoId,
  });
  
  const categoriesQuery = useQuery({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      // Initialize headers
      const headers: HeadersInit = {};
      
      // If user is authenticated, add user ID to headers
      if (user?.id) {
        let userIdValue;
        
        // Ensure userId is sent as a clean number in string format
        if (typeof user.id === 'number') {
          userIdValue = String(user.id);
        } else {
          // For strings or other types, extract numeric portion if possible
          const match = String(user.id).match(/\d+/);
          const extractedId = match ? parseInt(match[0], 10) : NaN;
          console.log('[VideoDetailPage] Extracted numeric user ID for categories:', extractedId);
          
          if (!isNaN(extractedId)) {
            userIdValue = String(extractedId);
          } else {
            console.warn('[VideoDetailPage] Failed to extract valid user ID for categories:', user.id);
          }
        }
        
        if (userIdValue) {
          headers['x-user-id'] = userIdValue;
          console.log('[VideoDetailPage] Setting x-user-id header for categories to:', userIdValue);
        }
      } else {
        // If not authenticated, add anonymous session ID
        try {
          // Import here to avoid circular dependencies
          const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
          const sessionId = getOrCreateAnonymousSessionId();
          
          // Add session ID to headers if we have one
          if (sessionId) {
            console.log("[VideoDetailPage] Using anonymous session for categories:", sessionId);
            headers['x-anonymous-session'] = sessionId;
          }
        } catch (error) {
          console.error("[VideoDetailPage] Error getting anonymous session for categories:", error);
        }
      }
      
      console.log("[VideoDetailPage] Categories request headers:", headers);
      
      const response = await fetch(`/api/categories`, { 
        headers, 
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch categories");
      }
      
      return response.json();
    },
  });
  
  // Update video metadata mutation
  const updateVideoMutation = useMutation({
    mutationFn: async (data: Partial<Video>) => {
      // Initialize headers
      let headers: HeadersInit = {};
      
      // If user is authenticated, add user ID to headers
      if (user?.id) {
        let userIdValue;
        
        // Ensure userId is sent as a clean number in string format
        if (typeof user.id === 'number') {
          userIdValue = String(user.id);
        } else {
          // For strings or other types, extract numeric portion if possible
          const match = String(user.id).match(/\d+/);
          const extractedId = match ? parseInt(match[0], 10) : NaN;
          console.log('[VideoDetailPage] Extracted numeric user ID for update:', extractedId);
          
          if (!isNaN(extractedId)) {
            userIdValue = String(extractedId);
          } else {
            console.warn('[VideoDetailPage] Failed to extract valid user ID for update:', user.id);
          }
        }
        
        if (userIdValue) {
          headers['x-user-id'] = userIdValue;
          console.log('[VideoDetailPage] Setting x-user-id header for update to:', userIdValue);
        }
      } else {
        // If not authenticated, add anonymous session ID
        try {
          // Import here to avoid circular dependencies
          const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
          const sessionId = getOrCreateAnonymousSessionId();
          
          // Add session ID to headers if we have one
          if (sessionId) {
            console.log("[VideoDetailPage] Using anonymous session for update:", sessionId);
            headers['x-anonymous-session'] = sessionId;
          }
        } catch (error) {
          console.error("[VideoDetailPage] Error getting anonymous session for update:", error);
        }
      }
      
      console.log("[VideoDetailPage] Update request headers:", headers);
      
      const response = await apiRequest("PATCH", `/api/videos/${videoId}`, data, headers);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Video updated",
        description: "Your changes have been saved successfully.",
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/videos", videoId] });
    },
    onError: (error: any) => {
      console.error("[VideoDetailPage] Error updating video:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to update video. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Initialize form fields when video data is loaded
  useEffect(() => {
    if (videoQuery.data) {
      const video = videoQuery.data;
      setNotes(video.notes || "");
      setRating(video.rating || undefined);
      setIsFavorite(video.is_favorite || false);
      setCategoryId(video.category_id || undefined);
      setCustomTimestamps(video.timestamps || []);
    }
  }, [videoQuery.data]);
  
  // Handle save changes
  const handleSaveChanges = () => {
    updateVideoMutation.mutate({
      notes,
      rating,
      is_favorite: isFavorite,
      category_id: categoryId,
      timestamps: customTimestamps,
    });
  };
  
  // Handle add timestamp
  const handleAddTimestamp = () => {
    if (newTimestamp && !customTimestamps.includes(newTimestamp)) {
      setCustomTimestamps([...customTimestamps, newTimestamp]);
      setNewTimestamp("");
    }
  };
  
  // Handle remove timestamp
  const handleRemoveTimestamp = (timestamp: string) => {
    setCustomTimestamps(customTimestamps.filter(t => t !== timestamp));
  };
  
  // Loading state
  if (videoQuery.isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-grow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
              <Skeleton className="h-8 w-64" />
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-shrink-0 w-full md:w-96">
                  <Skeleton className="aspect-video w-full rounded-lg" />
                </div>
                <div className="flex-grow space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }
  
  // Error state
  if (videoQuery.isError || !videoQuery.data) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold mb-4">Video Not Found</h1>
            <p className="text-gray-400 mb-6">The video you're looking for couldn't be found or has been removed.</p>
            <Link href="/library">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Library
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }
  
  const video = videoQuery.data;
  const categories = categoriesQuery.data || [];
  const videoCategory = categories?.find((c: Category) => c.id === video.category_id);
  
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back button */}
          <div className="mb-6">
            <Link href="/library">
              <Button variant="outline" className="flex items-center">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Library
              </Button>
            </Link>
          </div>
          
          {/* Video info section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Thumbnail */}
            <div className="md:col-span-1">
              <div className="aspect-video bg-zinc-900 rounded-lg overflow-hidden">
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm text-gray-400">
                    <Calendar className="h-4 w-4 mr-1" />
                    <span>{video.publish_date}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-400">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>{video.duration}</span>
                  </div>
                </div>
                
                {video.views && (
                  <div className="flex items-center text-sm text-gray-400">
                    <Eye className="h-4 w-4 mr-1" />
                    <span>{video.views} views</span>
                  </div>
                )}
                
                {video.likes && (
                  <div className="flex items-center text-sm text-gray-400">
                    <ThumbsUp className="h-4 w-4 mr-1" />
                    <span>{video.likes} likes</span>
                  </div>
                )}
                
                <div className="pt-2">
                  <a 
                    href={`https://www.youtube.com/watch?v=${video.youtube_id}`} 
                    target="_blank"
                    rel="noopener noreferrer" 
                    className="flex items-center text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    <span>Watch on YouTube</span>
                  </a>
                </div>
              </div>
            </div>
            
            {/* Main content */}
            <div className="md:col-span-2">
              <div className="flex justify-between items-start mb-2">
                <h1 className="text-2xl font-bold">{video.title}</h1>
                {!isEditing && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsEditing(true)}
                    className="flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
              
              <div className="text-gray-400 mb-4">{video.channel}</div>
              
              {!isEditing ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {video.is_favorite && (
                      <Badge className="bg-red-900 hover:bg-red-800 text-white">
                        <Heart className="h-3 w-3 mr-1 fill-current" />
                        Favorite
                      </Badge>
                    )}
                    
                    {videoCategory && (
                      <Badge 
                        variant={videoCategory.is_global ? "secondary" : "outline"}
                        className={videoCategory.is_global ? "font-medium" : ""}
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {videoCategory.name}
                        {videoCategory.is_global && " (Global)"}
                      </Badge>
                    )}
                  </div>
                  
                  {video.rating && (
                    <div>
                      <h3 className="text-sm font-medium mb-1 text-gray-400">Your Rating</h3>
                      <StarRating value={video.rating} onChange={() => {}} readonly />
                    </div>
                  )}
                  
                  {video.notes && (
                    <div>
                      <h3 className="text-sm font-medium mb-2 text-gray-400">Notes</h3>
                      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 text-sm whitespace-pre-wrap">
                        {video.notes}
                      </div>
                    </div>
                  )}
                  
                  {video.timestamps && video.timestamps.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2 text-gray-400">Timestamps</h3>
                      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                        <ul className="space-y-2">
                          {video.timestamps.map((timestamp, index) => (
                            <li key={index} className="text-sm">
                              {timestamp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800 space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Category</h3>
                    <Select
                      value={categoryId?.toString() || "none"}
                      onValueChange={(value) => setCategoryId(value !== "none" ? parseInt(value) : undefined)}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="none">None</SelectItem>
                        
                        {/* Global categories first */}
                        {categories
                          ?.filter((category: Category) => category.is_global)
                          .map((category: Category) => (
                            <SelectItem 
                              key={category.id} 
                              value={category.id.toString()}
                              className="font-medium text-blue-400"
                            >
                              {category.name} (Global)
                            </SelectItem>
                          ))}
                          
                        {/* Separator if we have both global and user categories */}
                        {categories?.some((category: Category) => category.is_global) && 
                         categories?.some((category: Category) => !category.is_global) && (
                          <SelectSeparator />
                        )}
                          
                        {/* User categories */}
                        {categories
                          ?.filter((category: Category) => !category.is_global)
                          .map((category: Category) => (
                            <SelectItem 
                              key={category.id} 
                              value={category.id.toString()}
                            >
                              {category.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium mb-2">Rating</h3>
                    <StarRating
                      value={rating || 0}
                      onChange={setRating}
                      size="md"
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Add to Favorites</h3>
                      <Switch 
                        checked={isFavorite} 
                        onCheckedChange={setIsFavorite} 
                      />
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium mb-2">Notes</h3>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 min-h-[120px]"
                      placeholder="Add your notes about this video..."
                    />
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium mb-2">Timestamps</h3>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={newTimestamp}
                          onChange={(e) => setNewTimestamp(e.target.value)}
                          placeholder="1:30 - Introduction"
                          className="bg-zinc-800 border-zinc-700"
                        />
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleAddTimestamp}
                          className="flex items-center whitespace-nowrap"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                      
                      {customTimestamps.length > 0 && (
                        <div className="bg-zinc-800 rounded-lg p-2">
                          <ul className="space-y-1">
                            {customTimestamps.map((timestamp, index) => (
                              <li key={index} className="flex justify-between items-center py-1 px-2 text-sm">
                                <span>{timestamp}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveTimestamp(timestamp)}
                                  className="h-6 w-6 p-0"
                                >
                                  &times;
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSaveChanges}
                      disabled={updateVideoMutation.isPending}
                    >
                      {updateVideoMutation.isPending ? (
                        <span className="flex items-center">
                          Saving...
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <Save className="h-4 w-4 mr-1" />
                          Save Changes
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Tabs for transcript and summary */}
          <div className="mt-8">
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="w-full grid grid-cols-3 mb-6">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger 
                  value="qa"
                  onClick={() => {
                    // Fetch conversations to see if any exist
                    fetch(`/api/videos/${videoId}/qa`, {
                      headers: {
                        'x-anonymous-session': localStorage.getItem('anonymousSessionId') || ''
                      }
                    })
                    .then(res => res.json())
                    .then(data => {
                      if (Array.isArray(data) && data.length > 0) {
                        // Set active conversation to the most recent one (assuming sorted by id/date)
                        const latestConversation = data[data.length - 1];
                        // Find QASection and set active conversation
                        const qaEvent = new CustomEvent('setActiveConversation', { 
                          detail: { conversationId: latestConversation.id }
                        });
                        window.dispatchEvent(qaEvent);
                      } else {
                        // Trigger "Start new conversation" mode
                        const newConvoEvent = new CustomEvent('startNewConversation');
                        window.dispatchEvent(newConvoEvent);
                      }
                    })
                    .catch(err => {
                      console.error('Error fetching conversations:', err);
                    });
                  }}
                >
                  Q&A
                </TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
              </TabsList>
              
              <Separator className="mb-6" />
              
              <TabsContent value="summary">
                {video.summary && video.summary.length > 0 ? (
                  <SummarySection summary={video.summary} videoId={video.id} />
                ) : (
                  <div className="text-center py-12">
                    <Bookmark className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-xl font-medium mb-2">No Summary Available</h3>
                    <p className="text-gray-400 max-w-xl mx-auto">
                      This video doesn't have an AI-generated summary yet. Summaries are created during the video processing stage.
                    </p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="qa">
                {video.transcript ? (
                  <QASection videoId={video.id} />
                ) : (
                  <div className="text-center py-12">
                    <Bookmark className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-xl font-medium mb-2">Q&A Not Available</h3>
                    <p className="text-gray-400 max-w-xl mx-auto">
                      This video doesn't have a transcript available, which is required for Q&A functionality.
                      Transcripts are extracted during the video processing stage.
                    </p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="transcript">
                {video.transcript ? (
                  <TranscriptSection transcript={video.transcript} videoId={video.id} />
                ) : (
                  <div className="text-center py-12">
                    <Bookmark className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-xl font-medium mb-2">No Transcript Available</h3>
                    <p className="text-gray-400 max-w-xl mx-auto">
                      This video doesn't have a transcript available. Transcripts are extracted during the video processing stage.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}