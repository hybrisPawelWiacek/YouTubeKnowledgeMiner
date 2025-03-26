import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SummarySection } from "@/components/summary-section";
import { YoutubeVideo, VideoMetadata, Category } from "@/types";
import { useSupabase } from "@/hooks/use-supabase";
import { useAuthPrompt } from "@/hooks/use-auth-prompt";
import { AuthPromptDialog } from "@/components/auth/auth-prompt-dialog";
import { 
  User, Calendar, Link, ThumbsUp, Eye, Clock, 
  Tag as TagIcon, Info, PlusCircle 
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


interface VideoResultProps {
  video: YoutubeVideo;
}

export function VideoResult({ video }: VideoResultProps) {
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [showDescription, setShowDescription] = useState(false);
  const { toast } = useToast();
  const { user } = useSupabase();
  const { showAuthPrompt, promptType, promptAuth, closePrompt, incrementEngagement } = useAuthPrompt();
  const [pendingMetadata, setPendingMetadata] = useState<VideoMetadata | null>(null);
  const [interactionCount, setInteractionCount] = useState(0);
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
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

  // Function to handle the actual video saving
  const handleActualSave = (metadata: VideoMetadata) => {
    saveVideo({
      ...metadata,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      description: video.description,
      tags: video.tags,
      summary: video.summary
    });
  };

  // Function when user chooses to continue as guest
  const handleContinueAsGuest = () => {
    if (pendingMetadata) {
      handleActualSave(pendingMetadata);
      setPendingMetadata(null);
    }
  };

  // Handle saving the video with all metadata
  const handleSave = () => {
    const metadata: VideoMetadata = {
      notes: notes || undefined,
      category_id: categoryId,
      rating: rating || undefined,
    };

    // Store the metadata
    setPendingMetadata(metadata);

    // Track this high-value action
    incrementEngagement();
    setInteractionCount(prev => prev + 1);

    // Show auth prompt for non-authenticated users
    if (!user) {
      // Determine if this is a high-quality save (has meaningful data)
      const hasQualityMetadata = 
        (notes && notes.length > 20) || // User added significant notes
        (rating > 3) ||                 // User gave high rating
        categoryId !== undefined;       // User categorized the video

      // Higher likelihood of prompting if user has added quality metadata
      // or has had significant engagement with the result
      if (hasQualityMetadata || interactionCount >= 3) {
        // This is a high-value moment to prompt for auth
        const prompted = promptAuth('save_video');
        if (!prompted) {
          // If the prompt wasn't shown (e.g., suppressed), continue with normal flow
          handleActualSave(metadata);
        }
      } else {
        // Not the best moment to interrupt with auth - just save silently
        handleActualSave(metadata);
      }
    } else {
      // User is authenticated, proceed normally
      handleActualSave(metadata);
    }
  };

  const createCategory = async (categoryName: string) => {
    try {
      await apiRequest("POST", "/api/categories", { name: categoryName });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category created successfully!", description: "" });
    } catch (error) {
      toast({ title: "Error creating category", description: error.message, variant: "destructive" });
    }
  };


  return (
    <>
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Video Information</h2>

        {/* Show AI-generated summary if available */}
        {video.summary && video.summary.length > 0 && (
          <SummarySection 
            summary={video.summary} 
            videoId={video.id || 0} 
          />
        )}

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
                      onClick={() => {
                        setShowDescription(!showDescription);
                        // Track as engagement only when showing description (not hiding)
                        if (!showDescription) {
                          incrementEngagement();
                        }
                      }}
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
                      onChange={(e) => {
                        setNotes(e.target.value);
                        // Track meaningful engagement (when typing notes)
                        if (e.target.value.length > 10 && notes.length <= 10) {
                          incrementEngagement();
                          setInteractionCount(prev => prev + 1);
                        }
                      }}
                      className="resize-none bg-zinc-900 border-zinc-700"
                      rows={2}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-full sm:w-1/2">
                      <label htmlFor="videoCategory" className="block text-sm font-medium text-gray-300 mb-1">
                        Category
                      </label>
                      <Select 
                        onValueChange={(value) => {
                          // Handle special "create" action
                          if (value === "create-new") {
                            // If user is not authenticated, show login prompt
                            if (!user) {
                              toast({
                                title: "Authentication Required",
                                description: "Please log in or create an account to add custom categories",
                                variant: "default",
                              });
                              return;
                            }

                            // Show dialog to create new category
                            setShowCreateCategoryDialog(true);
                          } else {
                            setCategoryId(Number(value));
                            incrementEngagement();
                            setInteractionCount(prev => prev + 1);
                          }
                        }}
                      >
                        <SelectTrigger className="bg-zinc-900 border-zinc-700">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {/* Global categories first */}
                          {categories
                            .filter((category: Category) => category.is_global)
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
                          {categories.some((category: Category) => category.is_global) && 
                           categories.some((category: Category) => !category.is_global) && (
                            <SelectSeparator />
                          )}

                          {/* User categories */}
                          {categories
                            .filter((category: Category) => !category.is_global)
                            .map((category: Category) => (
                              <SelectItem 
                                key={category.id} 
                                value={category.id.toString()}
                              >
                                {category.name}
                              </SelectItem>
                            ))}
                          {/* Add option to create new category */}
                          <SelectItem value="create-new" className="border-t border-zinc-700 mt-1 pt-1">
                            <PlusCircle className="mr-2 h-4 w-4 inline-block" /> Create new category...
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Create category dialog */}
                      {showCreateCategoryDialog && (
                        <Dialog open={showCreateCategoryDialog} onOpenChange={setShowCreateCategoryDialog}>
                          <DialogContent className="bg-zinc-900 border-zinc-700">
                            <DialogHeader>
                              <DialogTitle>Create New Category</DialogTitle>
                              <DialogDescription>
                                Add a new category to organize your videos.
                              </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={(e) => {
                              e.preventDefault();
                              if (newCategoryName.trim()) {
                                createCategory(newCategoryName.trim());
                                setNewCategoryName("");
                                setShowCreateCategoryDialog(false);
                              }
                            }}>
                              <Input
                                className="bg-zinc-800 border-zinc-700"
                                placeholder="Category name"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                              />
                              <DialogFooter className="mt-4">
                                <Button type="submit" disabled={!newCategoryName.trim()}>
                                  Create
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>

                    <div className="w-full sm:w-1/2">
                      <label htmlFor="videoRating" className="block text-sm font-medium text-gray-300 mb-1">
                        Rating
                      </label>
                      <StarRating
                        value={rating}
                        onChange={(newRating) => {
                          setRating(newRating);
                          if (newRating > 0) {
                            incrementEngagement();
                            setInteractionCount(prev => prev + 1);
                          }
                        }}
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

      {/* Authentication prompt dialog */}
      <AuthPromptDialog
        isOpen={showAuthPrompt}
        onClose={closePrompt}
        promptType={promptType}
        onContinueAsGuest={handleContinueAsGuest}
      />
    </>
  );
}