import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onGetStarted: () => void;
}

export function EmptyState({ onGetStarted }: EmptyStateProps) {
  return (
    <section className="my-12">
      <div className="max-w-3xl mx-auto text-center py-12">
        <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="text-primary h-12 w-12"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to YouTubeKnowledgeMiner</h2>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          Extract knowledge from YouTube videos, analyze transcripts, and build your personal video library.
        </p>
        <div className="flex flex-col items-center">
          <ol className="text-left text-gray-300 mb-6 space-y-3">
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
                <span className="text-xs font-medium">1</span>
              </div>
              <p>Paste a YouTube URL in the input field above</p>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
                <span className="text-xs font-medium">2</span>
              </div>
              <p>Click "Analyze" to extract video information and transcript</p>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
                <span className="text-xs font-medium">3</span>
              </div>
              <p>Add your notes, category, and rating to save to your library</p>
            </li>
          </ol>
          <Button onClick={onGetStarted} className="px-5 py-3">
            Get Started
          </Button>
        </div>
      </div>
    </section>
  );
}
