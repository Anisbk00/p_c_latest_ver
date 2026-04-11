# Worklog

## Task 2: Mount NotificationCenter in app layout with bell icon badge

### Date: 2025-06-27

### Summary
Created a `NotificationProvider` client component that wraps the entire app, manages notification center open/close state, polls for unread count every 60 seconds, and exposes notification context to any child component. Mounted it in the app layout and added the `NotificationBadge` (bell icon with unread count) to the profile header in both mobile and desktop views.

### Changes Made

1. **Created `/src/components/notifications/notification-provider.tsx`**
   - `'use client'` component
   - React context (`NotificationContext`) with `unreadCount`, `openNotificationCenter`, `closeNotificationCenter`
   - `useNotificationContext()` hook exported for child components
   - Polls `/api/notifications?limit=1` every 60 seconds via `setInterval` in a `.then()` callback (avoids synchronous setState-in-effect lint error)
   - Immediate fetch on mount for first-paint unread count
   - Restarts polling when notification panel closes (to pick up mark-all-read changes)
   - Stops polling when panel is open (the panel fetches its own data)
   - Renders `<NotificationCenter>` panel + context provider wrapping `{children}`

2. **Modified `/src/app/layout.tsx`**
   - Added import: `import { NotificationProvider } from '@/components/notifications/notification-provider';`
   - Wrapped `<OfflineBanner />`, `{children}`, and `<SetupModalManager />` inside `<NotificationProvider>`
   - Placed inside `<LocaleBridge>` → `<SetupProvider>` → `<NotificationProvider>` (client boundary preserved)

3. **Modified `/src/components/fitness/profile-page.tsx`**
   - Added imports: `useNotificationContext` from notification-provider, `NotificationBadge` from notification-center
   - In `ProfileHeader` component: called `useNotificationContext()` to get `unreadCount` and `openNotificationCenter`
   - Added `<NotificationBadge count={unreadCount} onClick={openNotificationCenter} />` as the first button in both:
     - Mobile button area (`sm:hidden` flex container, before Edit button)
     - Desktop button area (`hidden sm:flex` container, before Edit button)

### Verification
- `bun run lint` passes with 0 errors (23 pre-existing warnings unrelated to changes)
- All existing imports and components remain intact
- No breaking changes to existing functionality

## Task 6: Create notification trigger service for auto-generating notifications

### Date: 2025-06-27

### Summary
Created `/api/notifications/triggers` — a new cron endpoint that evaluates time-based trigger rules for every active user and inserts pending notifications into the `notifications` table. This fills the missing "trigger layer" between the notification infrastructure (tables, preferences, process worker) and actual notification generation.

### Changes Made

1. **Created `/src/app/api/notifications/triggers/route.ts`**
   - `'use server'` API route (GET + POST for manual triggering)
   - Same CRON_SECRET auth pattern as the existing `/api/notifications/process` worker
   - Fetches all users with `notifications_enabled: true` from `notification_preferences`
   - For each user, evaluates 6 trigger rules based on their timezone:

   **Trigger Rules Implemented:**
   - **Morning Workout Reminder** — fires at user's `preferred_morning_time` (default 08:00); skips if workout already logged today (checks `workouts` table); throttle key: `workout_reminder:{user_id}:{date}`
   - **Meal Reminder** — fires at 08:00, 12:30, 19:00 for breakfast/lunch/dinner; skips if meal logged in last 3 hours (checks `food_logs` table); per-meal-type throttle keys
   - **Hydration Reminder** — fires every 2 hours between 09:00–20:00 (09, 11, 13, 15, 17, 19); throttle key includes hour bucket
   - **Streak Protection** — fires at 20:00; only if streak > 0 (from `user_behavior_profile`) AND no activity today (checks workouts + food_logs); dynamic body with streak count
   - **Daily Summary** — fires at 21:00; simple once-per-day throttle
   - **Motivational** — fires once per day at a deterministic "random" time between 10:00–18:00 per user (hash-based); rotates through 8 motivational message templates

   **Safety & Quality Features:**
   - Quiet hours check (reuses same logic as process worker)
   - Daily notification cap enforcement (per-user `max_notifications_per_day`)
   - Minimum interval enforcement between notifications
   - Throttle key deduplication (database-level unique constraint fallback on race condition)
   - Graceful degradation: if `workouts`/`food_logs`/`user_behavior_profile` tables don't exist, condition checks are skipped (notifications still fire)
   - Timeout protection: 25s safety margin for Vercel 30s limit
   - One notification per user per cron cycle to prevent burst
   - Comprehensive error handling with try/catch per trigger
   - Structured logging with `[NotificationTriggers]` prefix

2. **Modified `/vercel.json`**
   - Added second cron entry: `/api/notifications/triggers` with `* * * * *` schedule (runs every minute)
   - Triggers cron placed before process cron (triggers must run first to create pending notifications for the process worker)

### Architecture
```
Vercel Cron (every minute)
    │
    ├── /api/notifications/triggers  ← NEW: evaluates rules, inserts pending notifications
    │
    └── /api/notifications/process   ← existing: sends pending notifications via push/in-app
```

### Verification
- `bun run lint` passes with 0 errors (23 pre-existing warnings unrelated to changes)
- No new dependencies added
- Uses existing `createClient` from `@/lib/supabase/server` (service role for cron context)
- Follows same patterns as existing `process/route.ts` for auth, error handling, and logging

---

## Task 5: Wire Settings page notification toggles to notification_preferences API

### Date: 2025-06-27

### Summary
Created a `useNotificationSync` hook that bridges the gap between the Settings page's local notification UI controls (stored in `user_settings` JSON blob via `useSettings()`) and the Supabase `notification_preferences` table (accessed via `/api/notifications/preferences`). The hook listens for changes in notification settings and automatically syncs them to the API using a field name mapping.

### Changes Made

1. **Created `/src/hooks/use-notification-sync.ts`**
   - `'use client'` hook
   - Uses `useSettings()` to access current notification settings
   - Defines a `FIELD_MAP` that maps UI field names (e.g., `push_enabled`) to API field names (e.g., `notifications_enabled`)
   - Uses a `useRef` fingerprint (JSON.stringify) to avoid redundant syncs when settings haven't actually changed
   - Converts "HH:MM" format to "HH:MM:SS" for quiet hours fields
   - Fire-and-forget: calls `apiFetch('/api/notifications/preferences', { method: 'PUT' })` without blocking the UI
   - Silently catches errors so the UI remains responsive even if the API call fails

2. **Modified `/src/components/settings/SettingsPage.tsx`**
   - Added import: `import { useNotificationSync } from '@/hooks/use-notification-sync';`
   - Added `useNotificationSync()` call inside the `SettingsPage` component (after `useApp()` line)

### Field Mapping
| UI Field | API Field |
|---|---|
| `push_enabled` | `notifications_enabled` |
| `push_workout_reminders` | `workout_reminders_enabled` |
| `meal_reminders_enabled` | `meal_reminders_enabled` |
| `hydration_reminders_enabled` | `hydration_reminders_enabled` |
| `streak_protection_enabled` | `streak_protection_enabled` |
| `push_daily_summary` | `daily_summary_enabled` |
| `achievements_enabled` | `achievements_enabled` |
| `coach_insights_enabled` | `coach_insights_enabled` |
| `motivational_enabled` | `motivational_enabled` |
| `max_notifications_per_day` | `max_notifications_per_day` |
| `do_not_disturb_start` | `quiet_hours_start` (+ `:00` suffix) |
| `do_not_disturb_end` | `quiet_hours_end` (+ `:00` suffix) |

### Verification
- `bun run lint` passes with 0 errors (23 pre-existing warnings unrelated to changes)
- No existing settings functionality broken
- Hook is fire-and-forget (does not block UI)
- Only syncs when notification settings actually change (fingerprint comparison)
