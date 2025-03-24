import { useState } from "react";
import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  readonly?: boolean;
}

export function StarRating({
  value,
  onChange,
  size = "md",
  className,
  readonly = false,
}: StarRatingProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);

  const sizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  const handleSetRating = (rating: number) => {
    if (!readonly) {
      onChange(rating);
    }
  };

  return (
    <div className={cn("flex items-center space-x-1", className)}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          className={cn(
            "rating-star focus:outline-none transition-transform hover:scale-110",
            readonly && "cursor-default"
          )}
          onMouseEnter={() => !readonly && setHoveredRating(rating)}
          onMouseLeave={() => !readonly && setHoveredRating(null)}
          onClick={() => handleSetRating(rating)}
          data-star={rating}
        >
          <StarIcon
            className={cn(
              sizes[size],
              (hoveredRating !== null
                ? rating <= hoveredRating
                : rating <= value)
                ? "fill-yellow-400 text-yellow-400"
                : "fill-none text-gray-500"
            )}
          />
        </button>
      ))}
      <input type="hidden" value={value} />
    </div>
  );
}
