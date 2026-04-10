/**
 * Foods Page Route
 * 
 * Standalone route for the Foods functionality.
 * This allows direct access to /foods URL for testing and bookmarking.
 */

"use client";

import { FoodsPage } from "@/components/fitness/foods-page";
import { AppProvider } from "@/contexts/app-context";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function FoodsRoute() {
  return (
    <AppProvider>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold mb-6">Foods & Nutrition</h1>
            <FoodsPage />
          </div>
        </div>
      </TooltipProvider>
    </AppProvider>
  );
}