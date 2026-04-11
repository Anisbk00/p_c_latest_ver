# Task 1 – Wire push notification registration in CapacitorInit.tsx

**Status:** ✅ Complete

## Summary
Added push notification registration logic to `src/components/CapacitorInit.tsx`.

## Changes
- **File:** `src/components/CapacitorInit.tsx`
- **Location:** New section inserted after "Handle Android hardware back button" (line 57), before "Listen to app state changes" (now line 104).
- **Lines added:** ~44

## Implementation Details
- Follows existing code patterns: `try/catch` with `[Cap]` prefixed warnings, dynamic imports for all Capacitor plugins.
- Four `PushNotifications` listeners registered:
  - `registration` → calls `notificationService.registerDevice()` with device token, platform type (`isAndroid ? 'android' : 'ios'`), and device name from `@capacitor/device`.
  - `registrationError` → logs failure.
  - `pushNotificationReceived` → placeholder for foreground handling.
  - `pushNotificationActionPerformed` → navigates to `deepLink` from notification data.
- No build-time dependency on `@/lib/notifications/service` (dynamic import).

## Verification
- ESLint: 0 errors, 0 new warnings on modified file.
- Pre-existing 23 warnings in other files are unrelated.
