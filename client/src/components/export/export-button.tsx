import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
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
import { Download, File, FileText, FileJson } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';

type ExportFormat = 'txt' | 'csv' | 'json';
type ContentType = 'transcript' | 'summary' | 'qa';

interface ExportButtonProps {
  videoId: number;
  hasTranscript?: boolean;
  hasSummary?: boolean;
  qaConversationId?: number;
  videoTitle?: string;
  small?: boolean;
}

export function ExportButton({ 
  videoId, 
  hasTranscript = false, 
  hasSummary = false, 
  qaConversationId,
  videoTitle,
  small = false
}: ExportButtonProps) {
  const { toast } = useToast();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState<ContentType>('transcript');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('txt');
  
  // Fetch user's preferred export format
  const formatPreferenceQuery = useQuery({
    queryKey: ['/api/export/preferences'],
    enabled: isExportDialogOpen, // Only fetch when dialog is open
  });
  
  // Set the format based on user preference when data is available
  if (formatPreferenceQuery.data && isExportDialogOpen) {
    setSelectedFormat(formatPreferenceQuery.data.format);
    setIsExportDialogOpen(false); // Close the dialog to prevent infinite loop
  }
  
  // Save format preference mutation
  const saveFormatPreferenceMutation = useMutation({
    mutationFn: async (format: ExportFormat) => {
      return apiRequest('/api/export/preferences', {
        method: 'POST',
        data: { format }
      });
    }
  });
  
  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (data: {
      content_type: ContentType;
      format: ExportFormat;
      video_ids: number[];
      qa_conversation_id?: number;
    }) => {
      return apiRequest('/api/export', {
        method: 'POST',
        data
      });
    },
    onSuccess: (data) => {
      // Save format preference if it has changed
      saveFormatPreferenceMutation.mutate(selectedFormat);
      
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
        title: 'Export Successful',
        description: `Your ${selectedContentType} has been exported as ${selectedFormat.toUpperCase()}.`,
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
  
  // Direct export without dialog (for dropdown menu items)
  const handleDirectExport = (contentType: ContentType, format: ExportFormat) => {
    exportMutation.mutate({
      content_type: contentType,
      format,
      video_ids: [videoId],
      qa_conversation_id: contentType === 'qa' ? qaConversationId : undefined
    });
  };
  
  // Handle export from dialog
  const handleExport = () => {
    exportMutation.mutate({
      content_type: selectedContentType,
      format: selectedFormat,
      video_ids: [videoId],
      qa_conversation_id: selectedContentType === 'qa' ? qaConversationId : undefined
    });
    setIsExportDialogOpen(false);
  };
  
  // Determine available content types
  const availableTypes: ContentType[] = [];
  if (hasTranscript) availableTypes.push('transcript');
  if (hasSummary) availableTypes.push('summary');
  if (qaConversationId) availableTypes.push('qa');
  
  // Format icons
  const formatIcons = {
    txt: <FileText className="mr-2 h-4 w-4" />,
    csv: <File className="mr-2 h-4 w-4" />,
    json: <FileJson className="mr-2 h-4 w-4" />
  };
  
  if (availableTypes.length === 0) {
    return null; // Nothing to export
  }
  
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={small ? "sm" : "default"}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {hasTranscript && (
            <>
              <DropdownMenuItem
                onClick={() => handleDirectExport('transcript', 'txt')}
              >
                {formatIcons.txt} Transcript as TXT
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDirectExport('transcript', 'csv')}
              >
                {formatIcons.csv} Transcript as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDirectExport('transcript', 'json')}
              >
                {formatIcons.json} Transcript as JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          {hasSummary && (
            <>
              <DropdownMenuItem
                onClick={() => handleDirectExport('summary', 'txt')}
              >
                {formatIcons.txt} Summary as TXT
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDirectExport('summary', 'csv')}
              >
                {formatIcons.csv} Summary as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDirectExport('summary', 'json')}
              >
                {formatIcons.json} Summary as JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          {qaConversationId && (
            <>
              <DropdownMenuItem
                onClick={() => handleDirectExport('qa', 'txt')}
              >
                {formatIcons.txt} Q&A as TXT
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDirectExport('qa', 'csv')}
              >
                {formatIcons.csv} Q&A as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDirectExport('qa', 'json')}
              >
                {formatIcons.json} Q&A as JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem
            onClick={() => setIsExportDialogOpen(true)}
          >
            <Download className="mr-2 h-4 w-4" /> Advanced Export Options
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Content</DialogTitle>
            <DialogDescription>
              Choose what content to export and in which format.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium">Content Type</h4>
              <RadioGroup
                value={selectedContentType}
                onValueChange={(value) => setSelectedContentType(value as ContentType)}
              >
                {hasTranscript && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="transcript" id="content-transcript" />
                    <Label htmlFor="content-transcript">Transcript</Label>
                  </div>
                )}
                {hasSummary && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="summary" id="content-summary" />
                    <Label htmlFor="content-summary">Summary</Label>
                  </div>
                )}
                {qaConversationId && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="qa" id="content-qa" />
                    <Label htmlFor="content-qa">Q&A Conversation</Label>
                  </div>
                )}
              </RadioGroup>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Format</h4>
              <RadioGroup
                value={selectedFormat}
                onValueChange={(value) => setSelectedFormat(value as ExportFormat)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="txt" id="format-txt" />
                  <Label htmlFor="format-txt">Plain Text (.txt)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="csv" id="format-csv" />
                  <Label htmlFor="format-csv">CSV (.csv)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="json" id="format-json" />
                  <Label htmlFor="format-json">JSON (.json)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
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