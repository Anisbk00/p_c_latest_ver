"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Eye,
  ImageOff,
  CheckCircle2,
  CircleDashed,
  Shuffle,
  Flame,
  Utensils,
  Salad,
  Apple,
  Pizza,
  Coffee,
  IceCream,
  Soup,
  Croissant,
  Egg,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfidenceBadge } from "./confidence-badge";

// Types
export interface PortionPhoto {
  imageUrl: string;
  portionMultiplier: number;
  label: string;
}

export type VerificationStatus = "draft" | "cross_checked" | "verified";

export interface FoodCardProps {
  id: string;
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: number;
  servingUnit: string;
  verificationStatus: VerificationStatus;
  confidenceScore: number;
  portionPhotos?: PortionPhoto[];
  onAdd?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  className?: string;
}

// Verification status configuration
const verificationConfig = {
  draft: {
    label: "Draft",
    icon: CircleDashed,
    color:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
  cross_checked: {
    label: "Cross-Checked",
    icon: Shuffle,
    color:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  verified: {
    label: "Verified",
    icon: CheckCircle2,
    color:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  },
};

// Macro nutrient colors
const macroColors = {
  protein: {
    bg: "bg-rose-500",
    light: "bg-rose-100 dark:bg-rose-900/30",
    text: "text-rose-700 dark:text-rose-300",
  },
  carbs: {
    bg: "bg-amber-500",
    light: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
  },
  fat: {
    bg: "bg-sky-500",
    light: "bg-sky-100 dark:bg-sky-900/30",
    text: "text-sky-700 dark:text-sky-300",
  },
};

// Macro bar component
interface MacroBarProps {
  label: string;
  value: number;
  max: number;
  color: keyof typeof macroColors;
  unit?: string;
}

function MacroBar({ label, value, max, color, unit = "g" }: MacroBarProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const colors = macroColors[color];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={cn("font-medium", colors.text)}>{label}</span>
        <span className="text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <div className={cn("h-2 w-full overflow-hidden rounded-full", colors.light)}>
        <motion.div
          className={cn("h-full rounded-full", colors.bg)}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// Verification badge component
interface VerificationBadgeProps {
  status: VerificationStatus;
  className?: string;
}

function VerificationBadge({ status, className }: VerificationBadgeProps) {
  const config = verificationConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", config.color, className)}
    >
      <Icon className="size-3" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

// Food image placeholder with improved visual design
interface FoodImageProps {
  src?: string;
  alt: string;
  className?: string;
}

// Food icons map for lookup
const FOOD_ICONS: Record<string, React.ElementType> = {
  salad: Salad,
  vegetable: Salad,
  greens: Salad,
  apple: Apple,
  fruit: Apple,
  berry: Apple,
  pizza: Pizza,
  pasta: Pizza,
  italian: Pizza,
  coffee: Coffee,
  tea: Coffee,
  latte: Coffee,
  'ice cream': IceCream,
  dessert: IceCream,
  cake: IceCream,
  soup: Soup,
  stew: Soup,
  broth: Soup,
  bread: Croissant,
  croissant: Croissant,
  pastry: Croissant,
  egg: Egg,
  omelet: Egg,
  breakfast: Egg,
};

// Get a food-related icon based on the food name
function getFoodIcon(foodName: string): React.ReactNode {
  const name = foodName.toLowerCase();
  
  // Find matching icon
  for (const [keyword, Icon] of Object.entries(FOOD_ICONS)) {
    if (name.includes(keyword)) {
      return <Icon className="size-10 text-foreground/40" strokeWidth={1.5} aria-hidden="true" />;
    }
  }
  
  // Default to Utensils for generic food items
  return <Utensils className="size-10 text-foreground/40" strokeWidth={1.5} aria-hidden="true" />;
}

// Get small food icon for loading state
function getSmallFoodIcon(foodName: string): React.ReactNode {
  const name = foodName.toLowerCase();
  
  for (const [keyword, Icon] of Object.entries(FOOD_ICONS)) {
    if (name.includes(keyword)) {
      return <Icon className="size-8 text-foreground/20" aria-hidden="true" />;
    }
  }
  
  return <Utensils className="size-8 text-foreground/20" aria-hidden="true" />;
}

// Generate consistent gradient colors based on food name
function getFoodGradient(foodName: string): string {
  // Create a simple hash from the food name
  const hash = foodName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Array of pleasing gradient combinations
  const gradients = [
    'from-emerald-400/20 to-teal-500/30',
    'from-orange-400/20 to-amber-500/30',
    'from-rose-400/20 to-pink-500/30',
    'from-sky-400/20 to-blue-500/30',
    'from-violet-400/20 to-purple-500/30',
    'from-lime-400/20 to-green-500/30',
    'from-cyan-400/20 to-sky-500/30',
    'from-fuchsia-400/20 to-pink-500/30',
  ];
  
  return gradients[hash % gradients.length];
}

function FoodImage({ src, alt, className }: FoodImageProps) {
  const [hasError, setHasError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(!!src);
  
  // Get icon and gradient for placeholder
  const foodIcon = React.useMemo(() => getFoodIcon(alt), [alt]);
  const loadingIcon = React.useMemo(() => getSmallFoodIcon(alt), [alt]);
  const gradientClass = React.useMemo(() => getFoodGradient(alt), [alt]);
  
  // Get initials from food name (first two words)
  const initials = React.useMemo(() => alt
    .split(' ')
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join(''), [alt]);

  if (!src || hasError) {
    return (
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br",
          gradientClass,
          className
        )}
      >
        {/* Decorative pattern overlay */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, currentColor 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
        
        {/* Center content */}
        <div className="relative flex flex-col items-center justify-center gap-2">
          {/* Food icon with glow */}
          <div className="relative">
            <div className="absolute inset-0 blur-lg bg-current opacity-20" />
            {foodIcon}
          </div>
          
          {/* Food initials */}
          <span className="text-sm font-semibold text-foreground/30 tracking-wide">
            {initials}
          </span>
        </div>
        
        {/* Decorative corner elements */}
        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10" />
        <div className="absolute bottom-3 left-3 w-6 h-6 rounded-full bg-white/5" />
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div
          className={cn(
            "absolute inset-0 flex h-full w-full items-center justify-center bg-gradient-to-br animate-pulse z-10",
            gradientClass,
            className
          )}
        >
          {loadingIcon}
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          "h-full w-full object-cover",
          isLoading && "opacity-0",
          className
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </>
  );
}

// Portion photo carousel component
interface PortionPhotoCarouselProps {
  photos: PortionPhoto[];
  foodName: string;
}

function PortionPhotoCarousel({ photos, foodName }: PortionPhotoCarouselProps) {
  if (photos.length === 0) return null;

  return (
    <Carousel
      opts={{
        align: "start",
        loop: true,
      }}
      className="w-full"
    >
      <CarouselContent>
        {photos.map((photo, index) => (
          <CarouselItem key={index} className="basis-full sm:basis-1/2">
            <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              <FoodImage
                src={photo.imageUrl}
                alt={`${foodName} - ${photo.label}`}
                className="transition-transform hover:scale-105"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-xs font-medium text-white">{photo.label}</p>
                <p className="text-xs text-white/80">
                  {photo.portionMultiplier}x serving
                </p>
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-1 size-7" />
      <CarouselNext className="right-1 size-7" />
    </Carousel>
  );
}

/**
 * FoodCard displays food database entries with verification status,
 * nutritional information, and portion photos.
 */
export function FoodCard({
  id,
  name,
  brand,
  calories,
  protein,
  carbs,
  fat,
  servingSize,
  servingUnit,
  verificationStatus,
  confidenceScore,
  portionPhotos,
  onAdd,
  onViewDetails,
  className,
}: FoodCardProps) {
  const [isPhotosExpanded, setIsPhotosExpanded] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const hasPhotos = portionPhotos && portionPhotos.length > 0;

  // Calculate max macro for bar scaling (assume 50g as max for visual balance)
  const maxMacro = 50;

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onViewDetails?.(id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.01 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <Card
        className={cn(
          "group relative overflow-hidden transition-shadow hover:shadow-lg",
          className
        )}
      >
        {/* Food image section */}
        <div className="relative aspect-video w-full overflow-hidden">
          <FoodImage
            src={hasPhotos ? portionPhotos![0].imageUrl : undefined}
            alt={name}
            className="transition-transform duration-300 group-hover:scale-105"
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

          {/* Verification badge - positioned top right */}
          <div className="absolute right-2 top-2">
            <VerificationBadge status={verificationStatus} />
          </div>

          {/* Calories badge */}
          <div className="absolute bottom-2 left-2">
            <Badge
              variant="secondary"
              className="gap-1 bg-white/90 text-gray-900 backdrop-blur-sm dark:bg-gray-900/90 dark:text-gray-100"
            >
              <Flame className="size-3 text-orange-500" aria-hidden="true" />
              {calories} cal
            </Badge>
          </div>
        </div>

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle
                className="truncate text-lg cursor-pointer hover:text-primary transition-colors"
                onClick={() => onViewDetails?.(id)}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                role="button"
                aria-label={`View details for ${name}`}
              >
                {name}
              </CardTitle>
              {brand && (
                <p className="text-sm text-muted-foreground truncate">{brand}</p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Serving size */}
          <p className="text-sm text-muted-foreground">
            Serving: {servingSize} {servingUnit}
          </p>

          {/* Macro bars */}
          <div className="space-y-2">
            <MacroBar
              label="Protein"
              value={protein}
              max={maxMacro}
              color="protein"
            />
            <MacroBar label="Carbs" value={carbs} max={maxMacro} color="carbs" />
            <MacroBar label="Fat" value={fat} max={maxMacro} color="fat" />
          </div>

          {/* Confidence badge */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">AI Confidence:</span>
            <ConfidenceBadge
              confidence={confidenceScore}
              showLabel={false}
              size="sm"
            />
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-3 pt-0">
          {/* Action buttons */}
          <div className="flex w-full items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => onAdd?.(id)}
                  aria-label={`Add ${name} to log`}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Quick Add
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add this food to your log</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onViewDetails?.(id)}
                  aria-label={`View details for ${name}`}
                >
                  <Eye className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View full details</TooltipContent>
            </Tooltip>
          </div>

          {/* Expandable portion photos */}
          {hasPhotos && (
            <Collapsible
              open={isPhotosExpanded}
              onOpenChange={setIsPhotosExpanded}
              className="w-full"
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1 text-muted-foreground hover:text-foreground"
                  aria-expanded={isPhotosExpanded}
                  aria-controls="portion-photos-content"
                >
                  {isPhotosExpanded ? (
                    <ChevronUp className="size-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-4" aria-hidden="true" />
                  )}
                  {portionPhotos!.length} portion photo
                  {portionPhotos!.length !== 1 ? "s" : ""}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent id="portion-photos-content">
                <AnimatePresence>
                  {isPhotosExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="pt-3"
                    >
                      <PortionPhotoCarousel
                        photos={portionPhotos!}
                        foodName={name}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardFooter>

        {/* Hover indicator */}
        <motion.div
          className="absolute inset-0 pointer-events-none border-2 border-primary/0 rounded-xl"
          animate={{
            borderColor: isHovered
              ? "rgba(var(--color-primary), 0.3)"
              : "rgba(var(--color-primary), 0)",
          }}
          transition={{ duration: 0.2 }}
        />
      </Card>
    </motion.div>
  );
}

export default FoodCard;
