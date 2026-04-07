# Supabase Configuration Guide

## 🔐 Security Notice

**CRITICAL**: Your Supabase credentials are now properly configured using environment variables. The `.env` file containing your actual credentials is **gitignored** and will **NOT** be pushed to GitHub.

## ✅ Current Configuration

Your project is connected to:
- **Supabase URL**: `https://ygzxxmyrybtvszjlilxg.supabase.co`
- **Project Ref**: `ygzxxmyrybtvszjlilxg`

All credentials are stored in `.env` (local only, gitignored).

## 📁 File Structure

```
.env                    # Local credentials (GITIGNORED - never committed)
.env.example            # Template with placeholder values (committed to Git)
.env.vercel             # Vercel deployment credentials (GITIGNORED)
eas.json                # Mobile build env vars (public keys only - safe)
```

## 🔑 Environment Variables

### Required Variables (in `.env`):

```bash
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://ygzxxmyrybtvszjlilxg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...  # Client-safe anon key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...      # Server-only admin key
DATABASE_URL=postgresql://postgres:...     # Direct database connection

# Supabase Management
SUPABASE_ACCESS_TOKEN=sbp_...              # For CLI operations

# Expo/EAS
EXPO_ACCESS_TOKEN=poDj...                  # For mobile builds

# API
NEXT_PUBLIC_API_URL=https://p-c-five.vercel.app
```

## 🚀 Deployment Setup

### Vercel Deployment

Add these environment variables in Vercel Dashboard:
1. Go to: https://vercel.com/your-project/settings/environment-variables
2. Add each variable from `.env`
3. Set scope to **Production, Preview, and Development**

### Mobile Builds (EAS)

The `eas.json` file contains environment variables for mobile builds.
- ✅ **Public keys** (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are safe in `eas.json`
- ❌ **Never add** service role keys or access tokens to `eas.json`

## 🔄 For New Team Members

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Request credentials from project owner (you)

3. Update `.env` with actual values

4. **Never commit `.env`** - it's already gitignored

## 🛡️ Security Best Practices

### ✅ What's Safe to Commit:
- `.env.example` (placeholder values only)
- `eas.json` (public anon keys for mobile builds)
- Code that reads from `process.env.*`

### ❌ Never Commit:
- `.env` (actual credentials)
- `.env.local`, `.env.*.local`
- `.env.vercel` (Vercel-generated)
- Hardcoded credentials in source code

## 📝 Current Architecture

### Client-Side (Browser/Mobile):
- Uses `NEXT_PUBLIC_SUPABASE_URL`
- Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (JWT with RLS)
- Safe to expose - protected by Row Level Security

### Server-Side (API Routes):
- Uses `SUPABASE_SERVICE_ROLE_KEY` (admin bypass)
- **Never exposed to client** (server-only)
- Validated in `src/lib/supabase/server-config.ts`

### Mobile (Capacitor):
- Reads from Next.js env during build
- Bundled into static export
- Connected to same Supabase project

## 🔍 Verification

Check if credentials are loaded:
```bash
npm run dev
```

Look for console output - no errors about missing `SUPABASE_URL` or `SUPABASE_ANON_KEY`.

## 🆘 Troubleshooting

### "SUPABASE_URL is not set"
- Ensure `.env` exists in project root
- Restart dev server after creating `.env`

### "Authentication failed"
- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` matches your Supabase project
- Check for trailing newlines or spaces in `.env`

### Mobile build can't connect
- Ensure `eas.json` has correct `NEXT_PUBLIC_SUPABASE_URL`
- Verify Capacitor config allows `*.supabase.co` navigation

## 📞 Support

**Project Owner**: You maintain these credentials
**Supabase Dashboard**: https://supabase.com/dashboard/project/ygzxxmyrybtvszjlilxg
