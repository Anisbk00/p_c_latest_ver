"use client";

import { cn } from "@/lib/utils";
import { Check, Sun, Moon, Dumbbell, Sparkles, LucideIcon } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";

interface ThemeOption {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

export const THEMES: ThemeOption[] = [
  { id: 'light', nameKey: 'theme.light.name', descriptionKey: 'theme.light.description', icon: Sun },
  { id: 'dark', nameKey: 'theme.dark.name', descriptionKey: 'theme.dark.description', icon: Moon },
  { id: 'gymbro', nameKey: 'theme.gymbro.name', descriptionKey: 'theme.gymbro.description', icon: Dumbbell },
  { id: 'gymgirl', nameKey: 'theme.gymgirl.name', descriptionKey: 'theme.gymgirl.description', icon: Sparkles },
];

export function ThemeSelector({ currentTheme, onSelect }: {
  currentTheme: string;
  onSelect: (theme: string) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {THEMES.map((theme) => {
        const Icon = theme.icon;
        return (
          <button
            key={theme.id}
            onClick={() => onSelect(theme.id)}
            className={cn(
              "relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
              currentTheme === theme.id 
                ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
                : "border-border/50 bg-card hover:bg-accent/50 hover:border-border"
            )}
          >
             {/* Preview UI */}
             <div className={cn(
               "w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-border shadow-sm",
               "flex items-center justify-center"
             )} data-theme={theme.id}>
                <Icon className={cn("w-5 h-5", currentTheme === theme.id ? "text-primary" : "text-muted-foreground")} />
             </div>
             
             <div className="flex-1 text-left">
               <div className="flex items-center gap-2">
                 <span className="font-medium text-sm">{t(theme.nameKey)}</span>
                 {currentTheme === theme.id && <Check className="w-4 h-4 text-primary" />}
               </div>
               <div className="text-xs text-muted-foreground">{t(theme.descriptionKey)}</div>
             </div>
          </button>
        );
      })}
    </div>
  );
}
