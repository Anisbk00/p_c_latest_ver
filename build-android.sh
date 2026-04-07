#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Build Android APK for Progress Companion
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "📱 Building Progress Companion for Android..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Clean previous builds
echo -e "${BLUE}[1/5] Cleaning previous builds...${NC}"
rm -rf .next out
echo "   ✓ Cleaned"

# Step 2: Build Next.js with mobile flag
echo -e "${BLUE}[2/5] Building Next.js for mobile...${NC}"
export NEXT_PUBLIC_MOBILE_BUILD=true
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://your-api.com}"
export NEXT_PUBLIC_SUPABASE_URL="https://ygzxxmyrybtvszjlilxg.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnenh4bXlyeWJ0dnN6amxpbHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTAzOTMsImV4cCI6MjA4ODA2NjM5M30.STMLbhAL2Jn9ecVuKVgAu9JTxvhQrbuAOqIbtRqYxcM"

bun run build
echo "   ✓ Build complete"

# Step 3: Check if out folder exists, if not create from .next
echo -e "${BLUE}[3/5] Preparing static files...${NC}"
if [ ! -d "out" ]; then
    # Next.js with output: export should create out/ folder
    # If using older Next.js, we need to copy from .next/server/app
    if [ -d ".next/server/app" ]; then
        mkdir -p out
        cp -r .next/server/app/* out/ 2>/dev/null || true
        cp -r public/* out/ 2>/dev/null || true
    fi
fi

# Ensure out folder exists for Capacitor
mkdir -p out
echo "   ✓ Static files ready"

# Step 4: Sync with Capacitor
echo -e "${BLUE}[4/5] Syncing with Capacitor...${NC}"
npx cap sync android
echo "   ✓ Synced"

# Step 5: Build APK
echo -e "${BLUE}[5/5] Building Android APK...${NC}"
cd android

# Check if gradlew is executable
chmod +x gradlew

# Build debug APK
./gradlew assembleDebug --no-daemon

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ BUILD SUCCESSFUL!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "📱 APK Location: ${YELLOW}android/app/build/outputs/apk/debug/app-debug.apk${NC}"
echo ""
echo "To install on your connected Android device:"
echo "  adb install android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Or transfer the APK to your device and install manually."
echo ""
