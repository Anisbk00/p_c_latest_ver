#!/usr/bin/env pwsh
# Vercel Environment Variable Setup Script

$ErrorActionPreference = "Continue"
$env:VERCEL_TOKEN = "vcp_YOUR_TOKEN_HERE"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Vercel Environment Variable Setup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Read environment variables from .env
$envVars = @{}
Get-Content .env | Where-Object { $_ -match '^[A-Z]' } | ForEach-Object {
    if ($_ -match '^([^=]+)=(.+)$') {
        $envVars[$matches[1]] = $matches[2]
    }
}

Write-Host "Found $($envVars.Count) environment variables" -ForegroundColor Cyan
Write-Host ""

# Set each variable for all environments
$environments = @("production", "preview", "development")

foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    Write-Host "Setting: $key" -ForegroundColor Yellow
    
    foreach ($env in $environments) {
        Write-Host "  → $env..." -NoNewline
        $result = echo $value | vercel env add $key $env --token $env:VERCEL_TOKEN --force 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✓" -ForegroundColor Green
        } else {
            Write-Host " ✗" -ForegroundColor Red
            Write-Host "    Error: $result" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Environment variables configured!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
