import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { isValidYoutubeUrl } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { YoutubeVideo } from "@/types";
import { useSupabase } from "@/hooks/use-supabase";
import { useAuthPrompt } from "@/hooks/use-auth-prompt";
import { AuthPromptDialog } from "@/components/auth/auth-prompt-dialog";
import { useLocation } from "wouter";
import { useError } from "@/contexts/error-context";
import { ApiErrorDisplay } from "@/components/ui/api-error-display";

interface VideoInputProps {
  onVideoProcessed: (video: YoutubeVideo) => void;
}

export function VideoInput({ onVideoProcessed }: VideoInputProps) {
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const { user, getLocalData, setLocalData, hasReachedAnonymousLimit } = useSupabase();
  const { showAuthPrompt, promptType, promptAuth, closePrompt } = useAuthPrompt();
  const [pendingVideo, setPendingVideo] = useState<YoutubeVideo | null>(null);
  const [location, setLocation] = useLocation();
  const [anonymousCount, setAnonymousCount] = useState(0);
  const { error, handleAnonymousError, clearError } = useError();

  // Keep anonymous count updated
  useEffect(() => {
    if (!user) {
      async function fetchAnonymousVideoCount() {
        try {
          // Import here to avoid circular dependencies
          const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
          const sessionId = getOrCreateAnonymousSessionId();
          
          // Get count from API
          const headers = { 'x-anonymous-session': sessionId };
          console.log('[VideoInput] Fetching video count with session:', sessionId);
          // Add cache-busting query parameter to prevent 304 responses
          const cacheBuster = `?_t=${Date.now()}`;
          const response = await fetch(`/api/videos/count${cacheBuster}`, {
            method: 'GET',
            headers,
            credentials: 'include'
          }).then(res => res.json());
          
          if (response && typeof response.count === 'number') {
            setAnonymousCount(response.count);
          } else {
            // Fallback to local storage if API fails
            const localData = getLocalData();
            setAnonymousCount(localData.videos?.length || 0);
          }
        } catch (error) {
          console.error('Error fetching anonymous video count:', error);
          // Fallback to local storage
          const localData = getLocalData();
          setAnonymousCount(localData.videos?.length || 0);
        }
      }
      
      fetchAnonymousVideoCount();
    }
  }, [user, getLocalData]);

  const { mutate: analyzeVideo, isPending } = useMutation({
    mutationFn: async (videoUrl: string) => {
      console.log('[VideoInput] Starting API request to analyze video:', videoUrl);
      const response = await apiRequest("POST", "/api/videos/analyze", { url: videoUrl });
      const data = await response.json();
      console.log('[VideoInput] API response data:', data);
      return data;
    },
    onSuccess: async (data) => {
      console.log('[VideoInput] onSuccess called with data:', data);
      setPendingVideo(data);
      
      if (!user) {
        // Check if we've reached the limit
        const limitReached = await hasReachedAnonymousLimit();
        console.log('[VideoInput] Anonymous user limit reached?', limitReached);
        if (limitReached) {
          promptAuth('analyze_again');
        } else {
          // This will be processed by the server on the backend
          // We only need to update the local UI state
          console.log('[VideoInput] About to call handleVideoProcessed with data:', data);
          handleVideoProcessed(data);
          
          // Refresh count to get latest from server
          try {
            const { getOrCreateAnonymousSessionId } = await import('@/lib/anonymous-session');
            const sessionId = getOrCreateAnonymousSessionId();
            const headers = { 'x-anonymous-session': sessionId };
            console.log('[VideoInput] Refreshing video count with session:', sessionId);
            // Add cache-busting query parameter to prevent 304 responses
            const cacheBuster = `?_t=${Date.now()}`;
            const response = await fetch(`/api/videos/count${cacheBuster}`, {
              method: 'GET',
              headers,
              credentials: 'include'
            }).then(res => res.json());
            
            if (response && typeof response.count === 'number') {
              setAnonymousCount(response.count);
              
              // Show toast if we've reached the limit
              if (response.count >= 3) {
                toast({
                  title: "Video limit reached",
                  description: "You've reached the limit of 3 videos. Sign in to analyze more videos.",
                  variant: "default",
                });
              }
            }
          } catch (error) {
            console.error('Error updating video count:', error);
          }
        }
      } else {
        console.log('[VideoInput] Authenticated user, calling handleVideoProcessed with data:', data);
        handleVideoProcessed(data);
      }
    },
    onError: (error: any) => {
      console.error("Video processing error:", error);
      
      // Clear any previous errors
      clearError();
      
      // Try to identify if this is an anonymous limit error
      if (error?.code === 'ANONYMOUS_LIMIT_REACHED') {
        handleAnonymousError(error);
      } else if (error?.response?.data) {
        // Handle standard API errors with response data
        handleAnonymousError({
          message: error.response.data.message || "Failed to process video",
          code: error.response.data.code,
          details: error.response.data.details,
        });
      } else {
        // Handle other errors
        toast({
          title: "Processing failed",
          description: error.message || "Could not process this video. It may not have available transcripts.",
          variant: "destructive",
        });
      }
    },
  });

  const handleVideoProcessed = (videoData: any) => {
    // Check if the video data is wrapped in a data property (API format)
    const video = videoData.data ? videoData.data : videoData;
    console.log('[VideoInput] Processing video with extracted data:', video);
    
    // Now call the parent component's handler with the properly structured data
    onVideoProcessed(video);
    
    toast({
      title: "Video analyzed",
      description: "Successfully processed video information and transcript",
    });
  };

  const handleContinueAsGuest = () => {
    if (pendingVideo) {
      // Pass the pending video through the same processor that handles the data structure
      handleVideoProcessed(pendingVideo);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[VideoInput] Submit button clicked:", { url });

    if (!url) {
      toast({
        title: "Empty URL",
        description: "Please enter a YouTube URL",
        variant: "destructive",
      });
      return;
    }

    if (!isValidYoutubeUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL",
        variant: "destructive",
      });
      return;
    }

    // Check if anonymous user has reached the limit before even making the API call
    if (!user) {
      console.log("[VideoInput] Checking anonymous limit before analyzing");
      try {
        const limitReached = await hasReachedAnonymousLimit();
        console.log("[VideoInput] Anonymous limit reached:", limitReached);
        if (limitReached) {
          setPendingVideo(null);
          
          // Show limit reached message directly
          toast({
            title: "Video Limit Reached",
            description: "You've reached the limit of 3 videos as a guest user. Please sign in to analyze more videos.",
            variant: "destructive",
          });
          
          // After a short delay, redirect to the auth page
          setTimeout(() => {
            setLocation('/auth');
          }, 2000);
          
          return;
        }
      } catch (error) {
        console.error("[VideoInput] Error checking anonymous limit:", error);
      }
    }

    console.log("[VideoInput] Proceeding to analyze video:", url);
    analyzeVideo(url);
  };


  return (
    <>
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Add a YouTube Video</h2>
        <Card className="bg-zinc-900">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-300 mb-1">
                    YouTube URL
                  </label>
                  <Input
                    id="videoUrl"
                    name="videoUrl"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder-gray-500"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full md:w-auto"
                  >
                    {isPending ? "Processing..." : "Analyze"}
                    {!isPending && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="ml-2 h-4 w-4"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Error display */}
              {error && (
                <div className="mt-4">
                  <ApiErrorDisplay 
                    type={error.type}
                    message={error.message}
                    code={error.code}
                    details={error.details}
                    onRetry={() => {
                      clearError();
                      if (url) {
                        analyzeVideo(url);
                      }
                    }}
                  />
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </section>

      <AuthPromptDialog
        isOpen={showAuthPrompt}
        onClose={closePrompt}
        promptType={promptType}
        onContinueAsGuest={handleContinueAsGuest}
      />
    </>
  );
}