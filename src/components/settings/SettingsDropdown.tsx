"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Settings,
  X,
  ChevronRight,
  Sun,
  Moon,
  Palette,
  Bell,
  Shield,
  User,
  LogOut,
  Trash2,
  Loader2,
  Fingerprint,
  Download,
  Sparkles,
  Volume2,
  Vibrate,
  Globe,
  Ruler,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/lib/supabase/auth-context";
import { useSettings } from "@/hooks/use-settings";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface SettingsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

type SettingsSection = 'appearance' | 'account' | 'notifications' | null;

interface ThemeOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'light', name: 'WHITE', icon: <Sun className="w-5 h-5" />, description: 'Pure clarity. Clean surfaces and calm focus.' },
  { id: 'dark', name: 'Dark', icon: <Moon className="w-5 h-5" />, description: 'Easy on the eyes' },
];

const CUSTOM_THEMES: ThemeOption[] = [
  { id: 'gymbro', name: 'GYMBRO', icon: <div className="w-5 h-5 rounded-full bg-linear-to-br from-rose-500 to-red-800" />, description: 'Lion mode. Ruthless focus and raw power.' },
  { id: 'gymgirl', name: 'GymGirl', icon: <div className="w-5 h-5 rounded-full bg-linear-to-br from-pink-400 to-rose-300" />, description: 'Soft strength. Elegant, warm, motivating.' },
];

// ═══════════════════════════════════════════════════════════════
// Animation Variants
// ═══════════════════════════════════════════════════════════════

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const dropdownVariants: Variants = {
  hidden: { 
    opacity: 0, 
    scale: 0.95,
    y: -10,
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 30,
      mass: 0.8,
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    y: -10,
    transition: { duration: 0.15 }
  }
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { 
    opacity: 1, 
    height: 'auto',
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 25,
    }
  },
  exit: { 
    opacity: 0, 
    height: 0,
    transition: { duration: 0.2 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({ 
    opacity: 1, 
    x: 0,
    transition: { delay: i * 0.03 }
  }),
};

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export function SettingsDropdown({ isOpen, onClose, triggerRef }: SettingsDropdownProps) {
  const { settings, updateSettings, isLoading } = useSettings();
  const { setTheme: setNextTheme, theme: currentTheme } = useTheme();
  const { signOut } = useSupabaseAuth();
  const { t } = useLocale();
  
  const [expandedSection, setExpandedSection] = useState<SettingsSection>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>(currentTheme || 'white');
  const [hasUnsavedTheme, setHasUnsavedTheme] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef?.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);
  
  // Sync theme
  useEffect(() => {
    if (currentTheme) {
      setSelectedTheme(currentTheme);
    }
  }, [currentTheme]);
  
  const handleThemeChange = useCallback((themeId: string) => {
    setSelectedTheme(themeId);
    setNextTheme(themeId);
    setHasUnsavedTheme(true);
  }, [setNextTheme]);
  
  const handleSaveTheme = useCallback(() => {
    if (settings && selectedTheme !== settings.theme) {
      updateSettings({ theme: selectedTheme as any });
      setHasUnsavedTheme(false);
      toast.success(t('toast.theme.saved'));
    }
  }, [settings, selectedTheme, updateSettings, t]);
  
  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      onClose();
    } catch (error) {
      toast.error(t('toast.signOut.error'));
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, onClose, t]);
  
  const handleDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    try {
      const resp = await fetch('/api/auth/delete', { method: 'DELETE' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete account');
      }
      toast.success(t('toast.deleteAccount.success'));
      onClose();
    } catch (error: any) {
      toast.error(error?.message || t('toast.deleteAccount.error'));
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [onClose, t]);
  
  const toggleSection = useCallback((section: SettingsSection) => {
    setExpandedSection(prev => prev === section ? null : section);
  }, []);
  
  if (isLoading || !settings) return null;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
            onClick={onClose}
          />
          
          {/* Dropdown Container */}
          <motion.div
            ref={dropdownRef}
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "fixed z-50",
              "top-4 right-4 left-4 sm:left-auto sm:w-80",
              "rounded-3xl overflow-hidden",
              // Glassmorphism effect
              "bg-white/80 dark:bg-neutral-900/80",
              "backdrop-blur-xl backdrop-saturate-150",
              "border border-white/20 dark:border-white/10",
              "shadow-2xl shadow-black/10 dark:shadow-black/30",
            )}
          >
            {/* Header */}
            <div className={cn(
              "flex items-center justify-between p-4 pb-3",
              "border-b border-black/5 dark:border-white/5"
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full",
                  "bg-linear-to-br from-emerald-500 to-teal-600",
                  "flex items-center justify-center"
                )}>
                  <Settings className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
              </div>
              <button
                onClick={onClose}
                className={cn(
                  "w-8 h-8 rounded-full",
                  "bg-black/5 dark:bg-white/5",
                  "flex items-center justify-center",
                  "hover:bg-black/10 dark:hover:bg-white/10",
                  "transition-colors active:scale-95"
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto scrollbar-hide">
              {/* Appearance Section */}
              <SettingsSectionItem
                icon={<Palette className="w-5 h-5" />}
                title={t('settings.tab.appearance')}
                subtitle={t('appearance.theme.description')}
                isExpanded={expandedSection === 'appearance'}
                onToggle={() => toggleSection('appearance')}
              >
                <div className="space-y-4 pt-2">
                  {/* Theme Options */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">{t('appearance.theme.theme')}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {THEME_OPTIONS.map((theme) => (
                        <motion.button
                          key={theme.id}
                          variants={itemVariants}
                          custom={THEME_OPTIONS.indexOf(theme)}
                          onClick={() => handleThemeChange(theme.id)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-2xl",
                            "transition-all active:scale-95",
                            selectedTheme === theme.id
                              ? "bg-emerald-500/10 border-2 border-emerald-500/50"
                              : "bg-black/5 dark:bg-white/5 border-2 border-transparent hover:border-black/10 dark:hover:border-white/10"
                          )}
                        >
                          <div className={cn(
                            selectedTheme === theme.id && "text-emerald-500"
                          )}>
                            {theme.icon}
                          </div>
                          <span className="text-xs font-medium">{theme.name}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Custom Themes */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">{t('appearance.theme.customThemes')}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {CUSTOM_THEMES.map((theme) => (
                        <motion.button
                          key={theme.id}
                          variants={itemVariants}
                          custom={CUSTOM_THEMES.indexOf(theme)}
                          onClick={() => handleThemeChange(theme.id)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-2xl",
                            "transition-all active:scale-95",
                            selectedTheme === theme.id
                              ? "bg-emerald-500/10 border-2 border-emerald-500/50"
                              : "bg-black/5 dark:bg-white/5 border-2 border-transparent hover:border-black/10 dark:hover:border-white/10"
                          )}
                        >
                          {theme.icon}
                          <span className="text-xs font-medium">{theme.name}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Save Theme Button */}
                  {hasUnsavedTheme && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-2"
                    >
                      <Button
                        onClick={handleSaveTheme}
                        className="w-full rounded-xl h-10"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {t('appearance.theme.saveTheme')}
                      </Button>
                    </motion.div>
                  )}
                  
                </div>
              </SettingsSectionItem>
              
              {/* Notifications Section */}
              <SettingsSectionItem
                icon={<Bell className="w-5 h-5" />}
                title={t('settings.tab.notifications')}
                subtitle={t('settings.notifications.soundDesc')}
                isExpanded={expandedSection === 'notifications'}
                onToggle={() => toggleSection('notifications')}
              >
                <div className="space-y-4 pt-2">
                  {/* Push Notifications Master Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-emerald-500" />
                      <div>
                        <span className="text-sm font-medium">{t('settings.notifications.pushEnabled')}</span>
                        <span className="text-xs text-muted-foreground block">{t('settings.notifications.pushEnabledDesc')}</span>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications?.push_enabled ?? true}
                      onCheckedChange={(checked) => {
                        updateSettings({
                          notifications: { ...(settings.notifications || {}), push_enabled: checked }
                        });
                        toast.success(checked ? t('settings.notifications.enabled') : t('settings.notifications.disabled'));
                      }}
                    />
                  </div>
                  
                  {/* Daily Summary */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm">{t('settings.insights.dailySummary')}</span>
                        <span className="text-xs text-muted-foreground block">{t('settings.insights.dailySummaryDesc')}</span>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications?.push_daily_summary ?? true}
                      disabled={!settings.notifications?.push_enabled}
                      onCheckedChange={(checked) => {
                        updateSettings({
                          notifications: { ...(settings.notifications || {}), push_daily_summary: checked }
                        });
                        toast.success(t('settings.notifications.saved'));
                      }}
                    />
                  </div>
                  
                  {/* Workout Reminders */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Vibrate className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm">{t('settings.reminders.workout')}</span>
                        <span className="text-xs text-muted-foreground block">{t('settings.reminders.workoutDesc')}</span>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications?.push_workout_reminders ?? true}
                      disabled={!settings.notifications?.push_enabled}
                      onCheckedChange={(checked) => {
                        updateSettings({
                          notifications: { ...(settings.notifications || {}), push_workout_reminders: checked }
                        });
                        toast.success(t('settings.notifications.saved'));
                      }}
                    />
                  </div>
                  
                  {/* Premium Insights */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm">{t('settings.insights.premium')}</span>
                        <span className="text-xs text-muted-foreground block">{t('settings.insights.premiumDesc')}</span>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications?.push_premium_insights ?? true}
                      disabled={!settings.notifications?.push_enabled}
                      onCheckedChange={(checked) => {
                        updateSettings({
                          notifications: { ...(settings.notifications || {}), push_premium_insights: checked }
                        });
                        toast.success(t('settings.notifications.saved'));
                      }}
                    />
                  </div>
                  
                  {/* Sound */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm">{t('settings.notifications.sound')}</span>
                        <span className="text-xs text-muted-foreground block">{t('settings.notifications.soundDesc')}</span>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications?.soundEnabled ?? true}
                      onCheckedChange={(checked) => {
                        updateSettings({
                          notifications: { ...(settings.notifications || {}), soundEnabled: checked }
                        });
                        toast.success(t('settings.notifications.saved'));
                      }}
                    />
                  </div>
                  
                  {/* Email Digest */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5">
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      <div>
                        <span className="text-sm">{t('settings.notifications.emailDigest')}</span>
                        <span className="text-xs text-muted-foreground block">{t('settings.notifications.emailDigestDesc')}</span>
                      </div>
                    </div>
                    <select
                      value={settings.notifications?.email_digest || 'weekly'}
                      onChange={(e) => {
                        updateSettings({
                          notifications: { 
                            ...(settings.notifications || {}), 
                            email_digest: e.target.value as 'none' | 'weekly' | 'daily'
                          }
                        });
                        toast.success(t('settings.notifications.saved'));
                      }}
                      className="text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="none">{t('settings.notifications.emailNone')}</option>
                      <option value="daily">{t('settings.notifications.emailDaily')}</option>
                      <option value="weekly">{t('settings.notifications.emailWeekly')}</option>
                    </select>
                  </div>
                </div>
              </SettingsSectionItem>
              
              {/* Account Section */}
              <SettingsSectionItem
                icon={<User className="w-5 h-5" />}
                title={t('settings.tab.account')}
                subtitle={t('settings.account.dangerDesc')}
                isExpanded={expandedSection === 'account'}
                onToggle={() => toggleSection('account')}
              >
                <div className="space-y-3 pt-2">
                  {/* Unit Preferences */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Ruler className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{t('settings.units.title')}</span>
                    </div>
                    <select
                      value={settings.units?.weight === 'lbs' ? 'imperial' : 'metric'}
                      onChange={(e) => {
                        const system = e.target.value as 'metric' | 'imperial';
                        updateSettings({
                          units: {
                            ...(settings.units || { weight: 'kg', distance: 'km', time: '24h' }),
                            weight: system === 'imperial' ? 'lbs' : 'kg',
                            distance: system === 'imperial' ? 'miles' : 'km',
                          }
                        });
                      }}
                      className={cn(
                        "text-sm px-3 py-1.5 rounded-lg",
                        "bg-black/5 dark:bg-white/5",
                        "border border-black/10 dark:border-white/10",
                        "focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      )}
                    >
                      <option value="metric">{t('settings.units.metric')}</option>
                      <option value="imperial">{t('settings.units.imperial')}</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{t('settings.language.title')}</span>
                    </div>
                    <select
                      value={settings.language || 'en'}
                      onChange={(e) => updateSettings({ language: e.target.value as 'en' | 'fr' | 'ar' })}
                      className={cn(
                        "text-sm px-3 py-1.5 rounded-lg",
                        "bg-black/5 dark:bg-white/5",
                        "border border-black/10 dark:border-white/10",
                        "focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      )}
                    >
                      <option value="en">{t('settings.language.en')}</option>
                      <option value="fr">{t('settings.language.fr')}</option>
                      <option value="ar">{t('settings.language.ar')}</option>
                    </select>
                  </div>
                  
                  {/* Sign Out */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 p-3 rounded-xl",
                      "bg-black/5 dark:bg-white/5",
                      "hover:bg-black/10 dark:hover:bg-white/10",
                      "transition-colors",
                      isSigningOut && "opacity-50 pointer-events-none"
                    )}
                  >
                    {isSigningOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">{t('settings.account.signOut')}</span>
                  </motion.button>
                  
                  {/* Delete Account */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowDeleteDialog(true)}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 p-3 rounded-xl",
                      "bg-red-500/10 text-red-600 dark:text-red-400",
                      "hover:bg-red-500/20",
                      "transition-colors"
                    )}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm font-medium">{t('settings.account.deleteAccount')}</span>
                  </motion.button>
                </div>
              </SettingsSectionItem>
            </div>
            
            {/* Footer */}
            <div className={cn(
              "p-3 text-center",
              "border-t border-black/5 dark:border-white/5",
              "bg-black/2 dark:bg-white/2"
            )}>
              <p className="text-xs text-muted-foreground">
                Progress Companion v0.2.0
              </p>
            </div>
          </motion.div>
          
          {/* Delete Account Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-600">{t('dialog.deleteAccount.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('dialog.deleteAccount.description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>{t('dialog.deleteAccount.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('dialog.deleteAccount.deleting')}
                    </>
                  ) : (
                    t('dialog.deleteAccount.confirm')
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// Settings Section Item Component
// ═══════════════════════════════════════════════════════════════

function SettingsSectionItem({
  icon,
  title,
  subtitle,
  isExpanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "border-b border-black/5 dark:border-white/5",
      "last:border-b-0"
    )}>
      {/* Header */}
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 p-4",
          "hover:bg-black/2 dark:hover:bg-white/2",
          "transition-colors"
        )}
      >
        <div className={cn(
          "w-9 h-9 rounded-xl",
          "bg-black/5 dark:bg-white/5",
          "flex items-center justify-center",
          isExpanded && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        )}>
          {icon}
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </motion.button>
      
      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SettingsDropdown;
