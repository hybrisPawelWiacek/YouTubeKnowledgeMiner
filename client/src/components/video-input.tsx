import { useState } from "react";
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

interface VideoInputProps {
  onVideoProcessed: (video: YoutubeVideo) => void;
}

export function VideoInput({ onVideoProcessed }: VideoInputProps) {
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const { user } = useSupabase();
  const { showAuthPrompt, promptType, promptAuth, closePrompt } = useAuthPrompt();
  const [pendingVideo, setPendingVideo] = useState<YoutubeVideo | null>(null);
  const [location, setLocation] = useLocation();

  const { mutate: analyzeVideo, isPending } = useMutation({
    mutationFn: async (videoUrl: string) => {
      const response = await apiRequest("POST", "/api/videos/analyze", { url: videoUrl });
      return response.json();
    },
    onSuccess: (data) => {
      setPendingVideo(data);
      if (!user) {
        const anonymousVideos = getLocalData().videos || [];
        if (anonymousVideos.length >= 3) {
          promptAuth('analyze_again');
        } else {
          handleVideoProcessed(data);
        }
      } else {
        handleVideoProcessed(data);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed",
        description: error.message || "Could not process this video. It may not have available transcripts.",
        variant: "destructive",
      });
    },
  });

  const handleVideoProcessed = (video: YoutubeVideo) => {
    onVideoProcessed(video);
    toast({
      title: "Video analyzed",
      description: "Successfully processed video information and transcript",
    });
  };

  const handleContinueAsGuest = () => {
    if (pendingVideo) {
      handleVideoProcessed(pendingVideo);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

    analyzeVideo(url);
  };

  const getLocalData = () => {
    const data = localStorage.getItem('anonymousVideos');
    return data ? JSON.parse(data) : { videos: [] };
  };

  const setLocalData = (data: { videos: YoutubeVideo[] }) => {
    localStorage.setItem('anonymousVideos', JSON.stringify(data));
  };

  const hasReachedAnonymousLimit = () => {
    const anonymousVideos = getLocalData().videos || [];
    return anonymousVideos.length >= 3;
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