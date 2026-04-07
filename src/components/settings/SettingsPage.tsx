"use client";

import React, { useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useTheme } from "next-themes";
import { UserSettings, DEFAULT_SETTINGS } from "@/lib/types/settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Settings, Shield, Bell, User, Loader2, ArrowLeft, Globe, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { LogOut, Trash2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useApp } from "@/contexts/app-context";
import type { Locale } from "@/lib/i18n/translations";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/lib/supabase/auth-context";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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
import { useBiometricAuth } from "@/hooks/use-biometric-auth";

// Sub-components
import { AppearanceSettings } from "./AppearanceSettings";

function SettingsPage() {
  const { settings, updateSettings, isLoading, isRefreshing } = useSettings();
  const { setTheme } = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("appearance");
  const { signOut } = useSupabaseAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { t } = useLocale();
  const { setUserSettings } = useApp();
  
  // Biometric auth
  const { isSupported: biometricSupported, isEnabled: biometricEnabled, enable: enableBiometric, disable: disableBiometric } = useBiometricAuth();
  const [biometricLoading, setBiometricLoading] = useState(false);
  
  // Delete account confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState("");

  // Language change — optimistic update so the UI switches instantly
  const handleLanguageChange = async (lang: Locale) => {
    // 1. Optimistically update AppContext so LocaleBridge re-renders immediately
    setUserSettings(prev => prev ? { ...prev, language: lang } : null);
    // 2. Persist to Supabase via settings API
    await updateSettings({ language: lang });
  };
  
  // Handle biometric toggle
  const handleBiometricToggle = async (enabled: boolean) => {
    setBiometricLoading(true);
    try {
      if (enabled) {
        const result = await enableBiometric();
        if (result.success) {
          toast.success(t('settings.security.biometricEnabled'));
        } else {
          toast.error(result.error || t('settings.security.biometricFailed'));
        }
      } else {
        await disableBiometric();
        toast.success(t('settings.security.biometricDisabled'));
      }
    } catch (error: any) {
      toast.error(error?.message || t('settings.security.biometricFailed'));
    } finally {
      setBiometricLoading(false);
    }
  };
  
  // Handle delete account with confirmation
  const handleDeleteAccount = async () => {
    if (deleteConfirmPhrase !== "DELETE MY ACCOUNT") {
      toast.error(t('settings.account.deleteConfirmError'));
      return;
    }
    
    try {
      setIsDeleting(true);
      const resp = await fetch("/api/auth/delete", { 
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          password: deletePassword,
          confirmPhrase: deleteConfirmPhrase 
        })
      });
      
      const data = await resp.json().catch(() => ({}));
      
      if (!resp.ok) {
        throw new Error(data.message || data.error || "Failed to delete account");
      }
      
      toast.success(t('settings.account.deleteSuccess'));
      setShowDeleteDialog(false);
      // Clear all local caches to prevent stale data on next sign-in
      try { localStorage.removeItem('progress-companion-settings-cache'); } catch {}
      try { localStorage.removeItem('progress-companion-profile-cache'); } catch {}
      router.push("/");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  // Merge with defaults to ensure all nested objects exist
  // This allows immediate rendering even without cached settings
  const safeSettings: UserSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    notifications: { ...DEFAULT_SETTINGS.notifications, ...settings?.notifications },
    privacy: { ...DEFAULT_SETTINGS.privacy, ...(settings?.privacy || {}) },
    security: { ...DEFAULT_SETTINGS.security, ...settings?.security },
    accessibility: { ...DEFAULT_SETTINGS.accessibility, ...settings?.accessibility },
  } as UserSettings;

  // REMOVED: Blocking loading spinner
  // UI now renders immediately with defaults/cached data
  // Fresh data loads in background when isRefreshing is true

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 pb-24">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => {
          // Set flags to skip splash and return to profile tab
          sessionStorage.setItem('return-to-profile', 'true');
          sessionStorage.setItem('skip-splash', 'true');
          router.push('/');
        }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
          <p className="text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
        {/* Subtle refresh indicator when loading in background */}
        {isRefreshing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Syncing...</span>
          </div>
        )}
      </div>

      <Tabs defaultValue="appearance" value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <div className="overflow-x-auto pb-2">
            <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground w-full sm:w-auto min-w-100">
            <TabsTrigger value="appearance" className="flex-1">{t('settings.tab.appearance')}</TabsTrigger>
            <TabsTrigger value="account" className="flex-1">{t('settings.tab.account')}</TabsTrigger>
            <TabsTrigger value="notifications" className="flex-1">{t('settings.tab.notifications')}</TabsTrigger>
            </TabsList>
        </div>

        {/* APPEARANCE */}
        <TabsContent value="appearance" className="space-y-6">
           <AppearanceSettings 
             settings={safeSettings}
             updateSettings={(updates) => {
               // Update AppContext for immediate sync
               if (updates.theme) {
                 setUserSettings(prev => prev ? { ...prev, theme: updates.theme } : null);
                 setTheme(updates.theme);
               }
               // Persist to Supabase
               updateSettings(updates);
             }}
             isThemePreview={false} 
             setThemePreview={() => {}}
           />

          {/* LANGUAGE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t('settings.language.title')}
              </CardTitle>
              <CardDescription>{t('settings.language.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    { value: 'en' as Locale, native: 'English', flag: '🇬🇧' },
                    { value: 'fr' as Locale, native: 'Français', flag: '🇫🇷' },
                  ] as const
                ).map(({ value, native, flag }) => {
                  const isActive = (safeSettings.language ?? 'en') === value;
                  return (
                    <button
                      key={value}
                      onClick={() => handleLanguageChange(value)}
                      className={`relative flex items-center gap-3 rounded-lg border p-4 text-left transition-all hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-transparent text-foreground'
                      }`}
                    >
                      <span className="text-2xl leading-none">{flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{native}</p>
                      </div>
                      {isActive && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACCOUNT */}
        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.security.title')}</CardTitle>
              <CardDescription>{t('settings.security.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Biometric Toggle */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>{t('settings.security.biometric')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.security.biometricDesc')}</p>
                    </div>
                    <Switch
                        checked={biometricEnabled}
                        onCheckedChange={handleBiometricToggle}
                        disabled={!biometricSupported || biometricLoading}
                    />
                </div>
                {!biometricSupported && (
                  <p className="text-xs text-muted-foreground -mt-4">{t('settings.security.biometricNotSupported')}</p>
                )}
            </CardContent>
          </Card>
          
          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.dataManagement.title')}</CardTitle>
              <CardDescription>{t('settings.dataManagement.exportDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>{t('settings.dataManagement.export')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.dataManagement.exportDesc')}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => toast.info('Export feature coming soon!')}
                    >
                      {t('settings.dataManagement.requestExport')}
                    </Button>
                </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.account.dangerZone')}</CardTitle>
              <CardDescription>{t('settings.account.dangerDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="sm:w-auto"
                  onClick={async () => {
                    try {
                      setIsSigningOut(true);
                      await signOut();
                      router.push("/");
                    } catch (error: any) {
                      toast.error(error?.message || "Failed to sign out");
                    } finally {
                      setIsSigningOut(false);
                    }
                  }}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
                  {t('settings.account.signOut')}
                </Button>

                <Button
                  variant="destructive"
                  className="sm:w-auto"
                  onClick={() => {
                    setDeletePassword("");
                    setDeleteConfirmPhrase("");
                    setShowDeleteDialog(true);
                  }}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('settings.account.deleteAccount')}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Delete Account Confirmation Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  {t('settings.account.deleteDialogTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-left space-y-3">
                  <p>{t('settings.account.deleteDialogDesc')}</p>
                  <ul className="list-disc pl-4 text-sm space-y-1">
                    <li>{t('settings.account.deleteItem1')}</li>
                    <li>{t('settings.account.deleteItem2')}</li>
                    <li>{t('settings.account.deleteItem3')}</li>
                  </ul>
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="delete-password">{t('settings.account.enterPassword')}</Label>
                  <Input
                    id="delete-password"
                    type="password"
                    placeholder={t('settings.account.passwordPlaceholder')}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">{t('settings.account.typeToConfirm')}</Label>
                  <Input
                    id="delete-confirm"
                    type="text"
                    placeholder="DELETE MY ACCOUNT"
                    value={deleteConfirmPhrase}
                    onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                    className={cn(
                      deleteConfirmPhrase && deleteConfirmPhrase !== "DELETE MY ACCOUNT" && "border-destructive"
                    )}
                  />
                  <p className="text-xs text-muted-foreground">{t('settings.account.typeExactly')}</p>
                </div>
              </div>
              
              <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                <AlertDialogCancel className="sm:w-auto">{t('common.cancel')}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || !deletePassword || deleteConfirmPhrase !== "DELETE MY ACCOUNT"}
                  className="sm:w-auto"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  {t('settings.account.confirmDelete')}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-6">
          {/* Global Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                {t('settings.notifications.title')}
              </CardTitle>
              <CardDescription>
                {t('settings.frequency.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.notifications.masterSwitch')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.notifications.masterSwitchDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.push_enabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, push_enabled: c }
                  })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.notifications.sound')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.notifications.soundDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.soundEnabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, soundEnabled: c }
                  })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Reminder Types */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.reminders.title')}</CardTitle>
              <CardDescription>
                {t('settings.reminders.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.reminders.workout')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.reminders.workoutDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.push_workout_reminders ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, push_workout_reminders: c }
                  })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.reminders.meal')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.reminders.mealDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.meal_reminders_enabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, meal_reminders_enabled: c }
                  })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.reminders.hydration')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.reminders.hydrationDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.hydration_reminders_enabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, hydration_reminders_enabled: c }
                  })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.reminders.streakProtection')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.reminders.streakProtectionDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.streak_protection_enabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, streak_protection_enabled: c }
                  })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Insights & Achievements */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.insights.title')}</CardTitle>
              <CardDescription>
                {t('settings.insights.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.insights.dailySummary')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.insights.dailySummaryDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.push_daily_summary ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, push_daily_summary: c }
                  })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.insights.achievements')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.insights.achievementsDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.achievements_enabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, achievements_enabled: c }
                  })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.insights.coachInsights')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.insights.coachInsightsDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.coach_insights_enabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, coach_insights_enabled: c }
                  })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.insights.motivational')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.insights.motivationalDesc')}
                  </p>
                </div>
                <Switch
                  checked={safeSettings?.notifications?.motivational_enabled ?? true}
                  onCheckedChange={(c) => updateSettings({
                    notifications: { ...safeSettings.notifications, motivational_enabled: c }
                  })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Frequency Control */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.frequency.title')}</CardTitle>
              <CardDescription>
                {t('settings.frequency.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.frequency.maxDaily')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.frequency.maxDailyDesc')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      const current = safeSettings?.notifications?.max_notifications_per_day ?? 3;
                      if (current > 3) {
                        updateSettings({
                          notifications: { ...safeSettings.notifications, max_notifications_per_day: current - 1 }
                        });
                      }
                    }}
                  >
                    -
                  </Button>
                  <span className="w-8 text-center font-medium">
                    {safeSettings?.notifications?.max_notifications_per_day ?? 3}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      const current = safeSettings?.notifications?.max_notifications_per_day ?? 3;
                      if (current < 10) {
                        updateSettings({
                          notifications: { ...safeSettings.notifications, max_notifications_per_day: current + 1 }
                        });
                      }
                    }}
                  >
                    +
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.frequency.quietHours')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.frequency.quietHoursDesc')}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{safeSettings?.notifications?.do_not_disturb_start ?? '22:00'}</span>
                  <span>-</span>
                  <span>{safeSettings?.notifications?.do_not_disturb_end ?? '07:00'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

// Memoize to prevent re-renders when AppContext updates
export default React.memo(SettingsPage);
