# Mobile build script with API route handling
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Building for Mobile (with API route workaround)" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Step 1: Temporarily rename API folder
Write-Host "[1/4] Temporarily moving API routes..." -ForegroundColor Yellow
$apiPath = "src/app/api"
$apiBackupPath = "src/app/_api_backup"

if (Test-Path $apiPath) {
    if (Test-Path $apiBackupPath) {
        Remove-Item $apiBackupPath -Recurse -Force
    }
    Move-Item $apiPath $apiBackupPath -Force
    Write-Host "   ✓ API routes moved to backup" -ForegroundColor Green
} else {
    Write-Host "   ! API folder not found, skipping" -ForegroundColor Yellow
}

# Step 2: Build for mobile
Write-Host "`n[2/4] Building Next.js for mobile (static export)..." -ForegroundColor Yellow
$env:NEXT_PUBLIC_MOBILE_BUILD = "true"
npm run build

$buildSuccess = $LASTEXITCODE -eq 0

# Step 3: Restore API folder
Write-Host "`n[3/4] Restoring API routes..." -ForegroundColor Yellow
if (Test-Path $apiBackupPath) {
    if (Test-Path $apiPath) {
        Remove-Item $apiPath -Recurse -Force
    }
    Move-Item $apiBackupPath $apiPath -Force
    Write-Host "   ✓ API routes restored" -ForegroundColor Green
}

if (-not $buildSuccess) {
    Write-Host "`n✗ Build failed!" -ForegroundColor Red
    exit 1
}

# Step 4: Sync Capacitor
Write-Host "`n[4/4] Syncing Capacitor..." -ForegroundColor Yellow
npx cap sync

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "✓ SUCCESS! Mobile build complete" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Set NEXT_PUBLIC_API_URL in .env to your deployed API" -ForegroundColor White
    Write-Host "  2. Open Android Studio: npm run cap:android" -ForegroundColor White
    Write-Host "  3. Build APK: npm run android:debug" -ForegroundColor White
} else {
    Write-Host "`n✗ Capacitor sync failed!" -ForegroundColor Red
    exit 1
}
