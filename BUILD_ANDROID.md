# 📱 Building Native Android APK

This guide shows how to build a native Android APK for Progress Companion.

## Prerequisites

1. **Node.js 18+** and **Bun** installed
2. **Android Studio** with Android SDK 34
3. **Java 17** (JDK)
4. **Connected Android device** with USB debugging enabled

## Quick Start

### Option 1: Run on Connected Device (Development)

```bash
# 1. Install dependencies
bun install

# 2. Build and sync to Android
bun run mobile:sync

# 3. Run on connected device with live reload
bun run mobile:dev
```

### Option 2: Build APK

```bash
# 1. Make build script executable
chmod +x build-android.sh

# 2. Run build
./build-android.sh

# 3. APK will be at:
# android/app/build/outputs/apk/debug/app-debug.apk

# 4. Install on device
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Option 3: Open in Android Studio

```bash
# Build and open in Android Studio
bun run mobile:android
```

Then build APK from Android Studio:
- **Build > Build Bundle(s) / APK(s) > Build APK(s)**

## Manual Build Steps

```bash
# Step 1: Build Next.js for mobile
NEXT_PUBLIC_MOBILE_BUILD=true bun run build

# Step 2: Sync with Capacitor
npx cap sync android

# Step 3: Open Android project
npx cap open android

# Step 4: Build APK in Android Studio or via command line
cd android && ./gradlew assembleDebug
```

## Configuration

### Environment Variables

Create `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ygzxxmyrybtvszjlilxg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=https://your-deployed-api.com
```

### Capacitor Config

Edit `capacitor.config.ts` to change:
- `appId` - Your app's bundle ID
- `appName` - Display name
- `server.allowNavigation` - API domains

## Signing for Release

### Generate Keystore

```bash
keytool -genkey -v -keystore progress-companion.keystore \
  -alias progress-companion \
  -keyalg RSA -keysize 2048 -validity 10000
```

### Configure Signing

Edit `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file('../../progress-companion.keystore')
            storePassword 'your-password'
            keyAlias 'progress-companion'
            keyPassword 'your-password'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### Build Release APK

```bash
cd android && ./gradlew assembleRelease
```

## Troubleshooting

### "SDK location not found"

Create `android/local.properties`:
```properties
sdk.dir=/path/to/Android/sdk
```

### "Unable to find a JVM"

Set JAVA_HOME:
```bash
export JAVA_HOME=/path/to/java17
```

### Gradle Permission Denied

```bash
chmod +x android/gradlew
```

### App not connecting to API

1. Ensure `NEXT_PUBLIC_API_URL` is set correctly
2. Check network security config in `android/app/src/main/res/xml/network_security_config.xml`
3. For local development, ensure device can reach your computer's IP

## GitHub Actions (Cloud Build)

The project includes a GitHub Action that automatically builds APKs on push.

1. Push code to GitHub
2. Go to Actions tab
3. Run "Build Android APK" workflow
4. Download APK artifact

Required secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Output Locations

| Build Type | Location |
|------------|----------|
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Release APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Bundle (AAB) | `android/app/build/outputs/bundle/release/app-release.aab` |
