import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Expand, Copy, Clipboard, ChevronsUpDown } from "lucide-react";
import { ExportButton } from "@/components/export/export-button";

interface TranscriptSectionProps {
  transcript: string;
  videoId: number;
}

export function TranscriptSection({ transcript, videoId }: TranscriptSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const toggleExpansion = () => {
    setExpanded(!expanded);
  };

  const copyTranscript = () => {
    // Create a temporary element to extract text without HTML tags
    const tempElement = document.createElement("div");
    tempElement.innerHTML = transcript;
    const textContent = tempElement.textContent || tempElement.innerText || "";
    
    navigator.clipboard.writeText(textContent)
      .then(() => {
        toast({
          title: "Copied",
          description: "Transcript copied to clipboard",
        });
      })
      .catch((error) => {
        console.error("Failed to copy transcript:", error);
        toast({
          title: "Copy failed",
          description: "Could not copy transcript to clipboard",
          variant: "destructive",
        });
      });
  };

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Video Transcript</h2>
        <div className="flex items-center gap-2">
          <ExportButton 
            videoId={videoId}
            hasTranscript={!!transcript}
            small
          />
          <Button
            variant="outline"
            size="sm"
            onClick={copyTranscript}
            className="flex items-center bg-zinc-800 hover:bg-zinc-700 border-zinc-700"
          >
            <Copy className="mr-1 h-4 w-4" /> Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleExpansion}
            className="flex items-center bg-zinc-800 hover:bg-zinc-700 border-zinc-700"
          >
            {expanded ? (
              <>
                <ChevronsUpDown className="mr-1 h-4 w-4" /> Collapse
              </>
            ) : (
              <>
                <Expand className="mr-1 h-4 w-4" /> Expand
              </>
            )}
          </Button>
        </div>
      </div>
      
      <Card className="bg-zinc-900">
        <CardContent className="p-6">
          <div 
            id="transcriptContent"
            className={`${expanded ? '' : 'max-h-80'} overflow-y-auto pr-2`}
            dangerouslySetInnerHTML={{ __html: transcript }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
