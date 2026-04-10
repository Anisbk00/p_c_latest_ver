/**
 * Scanned Food Quick Add Dialog
 * 
 * Premium UI for confirming scanned food additions
 * with serving size adjustment and meal selection.
 * 
 * @module components/fitness/scanned-food-quick-add
 */

"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Minus,
  Check,
  Coffee,
  Sun,
  Moon,
  Apple,
  Pill,
  Barcode,
  ExternalLink,
  AlertCircle,
  Flame,
  Beef,
  Wheat,
  Droplet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ScannedFood } from "@/hooks/use-barcode-scanner";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "supplements";

interface ScannedFoodQuickAddProps {
  open: boolean;
  onClose: () => void;
  food: ScannedFood | null;
  mealType?: MealType;
  onConfirm: (food: ScannedFood, quantity: number, mealType: MealType) => void;
}

const MEAL_CONFIG: Record<MealType, { icon: typeof Coffee; label: string; color: string }> = {
  breakfast: { icon: Coffee, label: "Breakfast", color: "from-amber-500/20 to-orange-500/20" },
  lunch: { icon: Sun, label: "Lunch", color: "from-yellow-500/20 to-amber-500/20" },
  dinner: { icon: Moon, label: "Dinner", color: "from-indigo-500/20 to-purple-500/20" },
  snack: { icon: Apple, label: "Snack", color: "from-emerald-500/20 to-teal-500/20" },
  supplements: { icon: Pill, label: "Supplements", color: "from-rose-500/20 to-pink-500/20" },
};

// ═══════════════════════════════════════════════════════════════
// Nutrition Calculation Helper
// ═══════════════════════════════════════════════════════════════

function calculateNutrition(food: ScannedFood, quantity: number, servingSize: number) {
  const multiplier = quantity / 100; // Values are per 100g
  
  return {
    calories: Math.round(food.calories * multiplier),
    protein: Math.round(food.protein * multiplier * 10) / 10,
    carbs: Math.round(food.carbs * multiplier * 10) / 10,
    fat: Math.round(food.fat * multiplier * 10) / 10,
    fiber: food.fiber ? Math.round(food.fiber * multiplier * 10) / 10 : undefined,
    sugar: food.sugar ? Math.round(food.sugar * multiplier * 10) / 10 : undefined,
    sodium: food.sodium ? Math.round(food.sodium * multiplier) : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// Macro Pill Component
// ═══════════════════════════════════════════════════════════════

function MacroPill({ 
  icon: Icon, 
  label, 
  value, 
  unit, 
  color 
}: { 
  icon: typeof Flame;
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-xl",
      "bg-gradient-to-r",
      color
    )}>
      <Icon className="w-4 h-4 opacity-70" />
      <div>
        <p className="text-xs opacity-70">{label}</p>
        <p className="font-semibold text-sm">{value}{unit}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function ScannedFoodQuickAdd({
  open,
  onClose,
  food,
  mealType: initialMealType = "snack",
  onConfirm,
}: ScannedFoodQuickAddProps) {
  const [quantity, setQuantity] = useState(100);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMealType);
  const [customQuantity, setCustomQuantity] = useState("");

  // Reset when opened - defer setState to avoid cascading renders
  useEffect(() => {
    if (open && food) {
      const timer = setTimeout(() => {
        setQuantity(food.servingSize || 100);
        setSelectedMeal(initialMealType);
        setCustomQuantity("");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, food, initialMealType]);

  // Calculate nutrition
  const nutrition = useMemo(() => {
    if (!food) return null;
    return calculateNutrition(food, quantity, food.servingSize);
  }, [food, quantity]);

  const handleQuantityChange = (delta: number) => {
    setQuantity(prev => Math.max(1, prev + delta));
  };

  const handleCustomQuantity = (value: string) => {
    setCustomQuantity(value);
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setQuantity(parsed);
    }
  };

  const handleConfirm = () => {
    if (food && nutrition) {
      onConfirm(
        {
          ...food,
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
          fiber: nutrition.fiber,
          sugar: nutrition.sugar,
          sodium: nutrition.sodium,
        },
        quantity,
        selectedMeal
      );
      onClose();
    }
  };

  if (!open || !food || !nutrition) return null;

  const mealOptions = Object.entries(MEAL_CONFIG) as [MealType, typeof MEAL_CONFIG.breakfast][];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl max-h-[85vh] overflow-hidden"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="px-6 pb-4 border-b border-border">
            <div className="flex items-start gap-4">
              {/* Food Image or Placeholder */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center flex-shrink-0">
                {food.image_url ? (
                  <img 
                    src={food.image_url} 
                    alt={food.name}
                    className="w-full h-full rounded-2xl object-cover"
                  />
                ) : (
                  <Barcode className="w-8 h-8 text-emerald-500" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{food.name}</h3>
                {food.brand && (
                  <p className="text-sm text-muted-foreground truncate">{food.brand}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    <Barcode className="w-3 h-3 mr-1" />
                    {food.barcode}
                  </Badge>
                  {food.isVerified && (
                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      Verified
                    </Badge>
                  )}
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
            {/* Nutrition Preview */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              <MacroPill
                icon={Flame}
                label="Calories"
                value={nutrition.calories}
                unit=""
                color="from-orange-500/20 to-red-500/20"
              />
              <MacroPill
                icon={Beef}
                label="Protein"
                value={nutrition.protein}
                unit="g"
                color="from-rose-500/20 to-pink-500/20"
              />
              <MacroPill
                icon={Wheat}
                label="Carbs"
                value={nutrition.carbs}
                unit="g"
                color="from-amber-500/20 to-yellow-500/20"
              />
              <MacroPill
                icon={Droplet}
                label="Fat"
                value={nutrition.fat}
                unit="g"
                color="from-blue-500/20 to-cyan-500/20"
              />
            </div>

            {/* Quantity Selection */}
            <div className="mb-6">
              <Label className="text-sm font-medium mb-3 block">Serving Size (grams)</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleQuantityChange(-food.servingSize || -25)}
                  disabled={quantity <= (food.servingSize || 25)}
                  className="h-12 w-12 rounded-xl"
                >
                  <Minus className="w-5 h-5" />
                </Button>

                <Input
                  type="number"
                  value={customQuantity || quantity}
                  onChange={e => handleCustomQuantity(e.target.value)}
                  className="flex-1 h-12 text-center text-lg font-semibold rounded-xl"
                  min={1}
                />

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleQuantityChange(food.servingSize || 25)}
                  className="h-12 w-12 rounded-xl"
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>

              {/* Quick quantity buttons */}
              <div className="flex gap-2 mt-3">
                {[50, 100, 150, 200].map(amt => (
                  <Button
                    key={amt}
                    variant={quantity === amt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQuantity(amt)}
                    className={cn(
                      "flex-1 rounded-lg",
                      quantity === amt && "bg-emerald-500 hover:bg-emerald-600"
                    )}
                  >
                    {amt}g
                  </Button>
                ))}
              </div>
            </div>

            {/* Meal Type Selection */}
            <div className="mb-6">
              <Label className="text-sm font-medium mb-3 block">Add to Meal</Label>
              <div className="grid grid-cols-5 gap-2">
                {mealOptions.map(([type, config]) => {
                  const Icon = config.icon;
                  const isSelected = selectedMeal === type;
                  
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedMeal(type)}
                      type="button"
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-xl transition-all",
                        isSelected 
                          ? "bg-emerald-500 text-white" 
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source Badge */}
            {food.source === 'openfoodfacts' && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4">
                <ExternalLink className="w-3 h-3" />
                <span>Data from Open Food Facts</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Button
              onClick={handleConfirm}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
            >
              <Check className="w-5 h-5 mr-2" />
              Add {quantity}g to {MEAL_CONFIG[selectedMeal].label}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default ScannedFoodQuickAdd;
