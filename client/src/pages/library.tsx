import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoCard } from "@/components/library/video-card";
import { VideoListItem } from "@/components/library/video-list-item";
import { FilterSidebar } from "@/components/library/filter-sidebar";
import { CreateCollectionDialog } from "@/components/library/create-collection-dialog";
import { Video, Category, Collection } from "@/types";
import { SearchX, Grid, List, Filter, Plus, Search, Trash, FolderPlus } from "lucide-react";

export default function Library() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
  const [selectedCollection, setSelectedCollection] = useState<number | undefined>(undefined);
  const [selectedRating, setSelectedRating] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"date" | "title" | "rating">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showSidebarOnMobile, setShowSidebarOnMobile] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [showCollectionDialog, setShowCollectionDialog] = useState(false);

  // Get videos with filters applied
  const videosQuery = useQuery({
    queryKey: ["/api/videos", searchQuery, selectedCategory, selectedCollection, selectedRating, sortBy, sortOrder, showFavoritesOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      if (searchQuery) params.append("query", searchQuery);
      if (selectedCategory) params.append("category_id", selectedCategory.toString());
      if (selectedCollection) params.append("collection_id", selectedCollection.toString());
      if (selectedRating) params.append("rating_min", selectedRating.toString());
      
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);
      
      if (showFavoritesOnly) params.append("is_favorite", "true");
      
      const response = await fetch(`/api/videos?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch videos");
      return response.json();
    }
  });

  // Get categories
  const categoriesQuery = useQuery({
    queryKey: ["/api/categories"],
  });

  // Get collections
  const collectionsQuery = useQuery({
    queryKey: ["/api/collections"],
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The query is already updated via the input, so we just need to refresh
    videosQuery.refetch();
  };

  const toggleVideoSelection = (videoId: number) => {
    setSelectedVideos(prev => {
      if (prev.includes(videoId)) {
        return prev.filter(id => id !== videoId);
      } else {
        return [...prev, videoId];
      }
    });
  };

  const handleSelectAll = () => {
    if (!videosQuery.data) return;
    
    if (selectedVideos.length === videosQuery.data.length) {
      // Deselect all
      setSelectedVideos([]);
    } else {
      // Select all
      setSelectedVideos(videosQuery.data.map((video: Video) => video.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVideos.length === 0 || !confirm(`Delete ${selectedVideos.length} selected videos?`)) return;
    
    // Implement bulk delete
    // This will be a series of API calls to delete each video
    try {
      await Promise.all(selectedVideos.map(id => 
        fetch(`/api/videos/${id}`, { method: 'DELETE' })
      ));
      
      // Refresh video list
      videosQuery.refetch();
      
      // Clear selection
      setSelectedVideos([]);
    } catch (error) {
      console.error("Error deleting videos:", error);
      alert("Failed to delete videos");
    }
  };

  const handleBulkAddToCollection = (collectionId: number) => {
    if (selectedVideos.length === 0) return;
    
    // Implement bulk add to collection
    fetch(`/api/collections/${collectionId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_ids: selectedVideos })
    })
      .then(() => {
        // Refresh collection contents
        collectionsQuery.refetch();
        
        // Clear selection
        setSelectedVideos([]);
      })
      .catch(error => {
        console.error("Error adding videos to collection:", error);
        alert("Failed to add videos to collection");
      });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-grow py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Video Library</h1>
            
            <div className="flex items-center space-x-2">
              {/* View Toggle */}
              <div className="bg-zinc-800 rounded-md p-1">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-md"
                >
                  <Grid className="h-4 w-4 mr-1" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-md"
                >
                  <List className="h-4 w-4 mr-1" />
                  List
                </Button>
              </div>
              
              {/* Filter button (mobile only) */}
              <Button
                variant="outline"
                className="md:hidden"
                onClick={() => setShowSidebarOnMobile(!showSidebarOnMobile)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filter
              </Button>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-6">
            {/* Filter Sidebar */}
            <FilterSidebar
              categories={categoriesQuery.data || []}
              collections={collectionsQuery.data || []}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              selectedCollection={selectedCollection}
              setSelectedCollection={setSelectedCollection}
              selectedRating={selectedRating}
              setSelectedRating={setSelectedRating}
              showFavoritesOnly={showFavoritesOnly}
              setShowFavoritesOnly={setShowFavoritesOnly}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              isVisible={showSidebarOnMobile}
              onClose={() => setShowSidebarOnMobile(false)}
              onCreateCollection={() => setShowCollectionDialog(true)}
            />
            
            {/* Main Content */}
            <div className="flex-1">
              {/* Search Bar */}
              <form onSubmit={handleSearch} className="mb-6">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      type="search"
                      placeholder="Search videos..."
                      className="pl-10 bg-zinc-800 border-zinc-700"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Button type="submit">Search</Button>
                </div>
              </form>
              
              {/* Bulk Actions (visible when videos are selected) */}
              {selectedVideos.length > 0 && (
                <div className="mb-4 p-3 bg-zinc-800 rounded-md flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium mr-2">
                    {selectedVideos.length} videos selected
                  </span>
                  
                  <div className="flex-1 flex flex-wrap gap-2">
                    {/* Add to Collection dropdown */}
                    <Select onValueChange={(value) => handleBulkAddToCollection(parseInt(value))}>
                      <SelectTrigger className="w-auto bg-zinc-700 border-zinc-600">
                        <div className="flex items-center">
                          <FolderPlus className="h-4 w-4 mr-1" />
                          <span>Add to Collection</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {(collectionsQuery.data || []).map((collection: Collection) => (
                          <SelectItem 
                            key={collection.id} 
                            value={collection.id.toString()}
                          >
                            {collection.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="new">
                          <div className="flex items-center">
                            <Plus className="h-4 w-4 mr-1" />
                            <span>Create New Collection</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Delete Selected */}
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleBulkDelete}
                    >
                      <Trash className="h-4 w-4 mr-1" />
                      Delete Selected
                    </Button>
                  </div>
                  
                  {/* Cancel Selection */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedVideos([])}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              
              {/* Video List/Grid */}
              {videosQuery.isLoading ? (
                // Loading state
                <div className={`grid ${viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : ""} gap-6`}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-zinc-800 rounded-lg overflow-hidden">
                      <Skeleton className="h-40 w-full" />
                      <div className="p-4 space-y-2">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : videosQuery.data?.length > 0 ? (
                <>
                  {/* Select All checkbox */}
                  <div className="mb-4 flex items-center">
                    <Checkbox 
                      id="selectAll" 
                      checked={selectedVideos.length > 0 && selectedVideos.length === videosQuery.data.length}
                      onCheckedChange={handleSelectAll} 
                    />
                    <label htmlFor="selectAll" className="ml-2 text-sm">
                      {selectedVideos.length === videosQuery.data.length 
                        ? "Deselect All" 
                        : "Select All"}
                    </label>
                  </div>
                  
                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {videosQuery.data.map((video: Video) => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          isSelected={selectedVideos.includes(video.id)}
                          onToggleSelect={() => toggleVideoSelection(video.id)}
                          categories={categoriesQuery.data || []}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {videosQuery.data.map((video: Video) => (
                        <VideoListItem
                          key={video.id}
                          video={video}
                          isSelected={selectedVideos.includes(video.id)}
                          onToggleSelect={() => toggleVideoSelection(video.id)}
                          categories={categoriesQuery.data || []}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                // Empty state
                <div className="text-center py-12 bg-zinc-800 rounded-lg">
                  <SearchX className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-xl font-medium mb-2">No videos found</h3>
                  <p className="text-gray-400 max-w-md mx-auto mb-6">
                    Try changing your search or filter settings to find what you're looking for.
                  </p>
                  <Button onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory(undefined);
                    setSelectedCollection(undefined);
                    setSelectedRating(undefined);
                    setShowFavoritesOnly(false);
                    setSortBy("date");
                    setSortOrder("desc");
                  }}>
                    Clear All Filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
      
      {/* Dialogs */}
      <CreateCollectionDialog 
        isOpen={showCollectionDialog}
        onClose={() => setShowCollectionDialog(false)}
        onSuccess={() => {
          setShowCollectionDialog(false);
          collectionsQuery.refetch();
        }}
      />
    </div>
  );
}