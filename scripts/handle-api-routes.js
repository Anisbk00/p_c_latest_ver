#!/usr/bin/env node

/**
 * Script to handle API routes for mobile builds
 * 
 * For mobile static export, API routes cannot be included.
 * This script temporarily moves API routes to a backup location
 * during mobile builds, then restores them after.
 * 
 * Usage:
 *   node scripts/handle-api-routes.js backup   # Move API routes to backup
 *   node scripts/handle-api-routes.js restore  # Restore API routes from backup
 */

import fs from 'fs';
import path from 'path';

const API_DIR = './src/app/api';
const BACKUP_DIR = './.api-routes-backup';

function backupApiRoutes() {
  if (!fs.existsSync(API_DIR)) {
    console.log('No API directory found, nothing to backup.');
    return;
  }

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Move API directory to backup
  const backupPath = path.join(BACKUP_DIR, 'api');
  if (fs.existsSync(backupPath)) {
    fs.rmSync(backupPath, { recursive: true });
  }
  
  fs.renameSync(API_DIR, backupPath);
  console.log(`✓ API routes backed up to ${backupPath}`);
}

function restoreApiRoutes() {
  const backupPath = path.join(BACKUP_DIR, 'api');
  
  if (!fs.existsSync(backupPath)) {
    console.log('No backup found, nothing to restore.');
    return;
  }

  // Remove current API directory if it exists (shouldn't exist after backup)
  if (fs.existsSync(API_DIR)) {
    fs.rmSync(API_DIR, { recursive: true });
  }

  // Restore API directory from backup
  fs.renameSync(backupPath, API_DIR);
  console.log(`✓ API routes restored to ${API_DIR}`);

  // Clean up backup directory
  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true });
  }
}

function main() {
  const command = process.argv[2];
  
  if (command === 'backup') {
    console.log('Backing up API routes...\n');
    backupApiRoutes();
  } else if (command === 'restore') {
    console.log('Restoring API routes...\n');
    restoreApiRoutes();
  } else {
    console.log('Usage: node scripts/handle-api-routes.js [backup|restore]');
    process.exit(1);
  }
}

main();
