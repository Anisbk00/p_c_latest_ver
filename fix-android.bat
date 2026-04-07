@echo off
echo ============================================
echo Fixing Android Build Configuration
echo ============================================
echo.

echo [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Building for mobile...
set NEXT_PUBLIC_MOBILE_BUILD=true
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Syncing Capacitor (generates missing Android files)...
call npx cap sync
if %errorlevel% neq 0 (
    echo ERROR: Capacitor sync failed
    pause
    exit /b %errorlevel%
)

echo.
echo ============================================
echo SUCCESS! Android project is now ready.
echo ============================================
echo.
echo You can now:
echo   - Open Android Studio: npm run cap:android
echo   - Build debug APK: npm run android:debug
echo.
pause
