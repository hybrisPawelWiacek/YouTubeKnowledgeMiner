import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';

type ExportFormat = 'txt' | 'csv' | 'json';
type ContentType = 'transcript' | 'summary';

interface BatchExportButtonProps {
  videoIds: number[];
  disabled?: boolean;
}

export function BatchExportButton({ videoIds, disabled = false }: BatchExportButtonProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState<ContentType>('transcript');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('txt');
  
  // Fetch user's preferred export format
  const formatPreferenceQuery = useQuery({
    queryKey: ['/api/export/preferences'],
    enabled: isDialogOpen, // Only fetch when dialog is open
  });
  
  // Set the format based on user preference when data is available
  useEffect(() => {
    if (formatPreferenceQuery.data && formatPreferenceQuery.data.format && isDialogOpen) {
      setSelectedFormat(formatPreferenceQuery.data.format as ExportFormat);
      setIsDialogOpen(false); // Close the dialog to prevent infinite loop
    }
  }, [formatPreferenceQuery.data, isDialogOpen]);
  
  // Save format preference mutation
  const saveFormatPreferenceMutation = useMutation({
    mutationFn: async (format: ExportFormat) => {
      return apiRequest("POST", '/api/export/preferences', { format });
    }
  });
  
  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (data: {
      content_type: ContentType;
      format: ExportFormat;
      video_ids: number[];
    }) => {
      return apiRequest("POST", '/api/export', data);
    },
    onSuccess: async (response) => {
      // Save format preference if it has changed
      saveFormatPreferenceMutation.mutate(selectedFormat);
      
      // Parse the response to get the content, mimeType, and filename
      const data = await response;
      
      // Create a download link for the exported content
      const blob = new Blob([data.content], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      toast({
        title: 'Batch Export Successful',
        description: `Your ${selectedContentType}s have been exported as ${selectedFormat.toUpperCase()}.`,
      });
    },
    onError: (error) => {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'An error occurred during export',
        variant: 'destructive',
      });
    }
  });
  
  // Handle export
  const handleExport = () => {
    exportMutation.mutate({
      content_type: selectedContentType,
      format: selectedFormat,
      video_ids: videoIds
    });
    setIsDialogOpen(false);
  };
  
  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setIsDialogOpen(true)}
        disabled={disabled || videoIds.length === 0}
      >
        <Download className="mr-2 h-4 w-4" />
        Batch Export
      </Button>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Export</DialogTitle>
            <DialogDescription>
              Export content from {videoIds.length} selected videos.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium">Content Type</h4>
              <RadioGroup
                value={selectedContentType}
                onValueChange={(value) => setSelectedContentType(value as ContentType)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="transcript" id="batch-content-transcript" />
                  <Label htmlFor="batch-content-transcript">Transcripts</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="summary" id="batch-content-summary" />
                  <Label htmlFor="batch-content-summary">Summaries</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                Note: Q&A content is not available for batch export.
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Format</h4>
              <RadioGroup
                value={selectedFormat}
                onValueChange={(value) => setSelectedFormat(value as ExportFormat)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="txt" id="batch-format-txt" />
                  <Label htmlFor="batch-format-txt">Plain Text (.txt)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="csv" id="batch-format-csv" />
                  <Label htmlFor="batch-format-csv">CSV (.csv)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="json" id="batch-format-json" />
                  <Label htmlFor="batch-format-json">JSON (.json)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? 'Exporting...' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}