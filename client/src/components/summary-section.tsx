import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/export/export-button";

interface SummarySectionProps {
  summary: string[];
  videoId: number;
}

export function SummarySection({ summary, videoId }: SummarySectionProps) {
  if (!summary || summary.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <span className="mr-2">AI-Generated Summary</span>
          <Badge variant="outline" className="ml-2 bg-indigo-800/10 text-indigo-400">
            AI
          </Badge>
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