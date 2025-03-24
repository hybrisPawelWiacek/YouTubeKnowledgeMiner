import { Card, CardContent } from "@/components/ui/card";

export function ProcessingState() {
  return (
    <section className="mb-12">
      <Card className="bg-zinc-900 max-w-3xl">
        <CardContent className="p-6">
          <div className="flex items-center mb-4">
            <div className="mr-4 text-xl text-primary">
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
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium">Processing Video</h3>
              <p className="text-gray-400 text-sm">Fetching metadata and transcripts...</p>
            </div>
          </div>
          <div className="relative h-1 w-full bg-zinc-800 overflow-hidden rounded mb-4">
            <div className="absolute h-full bg-primary animate-[loading_1.5s_infinite_ease]" style={{ width: '40%', left: '-40%' }}></div>
          </div>
          <div className="text-sm text-gray-400">This may take a few moments depending on the video length.</div>
        </CardContent>
      </Card>
    </section>
  );
}
