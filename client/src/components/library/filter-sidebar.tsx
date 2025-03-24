import { Category, Collection } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/ui/star-rating";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  SortAsc, 
  SortDesc, 
  X, 
  Filter, 
  Star, 
  Heart, 
  FolderPlus, 
  Clock, 
  AlignLeft,
  CircleEqual,
  PlusCircle
} from "lucide-react";

interface FilterSidebarProps {
  categories: Category[];
  collections: Collection[];
  selectedCategory: number | undefined;
  setSelectedCategory: (category: number | undefined) => void;
  selectedCollection: number | undefined;
  setSelectedCollection: (collection: number | undefined) => void;
  selectedRating: number | undefined;
  setSelectedRating: (rating: number | undefined) => void;
  showFavoritesOnly: boolean;
  setShowFavoritesOnly: (show: boolean) => void;
  sortBy: "date" | "title" | "rating";
  setSortBy: (sortBy: "date" | "title" | "rating") => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (sortOrder: "asc" | "desc") => void;
  isVisible: boolean;
  onClose: () => void;
  onCreateCollection: () => void;
}

export function FilterSidebar({
  categories,
  collections,
  selectedCategory,
  setSelectedCategory,
  selectedCollection,
  setSelectedCollection,
  selectedRating,
  setSelectedRating,
  showFavoritesOnly,
  setShowFavoritesOnly,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  isVisible,
  onClose,
  onCreateCollection
}: FilterSidebarProps) {
  if (!isVisible) return null;
  
  const clearAllFilters = () => {
    setSelectedCategory(undefined);
    setSelectedCollection(undefined);
    setSelectedRating(undefined);
    setShowFavoritesOnly(false);
    setSortBy("date");
    setSortOrder("desc");
  };

  return (
    <div className="fixed inset-0 z-40 lg:static lg:w-80 lg:flex-shrink-0 lg:h-auto">
      {/* Overlay for mobile */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm lg:hidden"
        onClick={onClose}
      />
      
      <div className="fixed inset-y-0 left-0 z-50 w-80 bg-zinc-900 border-r border-zinc-800 lg:static lg:z-0 overflow-hidden flex flex-col h-full lg:h-auto">
        <div className="p-4 flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center">
            <Filter className="h-5 w-5 mr-2 text-gray-400" />
            <h3 className="font-medium">Filters & Sorting</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="lg:hidden">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            {/* Category Filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="category-filter" className="text-sm font-medium flex items-center">
                  <CircleEqual className="h-4 w-4 mr-1 text-gray-400" />
                  Category
                </Label>
                {selectedCategory && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedCategory(undefined)}
                    className="h-5 px-2 text-xs text-gray-400 hover:text-white"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <Select
                value={selectedCategory?.toString() || ""}
                onValueChange={(value) => setSelectedCategory(value ? parseInt(value) : undefined)}
              >
                <SelectTrigger id="category-filter" className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Collection Filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="collection-filter" className="text-sm font-medium flex items-center">
                  <FolderPlus className="h-4 w-4 mr-1 text-gray-400" />
                  Collection
                </Label>
                {selectedCollection && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedCollection(undefined)}
                    className="h-5 px-2 text-xs text-gray-400 hover:text-white"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Select
                  value={selectedCollection?.toString() || ""}
                  onValueChange={(value) => setSelectedCollection(value ? parseInt(value) : undefined)}
                >
                  <SelectTrigger id="collection-filter" className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="All Collections" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="all">All Collections</SelectItem>
                    {collections?.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id.toString()}>
                        {collection.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full flex items-center justify-center gap-1 bg-zinc-800 border-zinc-700"
                  onClick={onCreateCollection}
                >
                  <PlusCircle className="h-4 w-4" />
                  Create Collection
                </Button>
              </div>
            </div>
            
            <Separator className="bg-zinc-800" />
            
            {/* Rating Filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium flex items-center">
                  <Star className="h-4 w-4 mr-1 text-gray-400" />
                  Min Rating
                </Label>
                {selectedRating && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedRating(undefined)}
                    className="h-5 px-2 text-xs text-gray-400 hover:text-white"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <StarRating 
                value={selectedRating || 0} 
                onChange={setSelectedRating} 
                size="sm"
              />
            </div>
            
            {/* Favorites Only */}
            <div>
              <div className="flex items-center justify-between">
                <Label 
                  htmlFor="favorites-only" 
                  className="text-sm font-medium flex items-center cursor-pointer"
                >
                  <Heart className="h-4 w-4 mr-1 text-gray-400" />
                  Show Favorites Only
                </Label>
                <Switch
                  id="favorites-only"
                  checked={showFavoritesOnly}
                  onCheckedChange={setShowFavoritesOnly}
                />
              </div>
            </div>
            
            <Separator className="bg-zinc-800" />
            
            {/* Sort Options */}
            <div>
              <div className="mb-2">
                <Label className="text-sm font-medium flex items-center">
                  <AlignLeft className="h-4 w-4 mr-1 text-gray-400" />
                  Sort By
                </Label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={sortBy === "date" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortBy("date")}
                  className={`flex justify-center items-center ${sortBy !== "date" ? "bg-zinc-800 border-zinc-700" : ""}`}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Date
                </Button>
                <Button
                  variant={sortBy === "title" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortBy("title")}
                  className={`flex justify-center items-center ${sortBy !== "title" ? "bg-zinc-800 border-zinc-700" : ""}`}
                >
                  <AlignLeft className="h-3 w-3 mr-1" />
                  Title
                </Button>
                <Button
                  variant={sortBy === "rating" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortBy("rating")}
                  className={`flex justify-center items-center ${sortBy !== "rating" ? "bg-zinc-800 border-zinc-700" : ""}`}
                >
                  <Star className="h-3 w-3 mr-1" />
                  Rating
                </Button>
              </div>
            </div>
            
            {/* Sort Order */}
            <div>
              <div className="mb-2">
                <Label className="text-sm font-medium">Sort Order</Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={sortOrder === "asc" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortOrder("asc")}
                  className={`flex justify-center items-center ${sortOrder !== "asc" ? "bg-zinc-800 border-zinc-700" : ""}`}
                >
                  <SortAsc className="h-4 w-4 mr-1" />
                  Ascending
                </Button>
                <Button
                  variant={sortOrder === "desc" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortOrder("desc")}
                  className={`flex justify-center items-center ${sortOrder !== "desc" ? "bg-zinc-800 border-zinc-700" : ""}`}
                >
                  <SortDesc className="h-4 w-4 mr-1" />
                  Descending
                </Button>
              </div>
            </div>
            
            <Separator className="bg-zinc-800" />
            
            {/* Clear All */}
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={clearAllFilters}
              className="w-full"
            >
              Clear All Filters
            </Button>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}