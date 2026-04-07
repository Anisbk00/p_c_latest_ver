import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

/**
 * Capacitor Configuration for Production Mobile App
 * 
 * 📱 PRODUCTION MODE (bundled assets):
 *    - App bundles all static assets
 *    - Works offline with cached data
 *    - API calls go to deployed backend (set NEXT_PUBLIC_API_URL)
 *    - No server dependency for UI
 * 
 * 🔧 DEVELOPMENT:
 *    - Set CAPACITOR_DEV=true environment variable
 *    - Or use: npx cap run android --livereload
 */

const isDev = process.env.CAPACITOR_DEV === 'true';

// Supabase URL from environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseDomain = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : 'supabase.co';

// API URL for mobile - the deployed backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const config: CapacitorConfig = {
  appId: 'com.progresscompanion.app',
  appName: 'Progress Companion',
  
  // Static assets output folder (from Next.js static export)
  webDir: 'out',

  // ══════════════════════════════════════════════════════════════
  // Server Configuration
  // ══════════════════════════════════════════════════════════════
  ...(isDev
    ? {
        // DEVELOPMENT: Load from local dev server
        server: {
          url: 'http://10.0.2.2:3000',
          androidScheme: 'https',
          iosScheme: 'https',
          cleartext: true,
          allowNavigation: [
            supabaseDomain,
            '*.supabase.co',
          ],
        },
      }
    : {
        // PRODUCTION: Use bundled assets, allow navigation to API servers
        server: {
          androidScheme: 'https',
          iosScheme: 'https',
          allowNavigation: [
            // Your deployed backend
            new URL(API_URL).hostname,
            // Supabase
            supabaseDomain,
            '*.supabase.co',
            // Google AI
            '*.googleapis.com',
          ],
        },
      }),

  // ══════════════════════════════════════════════════════════════
  // Android-specific
  // ══════════════════════════════════════════════════════════════
  android: {
    buildOptions: {
      keystorePath: undefined, // Set for release builds
      keystoreAlias: undefined,
    },
    allowMixedContent: isDev,
    backgroundColor: '#0a0a0a',
  },

  // ══════════════════════════════════════════════════════════════
  // iOS-specific
  // ══════════════════════════════════════════════════════════════
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0a0a0a',
    scheme: 'ProgressCompanion',
    buildOptions: {
      developmentTeam: undefined, // Set your Apple Team ID here
      automaticSigning: true,
    },
  },

  // ══════════════════════════════════════════════════════════════
  // Plugin Configuration
  // ══════════════════════════════════════════════════════════════
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
    },
    Camera: {
      permissions: ['camera'],
    },
    Geolocation: {
      permissions: ['location'],
    },
  },
};

export default config;
