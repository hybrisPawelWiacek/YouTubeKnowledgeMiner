import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { VideoCard } from "@/components/library/video-card";
import { VideoListItem } from "@/components/library/video-list-item";
import { FilterSidebar } from "@/components/library/filter-sidebar";
import { CreateCollectionDialog } from "@/components/library/create-collection-dialog";
import { BatchExportButton } from "@/components/export/batch-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSupabase } from "@/hooks/use-supabase";
import { useAuthPrompt } from "@/hooks/use-auth-prompt";
import { AuthPromptDialog } from "@/components/auth/auth-prompt-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getOrCreateAnonymousSessionId, getAnonymousSessionHeaders, hasReachedAnonymousLimit } from "@/lib/anonymous-session";
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
  // State to control both desktop and mobile filter visibility
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);
  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showedPrompt, setShowedPrompt] = useState(false); // Track if prompt has been shown
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
  const { user, getLocalData, setLocalData, hasReachedAnonymousLimit } = useSupabase();
  const { promptAuth, incrementEngagement } = useAuthPrompt();
  const [, navigate] = useLocation();
  const [libraryInteractions, setLibraryInteractions] = useState(0);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Track scroll position to maintain when returning to library view
  const [scrollPosition, setScrollPosition] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Save scroll position when leaving the page
  useEffect(() => {
    return () => {
      if (listRef.current) {
        setScrollPosition(listRef.current.scrollTop);
      }
    };
  }, []);

  // Restore scroll position when returning to the page
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  // Queries
  const videosQuery = useQuery<{
    videos: Video[];
    totalCount: number;
    hasMore: boolean;
    nextCursor?: number;
  }>({
    queryKey: ["/api/videos", selectedCategory, selectedCollection, selectedRating, showFavoritesOnly, sortBy, sortOrder, searchQuery, page, cursor],
    queryFn: async () => {
      setIsLoadingMore(page > 1 || cursor !== undefined);
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

      // Add pagination
      url += `&page=${page}&limit=20`;

      // Add cursor if available (preferred over offset pagination)
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      console.log('Library - Fetching videos for user:', user?.id, 'type:', typeof user?.id);
      
      // Add anonymous session header for anonymous users
      let headers: HeadersInit = {};
      if (!user) {
        try {
          // Log all cookies first to see what's happening
          console.log('Library - All cookies before getAnonymousSessionHeaders():', document.cookie);
          
          // Use the helper function that properly handles the async nature of session IDs
          headers = await getAnonymousSessionHeaders();
          
          // Use a type assertion to access the header value
          const sessionId = (headers as Record<string, string>)['x-anonymous-session'];
          console.log('Library - Adding anonymous session header:', sessionId);
          
          // Verify that the same session ID is being consistently used
          if (sessionId) {
            // Make a direct call to check the video count for this session
            const response = await fetch('/api/anonymous/videos/count', {
              headers: { 'x-anonymous-session': sessionId }
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log('Library - Check video count for this session:', data);
            }
          }
        } catch (error) {
          console.error('Library - Error getting anonymous session headers:', error);
        }
      }
      
      // Use our API request function which handles all the auth header logic for us
      const response = await apiRequest("GET", url, undefined, headers);
      
      if (!response.ok) throw new Error("Failed to fetch videos");
      return response.json();
    }
  });

  // Handle query result data for pagination
  useEffect(() => {
    if (videosQuery.data) {
      // When filters change, we're on page 1 and replace videos
      if (page === 1 && cursor === undefined) {
        setAllVideos(videosQuery.data.videos);
      } else {
        // For pagination, append new videos to existing ones
        setAllVideos(prev => [...prev, ...videosQuery.data.videos]);
      }
      setHasMore(videosQuery.data.hasMore);
      setTotalCount(videosQuery.data.totalCount);
      setCursor(videosQuery.data.nextCursor);
      setIsLoadingMore(false);
    }
  }, [videosQuery.data, page, cursor]);

  // Setup IntersectionObserver for infinite scroll
  useEffect(() => {
    // Only set up observer if we have more items to load
    if (!hasMore || isLoadingMore || videosQuery.isLoading) return;

    // Disconnect any existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create a new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // If the load more sentinel is visible and we have more data to load
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          // Load more videos by incrementing the page
          setPage((prevPage) => prevPage + 1);
        }
      },
      {
        // Start loading when user is 200px away from the end
        rootMargin: "0px 0px 200px 0px",
        threshold: 0.1,
      }
    );

    // Observe the load more sentinel element
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    // Clean up observer on unmount
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, videosQuery.isLoading]);

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const collectionsQuery = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  // Mutations
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      // Add anonymous session header for anonymous users
      let headers: HeadersInit = {};
      if (!user) {
        // Use the helper function that properly handles the async nature of session IDs
        headers = await getAnonymousSessionHeaders();
        // Use a type assertion to access the header value
        console.log('[bulkDeleteMutation] Adding anonymous session header:', (headers as Record<string, string>)['x-anonymous-session']);
      }
      
      const response = await apiRequest("DELETE", "/api/videos/bulk", { ids }, headers);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Videos deleted",
        description: `${selectedVideos.length} videos have been deleted from your library.`,
      });
      setSelectedVideos([]);
      // Invalidate both the videos query and the anonymous video count query
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/anonymous/videos/count"] });
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
      // Add anonymous session header for anonymous users
      let headers: HeadersInit = {};
      if (!user) {
        // Use the helper function that properly handles the async nature of session IDs
        headers = await getAnonymousSessionHeaders();
        // Use a type assertion to access the header value
        console.log('[bulkToggleFavoriteMutation] Adding anonymous session header:', (headers as Record<string, string>)['x-anonymous-session']);
      }
      
      const response = await apiRequest("PATCH", "/api/videos/bulk", { 
        ids, 
        data: { is_favorite: isFavorite } 
      }, headers);
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
      // Add anonymous session header for anonymous users
      let headers: HeadersInit = {};
      if (!user) {
        // Use the helper function that properly handles the async nature of session IDs
        headers = await getAnonymousSessionHeaders();
        // Use a type assertion to access the header value
        console.log('[addToCollectionMutation] Adding anonymous session header:', (headers as Record<string, string>)['x-anonymous-session']);
      }
      
      const response = await apiRequest("POST", `/api/collections/${collectionId}/videos/bulk`, { 
        video_ids: videoIds
      }, headers);
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

  // Track engagement levels and show auth prompt at strategic points
  useEffect(() => {
    // We'll only check on libraryInteractions changes, not on initial mount
    if (!user && libraryInteractions > 0) {
      // Determine whether to show auth prompt based on user engagement
      // Use different thresholds based on prompt history
      const hasSeenPromptBefore = promptAuth('access_library', true);
      const threshold = hasSeenPromptBefore ? 8 : 3;

      // Only show prompt if we've reached the threshold
      if (libraryInteractions >= threshold && !showedPrompt) {
        console.log(`[Library] Checking auth prompt at interactions: ${libraryInteractions}`);
        const shouldPrompt = promptAuth('access_library');
        setShowAuthPrompt(shouldPrompt);
        if (shouldPrompt) {
          setShowedPrompt(true);
        }
      }
    }
  }, [user, promptAuth, libraryInteractions, showedPrompt]);

  // Track significant user engagement with library features
  const trackEngagement = useCallback(() => {
    if (!user) {
      setLibraryInteractions(prev => {
        const newCount = prev + 1;
        console.log(`Library interaction count: ${newCount}`);
        return newCount;
      });
      incrementEngagement();

      // Use progressive threshold - higher for repeated prompts
      const primaryThreshold = 3;
      const secondaryThreshold = 8;

      // If user reaches engagement threshold, consider prompting
      // Different thresholds based on whether they've seen this prompt before
      // Use checkOnly mode to query without triggering the prompt
      const hasSeenPromptBefore = promptAuth('access_library', true);
      const effectiveThreshold = hasSeenPromptBefore ? secondaryThreshold : primaryThreshold;

      if (libraryInteractions >= effectiveThreshold && !showAuthPrompt) {
        console.log(`Engagement threshold reached (${effectiveThreshold}), showing auth prompt`);
        const shouldPrompt = promptAuth('access_library');
        setShowAuthPrompt(shouldPrompt);
      }
    }
  }, [user, libraryInteractions, incrementEngagement, promptAuth, showAuthPrompt]);

  // Toggle select all videos
  const toggleSelectAll = () => {
    // Make sure allVideos is defined and an array
    if (!Array.isArray(allVideos) || allVideos.length === 0) {
      console.warn('[Library] Cannot select all: videos array is not available or empty');
      return;
    }
    
    if (selectedVideos.length === allVideos.length) {
      setSelectedVideos([]);
    } else {
      try {
        // Safely map over videos and extract IDs
        const videoIds = allVideos.map((video: Video) => video.id);
        setSelectedVideos(videoIds);
        
        // Track engagement when user selects all videos
        if (!user) trackEngagement();
      } catch (err) {
        console.error('[Library] Error selecting all videos:', err);
        // Provide user feedback
        toast({
          title: "Operation failed",
          description: "There was a problem selecting videos. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Toggle selection of a single video
  const toggleSelectVideo = (videoId: number) => {
    if (selectedVideos.includes(videoId)) {
      setSelectedVideos(selectedVideos.filter(id => id !== videoId));
    } else {
      setSelectedVideos([...selectedVideos, videoId]);

      // Track engagement when selecting videos 
      if (!user) trackEngagement();
    }
  };

  // Handle bulk actions
  const handleDeleteSelected = () => {
    if (selectedVideos.length === 0) return;
    
    // Open the delete confirmation dialog instead of using browser confirm
    setIsDeleteDialogOpen(true);
  };
  
  // Actual delete action when confirmed through the modal
  const confirmDelete = () => {
    bulkDeleteMutation.mutate(selectedVideos);
  };

  const handleToggleFavorite = (isFavorite: boolean) => {
    if (selectedVideos.length === 0) return;
    bulkToggleFavoriteMutation.mutate({ ids: selectedVideos, isFavorite });

    // Track engagement when adding/removing from favorites
    if (!user) trackEngagement();
  };

  const handleAddToCollection = (collectionId: number) => {
    if (selectedVideos.length === 0) return;
    addToCollectionMutation.mutate({ videoIds: selectedVideos, collectionId });

    // Track engagement when adding to collections
    if (!user) trackEngagement();
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

  // This function isn't needed as we're using the ones from useSupabase hook

  useEffect(() => {
    // For anonymous users
    if (!user) {
      // Check video count - only show prompt if they've reached the limit
      // hasReachedAnonymousLimit is async, so we need to handle it properly
      const checkAnonymousLimit = async () => {
        try {
          // Call the async function and await the result
          const hasReached = await hasReachedAnonymousLimit();
          console.log('[Library] Anonymous limit check:', hasReached);
          
          // Only update state if we're still mounted
          if (hasReached && !showedPrompt) {
            setShowAuthPrompt(true);
            setShowedPrompt(true);
          }
        } catch (error) {
          console.error('[Library] Error checking anonymous limit:', error);
          // Don't set showedPrompt here to avoid hiding errors
        }
      };
      
      // Only execute the check once - not on initial render
      if (libraryInteractions > 0 && !showedPrompt) {
        // Call the function and don't try to use the result directly
        checkAnonymousLimit();
      }
      
      // Load videos from local storage
      try {
        const localData = getLocalData() || {};
        
        // Initialize with empty array to avoid undefined errors
        const videosData = Array.isArray(localData.videos) ? localData.videos : [];
        
        // Only update state if we haven't loaded videos from the query
        if (videosData.length > 0 && (allVideos.length === 0 || page === 1)) {
          console.log('[Library] Loaded videos from local storage:', videosData.length);
          setAllVideos(videosData);
          setTotalCount(videosData.length);
          setHasMore(false);
          setIsLoadingMore(false);
        } else if (allVideos.length === 0) {
          console.log('[Library] No videos found in local storage or format is invalid');
          // Ensure we have an empty array, not undefined
          setAllVideos([]);
        }
      } catch (error) {
        console.error('[Library] Error loading videos from local storage:', error);
        // Initialize with empty array to avoid undefined errors
        setAllVideos([]);
      }
    } else if (user) {
      // Load videos for logged in users
      // Send user ID as a number to API
      const userId = typeof user.id === 'number' ? user.id : Number(user.id);
      // ... existing videosQuery logic ...
    }

    // Load categories
    async function loadCategories() {
      try {
        if (!user) {
          // For anonymous users, no categories are available
          setSelectedCategory(undefined);
          return;
        }
        const response = await apiRequest("GET", '/api/categories');
        if (response.ok) {
          const data = await response.json();
          setSelectedCategory(data);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    }
    loadCategories();

    // Load collections
    async function loadCollections() {
      try {
        if (!user) {
          // For anonymous users, get collections from local storage
          try {
            const localData = getLocalData() || {};
            // Safely access collections property with default empty array
            const collectionsData = Array.isArray(localData.collections) ? localData.collections : [];
            
            console.log('[Library] Local collections loaded:', collectionsData.length);
            
            // Always set to undefined for selection purposes (we use the actual array in UI)
            setSelectedCollection(undefined);
          } catch (error) {
            console.error('[Library] Error loading collections from local storage:', error);
            setSelectedCollection(undefined);
          }
          return;
        }
        const response = await apiRequest("GET", '/api/collections');
        if (response.ok) {
          const data = await response.json();
          setSelectedCollection(data);
        }
      } catch (error) {
        console.error('Failed to load collections:', error);
      }
    }
    loadCollections();

    // Load saved searches
    async function loadSavedSearches() {
      try {
        if (!user) {
          // Anonymous users don't have saved searches
          // We're not changing the search query here
          return;
        }
        const response = await apiRequest("GET", '/api/saved-searches');
        if (response.ok) {
          const data = await response.json();
          setSearchQuery(data);
        }
      } catch (error) {
        console.error('Failed to load saved searches:', error);
      }
    }
    loadSavedSearches();
  }, [user, showedPrompt]);


  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-grow" ref={listRef}>
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
                variant={isFilterSidebarOpen ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setIsFilterSidebarOpen(!isFilterSidebarOpen);
                  trackEngagement();
                }}
                className="flex items-center gap-1"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsCreateCollectionOpen(true);
                  trackEngagement();
                }}
                className="flex items-center gap-1"
              >
                <FolderPlus className="h-4 w-4" />
                <span className="hidden sm:inline">New Collection</span>
              </Button>

              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant={isGridView ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setIsGridView(true);
                    if (!user) trackEngagement();
                  }}
                  className="rounded-none px-2"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={!isGridView ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setIsGridView(false);
                    if (!user) trackEngagement();
                  }}
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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Track engagement when searching
                  if (e.target.value.trim().length > 2 && !user) {
                    trackEngagement();
                  }
                }}
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

                <BatchExportButton
                  videoIds={selectedVideos}
                />

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
            {isFilterSidebarOpen && (
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
            )}

            {/* Sidebar for filters (mobile) - Only show on mobile devices */}
            <div className="lg:hidden">
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
            </div>

            {/* Main Content Area */}
            <div className="flex-grow">
              {/* Loading State */}
              {videosQuery.isLoading && (
                <div className={isGridView ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
                  {renderSkeletons()}
                </div>
              )}

              {/* Empty State */}
              {!videosQuery.isLoading && (!allVideos || allVideos.length === 0) && (
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
              {!videosQuery.isLoading && allVideos && allVideos.length > 0 && isGridView && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allVideos.map((video: Video) => (
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
              {!videosQuery.isLoading && allVideos && allVideos.length > 0 && !isGridView && (
                <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                  <div className="flex items-center p-3 border-b border-zinc-800 bg-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedVideos.length === allVideos.length}
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
                    {allVideos.map((video: Video) => (
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

              {/* Load More / Pagination */}
              {!videosQuery.isLoading && allVideos && allVideos.length > 0 && hasMore && (
                <div className="mt-8 mb-4">
                  {/* Visible load more button for manual loading */}
                  <div className="flex justify-center">
                    <Button
                      onClick={() => {
                        // For manual loading, we increase the page number to fetch more results
                        setPage(prevPage => prevPage + 1);
                      }}
                      disabled={isLoadingMore || videosQuery.isLoading}
                      className="flex items-center gap-2"
                    >
                      {isLoadingMore && !hasMore && <Loader2 className="h-4 w-4 animate-spin" />}
                      Load More Videos
                    </Button>
                  </div>

                  {/* Invisible sentinel element for infinite scroll */}
                  <div 
                    ref={loadMoreRef} 
                    className="h-4 w-full my-4"
                    aria-hidden="true"
                  />
                </div>
              )}

              {/* Loading spinner during infinite scroll - only show when we're loading more but not at the end */}
              {isLoadingMore && hasMore && !videosQuery.isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}

              {/* Summary stats */}
              {allVideos && allVideos.length > 0 && (
                <div className="text-center text-sm text-gray-500 mt-2 mb-4">
                  Showing {allVideos.length} of {totalCount} videos
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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        setIsOpen={setIsDeleteDialogOpen}
        title="Delete Selected Videos"
        description={`Are you sure you want to delete ${selectedVideos.length} ${selectedVideos.length === 1 ? 'video' : 'videos'}? This action cannot be undone.`}
        onConfirm={confirmDelete}
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  );
}