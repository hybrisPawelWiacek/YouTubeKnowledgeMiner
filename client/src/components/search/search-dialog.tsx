import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchResultsList } from "@/components/search/search-results-list";
import { Search } from "lucide-react";

interface SearchDialogProps {
  videoId?: number;
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
  initialSearchTerm?: string;
}

export function SearchDialog({
  videoId,
  trigger,
  title = "Semantic Search",
  description = "Search through video content by meaning, not just keywords",
  initialSearchTerm = "",
}: SearchDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="flex items-center gap-1.5">
            <Search className="h-4 w-4" />
            <span>Search Content</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <SearchResultsList
            videoId={videoId}
            initialSearchTerm={initialSearchTerm}
            onResultSelect={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}