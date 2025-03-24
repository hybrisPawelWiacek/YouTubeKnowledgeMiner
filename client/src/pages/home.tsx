import { useState, useRef } from "react";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { VideoInput } from "@/components/video-input";
import { VideoResult } from "@/components/video-result";
import { ProcessingState } from "@/components/processing-state";
import { EmptyState } from "@/components/empty-state";
import { TranscriptSection } from "@/components/transcript-section";
import { Button } from "@/components/ui/button";
import { BookOpen, FolderOpen } from "lucide-react";
import { YoutubeVideo } from "@/types";

export default function Home() {
  const [processingVideo, setProcessingVideo] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<YoutubeVideo | null>(null);
  const videoInputRef = useRef<HTMLDivElement>(null);

  const handleVideoProcessed = (video: YoutubeVideo) => {
    setProcessingVideo(false);
    setCurrentVideo(video);
  };

  const handleStartProcessing = () => {
    setProcessingVideo(true);
    setCurrentVideo(null);
  };

  const handleGetStarted = () => {
    if (videoInputRef.current) {
      videoInputRef.current.scrollIntoView({ behavior: 'smooth' });
      const input = videoInputRef.current.querySelector('input');
      if (input) {
        input.focus();
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title & Library Link (only shown when no video is being processed or displayed) */}
        {!processingVideo && !currentVideo && (
          <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">YouTube Knowledge Miner</h1>
              <p className="text-gray-400 max-w-2xl">
                Extract insights from YouTube videos, organize them in your personal library, and access the content whenever you need it.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/library">
                <Button variant="outline" className="flex items-center">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  My Library
                </Button>
              </Link>
            </div>
          </div>
        )}
        
        {currentVideo && (
          <div className="mb-6">
            <Link href="/library">
              <Button variant="outline" className="flex items-center mb-4">
                <FolderOpen className="h-4 w-4 mr-2" />
                Go to Library
              </Button>
            </Link>
          </div>
        )}
        
        <div ref={videoInputRef}>
          <VideoInput 
            onVideoProcessed={handleVideoProcessed}
          />
        </div>
        
        {processingVideo && (
          <ProcessingState />
        )}
        
        {currentVideo && (
          <>
            <VideoResult video={currentVideo} />
            {currentVideo.transcript && (
              <TranscriptSection transcript={currentVideo.transcript} />
            )}
          </>
        )}
        
        {!processingVideo && !currentVideo && (
          <>
            <EmptyState onGetStarted={handleGetStarted} />
            
            {/* Library Callout */}
            <div className="mt-16 bg-zinc-900 rounded-lg p-6 border border-zinc-800">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold mb-2">Organize Your Video Knowledge</h2>
                  <p className="text-gray-400 mb-4">
                    Save videos to your library, organize them into collections, add notes, and search through their content.
                  </p>
                  <Link href="/library">
                    <Button>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Browse My Library
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      
      <Footer />
    </div>
  );
}
