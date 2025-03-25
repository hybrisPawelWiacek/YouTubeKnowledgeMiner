import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { VideoCard } from "@/components/library/video-card";
import { VideoListItem } from "@/components/library/video-list-item";
import { FilterSidebar } from "@/components/library/filter-sidebar";
import { CreateCollectionDialog } from "@/components/library/create-collection-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSupabase } from "@/hooks/use-supabase";
import { useAuthPrompt } from "@/hooks/use-auth-prompt";
import { AuthPromptDialog } from "@/components/auth/auth-prompt-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Video, Category, Collection } from "@/types";
import {
  Filter,
  LayoutGrid,
  List,
  Search,
  Trash2,
  Heart,
  FolderPlus,
  Loader2,
  Plus,
} from "lucide-react";

export default function Library() {
  // State
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [isGridView, setIsGridView] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);
  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  
  // Filters
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
  const [selectedCollection, setSelectedCollection] = useState<number | undefined>(undefined);
  const [selectedRating, setSelectedRating] = useState<number | undefined>(undefined);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "title" | "rating">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Hooks
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { user } = useSupabase();
  const { promptAuth } = useAuthPrompt();
  const [, navigate] = useLocation();
  
  // Queries
  const videosQuery = useQuery<Video[]>({
    queryKey: ["/api/videos", selectedCategory, selectedCollection, selectedRating, showFavoritesOnly, sortBy, sortOrder, searchQuery],
    queryFn: async () => {
      let url = "/api/videos?";
      
      // Add search query if present
      if (searchQuery) {
        url += `query=${encodeURIComponent(searchQuery)}&`;
      }
      
      // Add filters
      if (selectedCategory) {
        url += `category_id=${selectedCategory}&`;
      }
      
      if (selectedCollection) {
        url += `collection_id=${selectedCollection}&`;
      }
      
      if (selectedRating) {
        url += `rating_min=${selectedRating}&`;
      }
      
      if (showFavoritesOnly) {
        url += "is_favorite=true&";
      }
      
      // Add sorting
      url += `sort_by=${sortBy}&sort_order=${sortOrder}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch videos");
      return response.json();
    },
  });
  
  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  
  const collectionsQuery = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });
  
  // Mutations
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await apiRequest("DELETE", "/api/videos/bulk", { ids });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Videos deleted",
        description: `${selectedVideos.length} videos have been deleted from your library.`,
      });
      setSelectedVideos([]);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "There was an error deleting the videos. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const bulkToggleFavoriteMutation = useMutation({
    mutationFn: async ({ ids, isFavorite }: { ids: number[], isFavorite: boolean }) => {
      const response = await apiRequest("PATCH", "/api/videos/bulk", { 
        ids, 
        data: { is_favorite: isFavorite } 
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.isFavorite ? "Added to favorites" : "Removed from favorites",
        description: `${selectedVideos.length} videos have been ${variables.isFavorite ? "added to" : "removed from"} your favorites.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "There was an error updating the videos. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const addToCollectionMutation = useMutation({
    mutationFn: async ({ videoIds, collectionId }: { videoIds: number[], collectionId: number }) => {
      const response = await apiRequest("POST", `/api/collections/${collectionId}/videos/bulk`, { 
        video_ids: videoIds
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      const collection = collectionsQuery.data?.find((c: Collection) => c.id === variables.collectionId);
      toast({
        title: "Added to collection",
        description: `${selectedVideos.length} videos have been added to "${collection?.name}" collection.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "There was an error adding videos to the collection. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Effect to close sidebar on mobile when navigating away
  useEffect(() => {
    if (isMobile) {
      setIsFilterSidebarOpen(false);
    }
  }, [isMobile]);
  
  // Check auth status on component mount
  useEffect(() => {
    if (!user) {
      const shouldPrompt = promptAuth('access_library');
      setShowAuthPrompt(shouldPrompt);
    }
  }, [user, promptAuth]);
  
  // Toggle select all videos
  const toggleSelectAll = () => {
    if (selectedVideos.length === videosQuery.data?.length) {
      setSelectedVideos([]);
    } else {
      setSelectedVideos(videosQuery.data.map((video: Video) => video.id));
    }
  };
  
  // Toggle selection of a single video
  const toggleSelectVideo = (videoId: number) => {
    if (selectedVideos.includes(videoId)) {
      setSelectedVideos(selectedVideos.filter(id => id !== videoId));
    } else {
      setSelectedVideos([...selectedVideos, videoId]);
    }
  };
  
  // Handle bulk actions
  const handleDeleteSelected = () => {
    if (selectedVideos.length === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedVideos.length} videos? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(selectedVideos);
    }
  };
  
  const handleToggleFavorite = (isFavorite: boolean) => {
    if (selectedVideos.length === 0) return;
    bulkToggleFavoriteMutation.mutate({ ids: selectedVideos, isFavorite });
  };
  
  const handleAddToCollection = (collectionId: number) => {
    if (selectedVideos.length === 0) return;
    addToCollectionMutation.mutate({ videoIds: selectedVideos, collectionId });
  };
  
  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(undefined);
    setSelectedCollection(undefined);
    setSelectedRating(undefined);
    setShowFavoritesOnly(false);
    setSortBy("date");
    setSortOrder("desc");
  };
  
  // Render loading skeleton
  const renderSkeletons = () => {
    return Array.from({ length: 6 }).map((_, index) => (
      <div key={index} className="bg-zinc-900 rounded-lg overflow-hidden">
        <div className="aspect-video bg-zinc-800">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    ));
  };
  
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
            <div>
              <h1 className="text-3xl font-bold">Video Library</h1>
              <p className="text-gray-400 mt-1">
                Manage and organize your saved YouTube videos
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFilterSidebarOpen(true)}
                className="flex items-center gap-1"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateCollectionOpen(true)}
                className="flex items-center gap-1"
              >
                <FolderPlus className="h-4 w-4" />
                <span className="hidden sm:inline">New Collection</span>
              </Button>
              
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant={isGridView ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setIsGridView(true)}
                  className="rounded-none px-2"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={!isGridView ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setIsGridView(false)}
                  className="rounded-none px-2"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          {/* Search and Selection Bar */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="text"
                placeholder="Search videos by title, channel, or content..."
                className="pl-9 bg-zinc-900 border-zinc-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* Active Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {(selectedCategory || selectedCollection || selectedRating || showFavoritesOnly || searchQuery || sortBy !== "date" || sortOrder !== "desc") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-9 bg-red-900/20 text-red-400 border-red-900 hover:bg-red-900/30 hover:text-red-300"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
          
          {/* Bulk Actions (when videos are selected) */}
          {selectedVideos.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex items-center mr-2">
                <span className="text-sm font-medium">
                  {selectedVideos.length} {selectedVideos.length === 1 ? "video" : "videos"} selected
                </span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleFavorite(true)}
                  className="flex items-center gap-1"
                >
                  <Heart className="h-4 w-4" />
                  <span>Add to Favorites</span>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleFavorite(false)}
                  className="flex items-center gap-1"
                >
                  <Heart className="h-4 w-4 fill-current" />
                  <span>Remove from Favorites</span>
                </Button>
                
                {/* Add to Collection Dropdown */}
                <div className="relative group">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                  >
                    <FolderPlus className="h-4 w-4" />
                    <span>Add to Collection</span>
                  </Button>
                  
                  {/* Dropdown Menu */}
                  <div className="absolute left-0 mt-1 w-48 rounded-md shadow-lg bg-zinc-900 border border-zinc-800 hidden group-hover:block z-10">
                    <div className="py-1">
                      {collectionsQuery.data?.map((collection: Collection) => (
                        <button
                          key={collection.id}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-zinc-800"
                          onClick={() => handleAddToCollection(collection.id)}
                        >
                          {collection.name}
                        </button>
                      ))}
                      
                      {(!collectionsQuery.data || collectionsQuery.data.length === 0) && (
                        <div className="px-4 py-2 text-sm text-gray-500">
                          No collections available
                        </div>
                      )}
                      
                      <div className="border-t border-zinc-800 mt-1 pt-1">
                        <button
                          className="flex items-center gap-1 w-full text-left px-4 py-2 text-sm text-primary hover:bg-zinc-800"
                          onClick={() => setIsCreateCollectionOpen(true)}
                        >
                          <Plus className="h-3 w-3" />
                          Create New Collection
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedVideos([])}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}
          
          {/* Main Content */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar for filters (desktop) */}
            <div className="hidden lg:block">
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
                isVisible={true}
                onClose={() => {}}
                onCreateCollection={() => setIsCreateCollectionOpen(true)}
              />
            </div>
            
            {/* Sidebar for filters (mobile) */}
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
              isVisible={isFilterSidebarOpen}
              onClose={() => setIsFilterSidebarOpen(false)}
              onCreateCollection={() => setIsCreateCollectionOpen(true)}
            />
            
            {/* Main Content Area */}
            <div className="flex-grow">
              {/* Loading State */}
              {videosQuery.isLoading && (
                <div className={isGridView ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
                  {renderSkeletons()}
                </div>
              )}
              
              {/* Empty State */}
              {!videosQuery.isLoading && (!videosQuery.data || videosQuery.data.length === 0) && (
                <div className="text-center py-10">
                  <div className="inline-flex items-center justify-center p-4 bg-zinc-900 rounded-full mb-4">
                    <Search className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">No videos found</h3>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">
                    {searchQuery || selectedCategory || selectedCollection || selectedRating || showFavoritesOnly
                      ? "No videos match your current filters. Try adjusting your search criteria."
                      : "Your video library is currently empty. Process YouTube videos to add them to your library."}
                  </p>
                  
                  {(searchQuery || selectedCategory || selectedCollection || selectedRating || showFavoritesOnly) && (
                    <Button onClick={handleClearFilters}>
                      Clear All Filters
                    </Button>
                  )}
                </div>
              )}
              
              {/* Grid View */}
              {!videosQuery.isLoading && videosQuery.data && videosQuery.data.length > 0 && isGridView && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videosQuery.data.map((video: Video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      isSelected={selectedVideos.includes(video.id)}
                      onToggleSelect={() => toggleSelectVideo(video.id)}
                      categories={categoriesQuery.data || []}
                    />
                  ))}
                </div>
              )}
              
              {/* List View */}
              {!videosQuery.isLoading && videosQuery.data && videosQuery.data.length > 0 && !isGridView && (
                <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                  <div className="flex items-center p-3 border-b border-zinc-800 bg-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedVideos.length === videosQuery.data.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-zinc-600"
                      />
                      <span className="text-sm font-medium">
                        {selectedVideos.length > 0
                          ? `${selectedVideos.length} selected`
                          : "Select All"}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    {videosQuery.data.map((video: Video) => (
                      <VideoListItem
                        key={video.id}
                        video={video}
                        isSelected={selectedVideos.includes(video.id)}
                        onToggleSelect={() => toggleSelectVideo(video.id)}
                        categories={categoriesQuery.data || []}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
      
      {/* Create Collection Dialog */}
      <CreateCollectionDialog
        isOpen={isCreateCollectionOpen}
        onClose={() => setIsCreateCollectionOpen(false)}
        onSuccess={() => {
          if (selectedVideos.length > 0) {
            // Get the latest collection ID and add selected videos to it
            queryClient.invalidateQueries({ queryKey: ["/api/collections"] }).then(() => {
              const collections = collectionsQuery.data || [];
              if (collections.length > 0) {
                const latestCollection = collections[collections.length - 1];
                handleAddToCollection(latestCollection.id);
              }
            });
          }
        }}
      />
      
      {/* Auth Prompt Dialog */}
      <AuthPromptDialog
        isOpen={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        promptType="access_library"
        onContinueAsGuest={() => setShowAuthPrompt(false)}
      />
    </div>
  );
}