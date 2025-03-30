import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, SlidersHorizontal, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuthPrompt } from '@/hooks/use-auth-prompt';
import { apiRequest } from '@/lib/api';
import { 
  hasAnonymousSession,
  getOrCreateAnonymousSessionId
} from '@/lib/anonymous-session';
import { AuthPromptDialog } from '@/components/auth/auth-prompt-dialog';

// Define the search result type
interface SearchResult {
  id: number;
  video_id: number;
  content: string;
  content_type: 'transcript' | 'summary' | 'note' | 'conversation';
  similarity: number;
  metadata: {
    timestamp?: string;
    title?: string;
    channel?: string;
    similarity: number;
  };
}

// Video info to display with search results
interface VideoInfo {
  id: number;
  title: string;
  channel: string;
  thumbnail: string;
  youtube_id: string;
}

interface SearchResponse {
  results: SearchResult[];
}

export default function ExplorerPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<{
    contentTypes: ('transcript' | 'summary' | 'note' | 'conversation')[];
  }>({
    contentTypes: ['transcript', 'summary', 'note', 'conversation'],
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [videoInfoMap, setVideoInfoMap] = useState<Record<number, VideoInfo>>({});
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [desktopFiltersOpen, setDesktopFiltersOpen] = useState(false);
  
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { showAuthPrompt, closePrompt } = useAuthPrompt();
  
  // Fetch all user's videos to have video info available
  const { data: videos } = useQuery({
    queryKey: ['/api/videos'],
    queryFn: async () => {
      const response: any = await apiRequest('GET', '/api/videos');
      return response.videos || [];
    },
  });
  
  // When videos are loaded, create a map for quick lookups
  useEffect(() => {
    if (videos && videos.length) {
      const videoMap: Record<number, VideoInfo> = {};
      videos.forEach((video: VideoInfo) => {
        videoMap[video.id] = video;
      });
      setVideoInfoMap(videoMap);
    }
  }, [videos]);
  
  const handleSearch = async () => {
    if (searchQuery.trim().length < 3) {
      toast({
        title: "Search query too short",
        description: "Please enter at least 3 characters to search",
        variant: "destructive",
      });
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Ensure anonymous users have a session ID
      if (!hasAnonymousSession()) {
        await getOrCreateAnonymousSessionId();
      }
      
      // Perform semantic search using the dedicated RAG endpoint
      const data = await apiRequest('POST', '/api/search', {
        query: searchQuery,
        filter: {
          content_types: activeFilters.contentTypes // Using snake_case for backend
        },
        limit: 20
      }) as SearchResponse;
      
      console.log("Search response:", data);
      
      // Handle the structured response from the semantic search API
      // The apiRequest function already returns the JSON data, not the Response object
      if (data && 'results' in data && Array.isArray(data.results) && data.results.length > 0) {
        setSearchResults(data.results);
        console.log(`Found ${data.results.length} search results`);
      } else {
        console.log("No results found in response:", data);
        setSearchResults([]);
        toast({
          title: "No results found",
          description: "Try a different search query or adjust your filters",
        });
      }
    } catch (error) {
      console.error('Error performing semantic search:', error);
      toast({
        title: "Search failed",
        description: "There was an error performing your search. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };
  
  const toggleContentTypeFilter = (type: 'transcript' | 'summary' | 'note' | 'conversation') => {
    setActiveFilters(prev => {
      // If the type is already in the array, remove it
      if (prev.contentTypes.includes(type)) {
        // Don't allow removing the last filter
        if (prev.contentTypes.length === 1) {
          return prev;
        }
        return {
          ...prev,
          contentTypes: prev.contentTypes.filter(t => t !== type)
        };
      } 
      // Otherwise add it
      return {
        ...prev,
        contentTypes: [...prev.contentTypes, type]
      };
    });
  };
  
  // Render a search result with context and highlight
  const renderSearchResult = (result: SearchResult) => {
    const video = videoInfoMap[result.video_id];
    
    // Format the content type for display
    const contentTypeDisplay = {
      transcript: 'Transcript',
      summary: 'Summary',
      note: 'Notes',
      conversation: 'Conversation'
    }[result.content_type];
    
    // Get color for content type
    const contentTypeColor = {
      transcript: 'bg-blue-600',
      summary: 'bg-purple-600',
      note: 'bg-green-600',
      conversation: 'bg-orange-600'
    }[result.content_type];
    
    // YouTube video link
    const youtubeLink = video && video.youtube_id 
      ? `https://youtube.com/watch?v=${video.youtube_id}${result.metadata.timestamp ? `&t=${result.metadata.timestamp}` : ''}`
      : '#';
    
    // Attempt to highlight the search query in the result
    const contentWords = result.content.split(' ');
    const queryWords = searchQuery.toLowerCase().split(' ');
    
    // Simple highlighting approach
    const highlightedContent = contentWords.map((word, i) => {
      const lowerWord = word.toLowerCase();
      const isMatch = queryWords.some(qw => lowerWord.includes(qw));
      return isMatch 
        ? <span key={i} className="bg-yellow-500/20 text-yellow-200 px-0.5 rounded">{word} </span>
        : <span key={i}>{word} </span>;
    });
    
    return (
      <Card key={result.id} className="mb-4 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Video thumbnail if available */}
            {video && video.thumbnail && (
              <div className="w-full sm:w-40 h-24 flex-shrink-0">
                <a href={youtubeLink} target="_blank" rel="noopener noreferrer">
                  <img 
                    src={video.thumbnail} 
                    alt={video.title || 'Video thumbnail'} 
                    className="w-full h-full object-cover rounded"
                  />
                </a>
              </div>
            )}
            
            <div className="flex-grow">
              {/* Content type badge */}
              <div className="flex items-center gap-2 mb-2">
                <Badge className={`${contentTypeColor} hover:${contentTypeColor}`}>
                  {contentTypeDisplay}
                </Badge>
                
                {/* Similarity score */}
                <Badge variant="outline">
                  {Math.round(result.similarity * 100)}% match
                </Badge>
                
                {/* Timestamp if available */}
                {result.metadata.timestamp && (
                  <Badge variant="outline">
                    {result.metadata.timestamp}
                  </Badge>
                )}
              </div>
              
              {/* Video title if available */}
              {video && video.title && (
                <h3 className="text-md font-medium mb-2">
                  <a href={`/video/${video.id}`} className="hover:underline">
                    {video.title}
                  </a>
                </h3>
              )}
              
              {/* Content with highlighting */}
              <div className="text-sm text-gray-300 mb-3">
                {highlightedContent}
              </div>
              
              {/* Footer with video channel and links */}
              <div className="flex justify-between items-center text-xs text-gray-400">
                <div>
                  {video && video.channel && (
                    <span>{video.channel}</span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <a 
                    href={`/video/${result.video_id}`} 
                    className="text-primary hover:underline"
                  >
                    View in App
                  </a>
                  
                  {video && video.youtube_id && (
                    <a 
                      href={youtubeLink}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Watch on YouTube
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  // Filter components with enhanced visual styling
  const filtersContent = (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-3 text-gray-200">Content Types</h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-zinc-800/70 transition-colors">
            <Checkbox 
              id="filter-transcript" 
              checked={activeFilters.contentTypes.includes('transcript')}
              onCheckedChange={() => toggleContentTypeFilter('transcript')}
              className="border-blue-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
            <div className="flex flex-col">
              <Label htmlFor="filter-transcript" className="font-medium">Transcripts</Label>
              <span className="text-xs text-gray-400">Search in video transcriptions</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-zinc-800/70 transition-colors">
            <Checkbox 
              id="filter-summary" 
              checked={activeFilters.contentTypes.includes('summary')}
              onCheckedChange={() => toggleContentTypeFilter('summary')}
              className="border-purple-500 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
            />
            <div className="flex flex-col">
              <Label htmlFor="filter-summary" className="font-medium">Summaries</Label>
              <span className="text-xs text-gray-400">Search in AI-generated summaries</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-zinc-800/70 transition-colors">
            <Checkbox 
              id="filter-notes" 
              checked={activeFilters.contentTypes.includes('note')}
              onCheckedChange={() => toggleContentTypeFilter('note')}
              className="border-green-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
            />
            <div className="flex flex-col">
              <Label htmlFor="filter-notes" className="font-medium">Notes</Label>
              <span className="text-xs text-gray-400">Search in your personal notes</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-zinc-800/70 transition-colors">
            <Checkbox 
              id="filter-conversation" 
              checked={activeFilters.contentTypes.includes('conversation')}
              onCheckedChange={() => toggleContentTypeFilter('conversation')}
              className="border-orange-500 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
            />
            <div className="flex flex-col">
              <Label htmlFor="filter-conversation" className="font-medium">Conversations</Label>
              <span className="text-xs text-gray-400">Search in Q&A conversations</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button className="w-full" size="sm" variant="secondary" onClick={handleSearch}>
          Apply Filters
        </Button>
      </div>
    </div>
  );
  
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-grow">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Content Explorer</h1>
            <p className="text-muted-foreground">
              Search through all your videos' transcripts, summaries, notes, and conversations
            </p>
          </div>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-8 px-4">
            <div className="flex gap-2">
              <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Search for specific content across all your videos..."
                  className="pl-9 bg-zinc-900 border-zinc-800"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyPress}
                />
              </div>
              
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  'Search'
                )}
              </Button>
              
              <Button
                variant="outline" 
                size="icon"
                onClick={() => isMobile ? setMobileFiltersOpen(true) : setDesktopFiltersOpen(!desktopFiltersOpen)}
                className="relative"
                title="Toggle filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilters.contentTypes.length < 4 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-xs w-4 h-4 rounded-full flex items-center justify-center">
                    {activeFilters.contentTypes.length}
                  </span>
                )}
              </Button>
              
              {isMobile && (
                <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                  <SheetContent className="bg-zinc-950 border-zinc-800">
                    <SheetHeader>
                      <SheetTitle>Search Filters</SheetTitle>
                      <SheetDescription>
                        Customize what content types to include in your search
                      </SheetDescription>
                    </SheetHeader>
                    
                    <div className="py-4">
                      {filtersContent}
                    </div>
                    
                    <SheetFooter>
                      <SheetClose asChild>
                        <Button onClick={handleSearch}>Apply Filters & Search</Button>
                      </SheetClose>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>
              )}
            </div>
            
            {/* Active filters display */}
            {activeFilters.contentTypes.length < 4 && (
              <div className="flex mt-2 gap-2 flex-wrap">
                <div className="text-sm text-gray-400">Searching in:</div>
                {activeFilters.contentTypes.map(type => {
                  // Get color for content type badge
                  const badgeColor = {
                    transcript: 'bg-blue-600/20 text-blue-300 border-blue-600/30',
                    summary: 'bg-purple-600/20 text-purple-300 border-purple-600/30',
                    note: 'bg-green-600/20 text-green-300 border-green-600/30',
                    conversation: 'bg-orange-600/20 text-orange-300 border-orange-600/30'
                  }[type];
                  
                  return (
                    <Badge 
                      key={type} 
                      variant="outline" 
                      className={`flex items-center gap-1 ${badgeColor}`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => toggleContentTypeFilter(type)}
                      />
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Main Content Area with filters sidebar */}
          <div className="flex flex-col md:flex-row gap-6 px-4">
            {/* Filters sidebar (desktop) with animation */}
            <div 
              className={`md:w-64 flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
                !isMobile && desktopFiltersOpen ? 'md:max-w-64 md:opacity-100 md:visible' : 'md:max-w-0 md:opacity-0 md:invisible md:h-0'
              }`}
            >
              <div className="sticky top-4 bg-zinc-900/90 backdrop-blur-sm p-4 rounded-lg border border-zinc-700 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium">Search Filters</h2>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 hover:bg-zinc-800" 
                    onClick={() => setDesktopFiltersOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {filtersContent}
              </div>
            </div>
            
            {/* Results area */}
            <div className="flex-grow">
              {/* Loading state */}
              {isSearching && (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2">Searching across your content...</span>
                </div>
              )}
              
              {/* Empty state */}
              {!isSearching && searchResults.length === 0 && searchQuery.length > 0 && (
                <div className="text-center py-10">
                  <div className="inline-flex items-center justify-center p-4 bg-zinc-900 rounded-full mb-4">
                    <Search className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">No results found</h3>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">
                    Try adjusting your search term or filters to find what you're looking for.
                  </p>
                </div>
              )}
              
              {/* Initial state with no search */}
              {!isSearching && searchQuery.length === 0 && (
                <div className="text-center py-10">
                  <div className="inline-flex items-center justify-center p-4 bg-zinc-900 rounded-full mb-4">
                    <Search className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Enter a search term</h3>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">
                    Search across all your video transcripts, summaries, notes, and conversations to find specific content.
                  </p>
                </div>
              )}
              
              {/* Results */}
              {!isSearching && searchResults.length > 0 && (
                <div>
                  <div className="mb-4">
                    <h2 className="text-xl font-medium">
                      {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} for "{searchQuery}"
                    </h2>
                  </div>
                  
                  <div className="space-y-4">
                    {searchResults.map(renderSearchResult)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
      
      {/* Auth Prompt Dialog */}
      <AuthPromptDialog
        isOpen={showAuthPrompt}
        onClose={closePrompt}
        promptType="access_library"
        onContinueAsGuest={closePrompt}
      />
    </div>
  );
}