# Security Credentials Configuration

## ✅ Security Status: HARDENED

All credentials are now properly secured in `.env` (gitignored). **Zero hardcoded keys in source code.**

---

## 🔐 Environment Variables

### **Client-Safe Variables** (NEXT_PUBLIC_*)

These are exposed to the browser/mobile app and must be public anon keys only:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ygzxxmyrybtvszjlilxg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...  # JWT with RLS protection
NEXT_PUBLIC_API_URL=https://p-c-five.vercel.app
NEXT_PUBLIC_MOBILE_BUILD=false
NEXT_PUBLIC_CHECKSUM_SECRET=a1effa...      # Obfuscation pepper (not secret)
```

**Why These Are Safe:**
- `NEXT_PUBLIC_SUPABASE_URL` - Public project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - JWT token with Row Level Security (RLS), rate-limited
- `NEXT_PUBLIC_API_URL` - Your deployed backend URL
- `NEXT_PUBLIC_CHECKSUM_SECRET` - Client-side obfuscation only, not for authentication

---

### **Server-Only Variables** (NO PREFIX)

These are **NEVER** exposed to client code. Used only in API routes and server-side logic:

```bash
# Supabase Admin Access (bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # ⚠️ CRITICAL - Full database access
DATABASE_URL=postgresql://...          # Direct database connection

# Supabase Management
SUPABASE_ACCESS_TOKEN=sbp_...          # CLI/API management token

# AI Services
GEMINI_API_KEY=AIza...                 # Google Gemini API
GOOGLE_AI_API_KEY=AIza...              # Alternative Google AI key

# Expo/EAS
EXPO_ACCESS_TOKEN=poDj...              # Mobile build service

# Security Secrets
AI_WORKER_SECRET=00vzSArP...           # Protects /api/ai/worker endpoint
CRON_SECRET=PO6Zgn...                  # Protects scheduled jobs
```

**Security Enforcement:**
- ✅ Server-side variables checked with `typeof window === 'undefined'`
- ✅ API routes verify secrets before execution
- ✅ Service role key validation in `server-config.ts` throws error if accessed client-side

---

## 🛡️ Security Boundaries

### **Frontend (Browser/Mobile)**
```typescript
// ✅ ALLOWED
process.env.NEXT_PUBLIC_SUPABASE_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
process.env.NEXT_PUBLIC_API_URL
process.env.NODE_ENV

// ❌ NEVER ACCESSIBLE (returns undefined)
process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.AI_WORKER_SECRET
process.env.GEMINI_API_KEY
```

### **Backend (API Routes)**
```typescript
// ✅ ALL VARIABLES ACCESSIBLE
process.env.SUPABASE_SERVICE_ROLE_KEY   // Admin access
process.env.AI_WORKER_SECRET            // Worker auth
process.env.GEMINI_API_KEY              // AI services
```

---

## 📂 File Protection Status

| File | Credentials | Status |
|------|-------------|--------|
| `.env` | ✅ All production secrets | **GITIGNORED** |
| `.env.example` | ✅ Placeholders only | Committed (safe) |
| `.env.vercel` | ✅ Vercel-managed | **GITIGNORED** |
| `src/lib/supabase/config.ts` | ✅ Reads from env only | Committed (safe) |
| `src/lib/supabase/server-config.ts` | ✅ Reads from env only | Committed (safe) |
| `src/proxy.ts` | ✅ Reads from env only | Committed (safe) |
| `capacitor.config.ts` | ✅ Reads from env only | Committed (safe) |
| `next.config.ts` | ✅ Reads from env only | Committed (safe) |
| `eas.json` | ⚠️ Contains public keys | Committed (acceptable) |
| `app.json` | ⚠️ Contains Expo project ID | Committed (acceptable) |

---

## 🔄 Deployment Checklist

### **Vercel Deployment**

Add these variables in **Vercel Dashboard** → Project → Settings → Environment Variables:

**Production, Preview, Development:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://ygzxxmyrybtvszjlilxg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
DATABASE_URL=postgresql://...
NEXT_PUBLIC_API_URL=https://p-c-five.vercel.app
GEMINI_API_KEY=AIza...
GOOGLE_AI_API_KEY=AIza...
AI_WORKER_SECRET=00vzSArP...
CRON_SECRET=PO6Zgn...
NEXT_PUBLIC_CHECKSUM_SECRET=a1effa...
```

### **Mobile Build (EAS)**

The `eas.json` file includes public environment variables that are injected during build:
- ✅ Safe to include: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ❌ Never add: Service role keys, worker secrets, AI keys

---

## 🚨 Credential Rotation

If credentials are ever exposed:

### 1. **Supabase Keys**
   - Dashboard → Settings → API → Reset keys
   - Update `.env` locally
   - Update Vercel environment variables
   - Update `eas.json` if anon key changed
   - Redeploy

### 2. **AI Keys**
   - Google AI Studio → Revoke → Generate new
   - Update `.env`
   - Update Vercel
   - Redeploy

### 3. **Worker Secrets**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   - Update `.env`
   - Update Vercel
   - Redeploy

---

## 🔍 Security Validation

### **Verify No Hardcoded Credentials:**
```powershell
# Search for potential hardcoded secrets in source
rg -i "(api[_-]key|secret|token|password).*=.*['\"]" --type ts --type tsx
```

### **Verify Client-Side Safety:**
```powershell
# Ensure client code only uses NEXT_PUBLIC_* or NODE_ENV
rg "process\.env\.(?!NEXT_PUBLIC_|NODE_ENV)" src/components/ src/app/
```

### **Check Git Status:**
```powershell
git status .env  # Should show "ignored"
```

---

## 📋 Security Best Practices ✅

- ✅ **All secrets in `.env`** - Never hardcoded
- ✅ **`.env` gitignored** - Won't be committed
- ✅ **Client/Server separation** - NEXT_PUBLIC_ prefix enforced
- ✅ **Server-side validation** - Throws error if secrets accessed client-side
- ✅ **No fallback credentials** - Forces explicit configuration
- ✅ **Credential rotation ready** - Generate new secrets with one command
- ✅ **Mobile build safe** - Only public keys in eas.json
- ✅ **Audit trail** - All API routes log access

---

## 🎯 Key Takeaways

1. **Frontend knows nothing secret** - Only public API URLs and anon keys
2. **Backend has full access** - Service role key for admin operations
3. **RLS protects data** - Even with anon key, users only see their data
4. **Worker endpoints protected** - AI_WORKER_SECRET validates async jobs
5. **Rate limiting active** - Prevents abuse of public endpoints
6. **Mobile apps secure** - Connect to same Supabase with RLS

---

## 💡 For New Developers

1. Copy `.env.example` to `.env`
2. Request credentials from project owner (you)
3. Never commit `.env`
4. Never hardcode credentials in source code
5. Always use `process.env.*` for secrets
6. Prefix client-safe variables with `NEXT_PUBLIC_`

---

**Last Updated:** 2026-04-07  
**Security Audit:** ✅ PASSED  
**Hardcoded Credentials:** ❌ NONE FOUND  
**Git Exposure Risk:** ✅ MITIGATED
