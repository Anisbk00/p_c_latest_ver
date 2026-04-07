import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider, ThemeSync } from "@/components/theme-provider-wrapper";
import { SupabaseAuthProvider } from "@/lib/supabase/auth-context";
import { AppProvider } from "@/contexts/app-context";
import { SetupProvider } from "@/contexts/setup-context";
import { SetupModalManager } from "@/components/setup/setup-modal-manager";
import { AuthErrorBoundary } from "@/components/auth/auth-error-boundary";
import { SyncProvider } from "@/components/sync-provider";
import { OfflineBanner } from "@/components/offline-status-indicator";
import { CapacitorInit } from "@/components/CapacitorInit";
import { LocaleBridge } from "@/components/i18n/LocaleBridge";

// Font CSS variables are defined in globals.css using system font stacks.
// This avoids next/font CDN dependency in restricted network environments.

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: "Progress Companion",
  description: "Your AI fitness companion - Photo-first, privacy-first, explainable",
  authors: [{ name: "Progress Companion" }],
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Progress",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang/dir are managed imperatively by LocaleProvider after hydration.
    // Default to en/ltr — overridden immediately once user settings load.
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* FOUC prevention: apply saved theme class before React hydrates.
            This reads next-themes' localStorage key and sets the class on <html>
            so there's zero flash of the wrong theme on refresh/navigation. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var t = localStorage.getItem('theme');
                  if (t) document.documentElement.className = t;
                } catch(e){}
                // Splash screen skip: check sessionStorage BEFORE React hydrates.
                // Prevents splash flash on back-navigation from settings/profile/foods routes.
                try {
                  var skipSplash = sessionStorage.getItem('return-to-profile') === 'true'
                    || sessionStorage.getItem('skip-splash') === 'true';
                  if (skipSplash) {
                    document.documentElement.classList.add('no-splash');
                  }
                } catch(e){}
              })();
            `,
          }}
        />
        {/* Service Worker registration for offline support (skip in Capacitor native shell) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && !(window.Capacitor && window.Capacitor.isNativePlatform())) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
                    .catch(function(err) { console.warn('[SW] Registration failed:', err); });
                });
              }
            `,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        {/* Global error handler for production debugging */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onerror = function(msg, url, line, col, error) {
                console.error('[Global Error]', msg, url, line, col, error);
                // Force hide splash after error
                try { localStorage.setItem('p-c-error', JSON.stringify({msg, url, line, col, time: Date.now()})); } catch(e) {}
              };
              window.onunhandledrejection = function(e) {
                console.error('[Unhandled Rejection]', e.reason);
              };
              // Force hide splash after 15 seconds max
              setTimeout(function() {
                console.log('[Safety] Force hiding splash after 15s');
                document.body.style.opacity = '1';
              }, 15000);
            `,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          themes={['light', 'dark', 'gymbro', 'gymgirl']}
          value={{
            light: 'light',
            dark: 'dark',
            gymbro: 'gymbro',
            gymgirl: 'gymgirl',
          }}
        >
          <AuthErrorBoundary>
            <SupabaseAuthProvider>
              <SyncProvider>
                <AppProvider>
                  {/* ThemeSync must be inside AppProvider to use useApp() */}
                  <ThemeSync>
                    {/* LocaleBridge must be inside AppProvider to read userSettings.language */}
                    <LocaleBridge>
                      <SetupProvider>
                        <OfflineBanner />
                        {children}
                        <SetupModalManager />
                      </SetupProvider>
                    </LocaleBridge>
                  </ThemeSync>
                </AppProvider>
              </SyncProvider>
            </SupabaseAuthProvider>
          </AuthErrorBoundary>
          <Toaster />
          <CapacitorInit />
        </ThemeProvider>
      </body>
    </html>
  );
}
