import { useState, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { VideoInput } from "@/components/video-input";
import { VideoResult } from "@/components/video-result";
import { ProcessingState } from "@/components/processing-state";
import { EmptyState } from "@/components/empty-state";
import { TranscriptSection } from "@/components/transcript-section";
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
          <EmptyState onGetStarted={handleGetStarted} />
        )}
      </main>
      
      <Footer />
    </div>
  );
}
