import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/export/export-button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";

interface SummarySectionProps {
  summary: string[];
  videoId: number;
}

export function SummarySection({ summary, videoId }: SummarySectionProps) {
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);
  
  if (!summary || summary.length === 0) {
    return null;
  }

  const copySummary = async () => {
    try {
      setCopying(true);
      
      // Join all summary points into a single string with bullet points
      const summaryText = summary.map(point => `• ${point}`).join('\n');
      
      // Use the modern clipboard API
      await navigator.clipboard.writeText(summaryText);
      
      toast({
        title: "Copied",
        description: "Summary copied to clipboard",
      });
      
      // Show the checkmark icon briefly
      setTimeout(() => {
        setCopying(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy summary:", error);
      
      // Fallback method for browsers that don't support clipboard API
      try {
        const textArea = document.createElement("textarea");
        textArea.value = summary.map(point => `• ${point}`).join('\n');
        
        // Make the textarea out of viewport
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        if (successful) {
          toast({
            title: "Copied",
            description: "Summary copied to clipboard",
          });
        } else {
          throw new Error("Copy command failed");
        }
        
        // Clean up
        document.body.removeChild(textArea);
      } catch (fallbackError) {
        toast({
          title: "Copy failed",
          description: "Could not copy summary to clipboard",
          variant: "destructive",
        });
      }
      
      setCopying(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center">
            <span className="mr-2">AI-Generated Summary</span>
            <Badge variant="outline" className="ml-2 bg-indigo-800/10 text-indigo-400">
              AI
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={copySummary}
              className="flex items-center gap-1"
            >
              {copying ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copy All</span>
                </>
              )}
            </Button>
            <ExportButton 
              videoId={videoId}
              hasSummary={true}
              small
            />
          </div>
        </CardTitle>
        <CardDescription>
          Key points extracted from the video
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 list-disc pl-5">
          {summary.map((point, index) => (
            <li key={index} className="text-base">
              {point}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}