import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of transactions for performance
  replaysSessionSampleRate: 0, // Disable replays for now
  replaysOnErrorSampleRate: 0, // Disable replays for now
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  debug: false,
})
