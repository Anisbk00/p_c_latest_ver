# Progress Companion 🏋️‍♂️

A comprehensive, production-ready fitness tracking application with AI-powered coaching.

## Features

- **Dashboard** - Overview of your fitness journey with progress tracking
- **Workout Tracking** - Log and monitor your workouts
- **Nutrition Logging** - Track meals, macros, and calories
- **Body Metrics** - Monitor weight, body fat, and measurements
- **Sleep Tracking** - Log sleep duration and quality
- **Progress Photos** - Visual progress documentation
- **Iron Coach AI** - Your personal AI fitness friend with persistent memory
- **Goals** - Set and track fitness goals
- **Multiple Themes** - Gymbro, Gymgirl, Light, and Dark modes
- **Multi-language Support** - English, French, and Arabic

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **AI**: FREE built-in AI (z-ai-web-dev-sdk) - No API keys needed! 🎉
- **Mobile**: Capacitor for iOS/Android

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Anisbk00/Fit_APP.git
cd Fit_APP
```

### 2. Install Dependencies

```bash
npm install
# or
bun install
```

### 3. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note down your project URL and keys from Settings > API

### 4. Set Up Database

1. Open the Supabase SQL Editor
2. Copy and paste the contents of `supabase/setup-database.sql`
3. Execute the SQL to create all tables, indexes, and RLS policies

### 5. Environment Setup

The `.env.local` file is already configured with the necessary credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=your_postgres_connection_string
```

**Note:** Iron Coach AI uses a **FREE built-in AI** (z-ai-web-dev-sdk) - no API keys needed! 🎉

### 6. Run Development Server

```bash
npm run dev
# or
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 7. Create an Account

1. Open the app in your browser
2. Click "Sign Up" to create a new account
3. Complete the setup flow
4. Start using Iron Coach AI!

## Production Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Docker

```bash
docker build -t progress-companion .
docker run -p 3000:3000 progress-companion
```

### Manual Build

```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── auth/              # Auth callback pages
│   └── page.tsx           # Main app page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── iron-coach/       # Iron Coach AI chat
│   └── fitness/          # Fitness tracking components
├── lib/                   # Utilities and services
│   ├── ai/               # AI integration (z-ai-web-dev-sdk)
│   ├── iron-coach/       # Iron Coach logic
│   └── supabase/         # Database client
├── contexts/             # React contexts
└── hooks/                # Custom hooks
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Iron Coach AI

Iron Coach is your personal AI fitness friend that:
- Remembers all your conversations
- Has access to your fitness data in real-time
- Provides personalized advice based on your goals
- Tracks your progress and celebrates victories
- Offers nutrition and workout guidance
- Supports English, French, and Arabic

## Database Schema

The app uses 30+ tables including:
- `profiles` - User profiles
- `user_settings` - App preferences
- `workouts` - Workout tracking
- `food_logs` - Nutrition logging
- `ai_conversations` - Iron Coach chat history
- `ai_messages` - Individual chat messages
- And more...

See `supabase/setup-database.sql` for the complete schema.

## License

MIT License - feel free to use for personal or commercial projects.

---

Made with 💪 by Anis
"# p-c" 
"# p-c" 
