import { Category, Collection } from "@/types";
import { Button } from "@/components/ui/button";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger 
} from "@/components/ui/sheet";
import { 
  Calendar, Star, SortAsc, SortDesc, Heart, CircleX, Plus 
} from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";

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
  const clearFilters = () => {
    setSelectedCategory(undefined);
    setSelectedCollection(undefined);
    setSelectedRating(undefined);
    setShowFavoritesOnly(false);
    setSortBy("date");
    setSortOrder("desc");
  };
  
  // Filter sidebar content
  const sidebarContent = (
    <>
      <div className="mb-6">
        <h3 className="font-medium mb-2">Categories</h3>
        <Select
          value={selectedCategory?.toString() || ""}
          onValueChange={(value) => 
            setSelectedCategory(value ? parseInt(value) : undefined)
          }
        >
          <SelectTrigger className="bg-zinc-800 border-zinc-700">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id.toString()}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-medium">Collections</h3>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 w-7 p-0"
            onClick={onCreateCollection}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Select
          value={selectedCollection?.toString() || ""}
          onValueChange={(value) => 
            setSelectedCollection(value ? parseInt(value) : undefined)
          }
        >
          <SelectTrigger className="bg-zinc-800 border-zinc-700">
            <SelectValue placeholder="All Collections" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="">All Collections</SelectItem>
            {collections.map((collection) => (
              <SelectItem key={collection.id} value={collection.id.toString()}>
                {collection.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="mb-6">
        <h3 className="font-medium mb-2">Rating</h3>
        <div className="flex items-center gap-2">
          <StarRating
            value={selectedRating || 0}
            onChange={setSelectedRating}
            size="sm"
          />
          {selectedRating && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 w-7 p-0"
              onClick={() => setSelectedRating(undefined)}
            >
              <CircleX className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="font-medium mb-2">Additional Filters</h3>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-gray-400" />
            <Label htmlFor="favorites-filter" className="text-sm">
              Favorites Only
            </Label>
          </div>
          <Switch
            id="favorites-filter"
            checked={showFavoritesOnly}
            onCheckedChange={setShowFavoritesOnly}
          />
        </div>
      </div>
      
      <Separator className="bg-zinc-700 my-4" />
      
      <div className="mb-6">
        <h3 className="font-medium mb-2">Sort By</h3>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Button
            variant={sortBy === "date" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("date")}
            className="justify-start"
          >
            <Calendar className="h-4 w-4 mr-1" />
            Date
          </Button>
          <Button
            variant={sortBy === "title" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("title")}
            className="justify-start"
          >
            <div className="font-serif mr-1">A</div>
            Title
          </Button>
          <Button
            variant={sortBy === "rating" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("rating")}
            className="justify-start"
          >
            <Star className="h-4 w-4 mr-1" />
            Rating
          </Button>
        </div>
        
        <div className="flex justify-between mt-3">
          <Button
            variant={sortOrder === "asc" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortOrder("asc")}
            className="flex-1 justify-center"
          >
            <SortAsc className="h-4 w-4 mr-1" />
            Ascending
          </Button>
          <Button
            variant={sortOrder === "desc" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortOrder("desc")}
            className="flex-1 justify-center ml-2"
          >
            <SortDesc className="h-4 w-4 mr-1" />
            Descending
          </Button>
        </div>
      </div>
      
      <Button 
        variant="outline" 
        className="w-full"
        onClick={clearFilters}
      >
        Clear All Filters
      </Button>
    </>
  );
  
  return (
    <>
      {/* Desktop sidebar */}
      <div className="w-64 flex-shrink-0 hidden md:block">
        <div className="bg-zinc-900 p-4 rounded-lg sticky top-4">
          <h2 className="text-xl font-bold mb-4">Filters</h2>
          {sidebarContent}
        </div>
      </div>
      
      {/* Mobile sidebar (Sheet component) */}
      <Sheet open={isVisible} onOpenChange={onClose}>
        <SheetContent side="left" className="bg-zinc-900 border-zinc-800 w-full sm:w-80">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-6">{sidebarContent}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}