import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchResultItem } from "@/components/search/search-result-item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Loader2 } from "lucide-react";

interface SearchResult {
  id: number;
  video_id: number;
  content: string;
  content_type: 'transcript' | 'summary' | 'note';
  similarity: number;
  metadata: any;
}

interface SearchResultsListProps {
  videoId?: number;
  initialSearchTerm?: string;
  onResultSelect?: (result: SearchResult) => void;
}

export function SearchResultsList({ videoId, initialSearchTerm = "", onResultSelect }: SearchResultsListProps) {
  // Search state
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Navigation and toast
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!searchTerm.trim()) return [];
      
      const response = await fetch("/api/semantic-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchTerm,
          filter: {
            video_id: videoId,
            content_types: activeTab === "all" ? undefined : [activeTab],
          },
          limit: 20,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to search");
      }
      
      return response.json() as Promise<SearchResult[]>;
    },
    onSuccess: (data) => {
      setSearchResults(data);
      setHasSearched(true);
      
      if (data.length === 0) {
        toast({
          title: "No matches found",
          description: "Try a different search term or broaden your filters",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim().length < 3) {
      toast({
        title: "Search term too short",
        description: "Please enter at least 3 characters",
      });
      return;
    }
    
    searchMutation.mutate();
  };
  
  // Handle timestamp click
  const handleTimestampClick = (videoId: number, timestamp: string) => {
    // Format timestamp for YouTube URL
    const timestampInSeconds = timestamp
      .split(":")
      .reduce((acc, time) => 60 * acc + parseInt(time), 0);
    
    // Open YouTube with timestamp
    window.open(
      `https://youtube.com/watch?v=${videoId}&t=${timestampInSeconds}s`,
      "_blank"
    );
  };

  // Filter results by type if needed
  const filteredResults = activeTab === "all"
    ? searchResults
    : searchResults.filter(result => result.content_type === activeTab);
  
  return (
    <div className="flex flex-col space-y-4 w-full">
      {/* Search input */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            type="text"
            placeholder="Search for concepts, topics, or specific content..."
            className="pl-9 bg-zinc-900 border-zinc-800"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button 
          type="submit" 
          disabled={searchMutation.isPending || searchTerm.trim().length < 3}
        >
          {searchMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          Search
        </Button>
      </form>
      
      {/* Filters */}
      {hasSearched && searchResults.length > 0 && (
        <div className="flex justify-between items-center">
          <Tabs 
            defaultValue="all" 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="note">Notes</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Select defaultValue="relevance">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Sort by relevance</SelectItem>
              <SelectItem value="timestamp">Sort by timestamp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* Search results */}
      {searchMutation.isPending ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : hasSearched ? (
        filteredResults.length > 0 ? (
          <div className="space-y-4 pt-2">
            {filteredResults.map((result) => (
              <SearchResultItem
                key={result.id}
                result={result}
                searchTerm={searchTerm}
                onTimestampClick={handleTimestampClick}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center p-4 bg-zinc-900 rounded-full mb-4">
              <Search className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-xl font-medium mb-2">No results found</h3>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              No matches found for "{searchTerm}". Try using different keywords or 
              check if all filters are appropriate.
            </p>
          </div>
        )
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>Enter a search term to find relevant content</p>
        </div>
      )}
    </div>
  );
}