#!/usr/bin/env node

/**
 * Script to remove `export const dynamic = 'force-dynamic'` from API route files
 * This reverts the changes made by add-dynamic-export.js since that approach
 * doesn't work with Next.js static export.
 */

import fs from 'fs';
import path from 'path';

const API_DIR = './src/app/api';

function findRouteFiles(dir) {
  const routeFiles = [];
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
        routeFiles.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return routeFiles;
}

function removeDynamicExport(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remove the dynamic export line and surrounding blank lines
  const patterns = [
    /\n\nexport const dynamic = 'force-dynamic';\n\n/g,
    /\nexport const dynamic = 'force-dynamic';\n/g,
    /export const dynamic = 'force-dynamic';\n/g,
  ];
  
  let modified = false;
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      content = content.replace(pattern, '\n');
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[REVERTED] ${filePath}`);
    return true;
  }
  
  console.log(`[SKIP] ${filePath} - no dynamic export found`);
  return false;
}

function main() {
  console.log('Removing dynamic exports from API routes...\n');
  
  const routeFiles = findRouteFiles(API_DIR);
  console.log(`Found ${routeFiles.length} API route files\n`);
  
  let reverted = 0;
  let skipped = 0;
  
  for (const file of routeFiles) {
    if (removeDynamicExport(file)) {
      reverted++;
    } else {
      skipped++;
    }
  }
  
  console.log(`\nDone! Reverted: ${reverted}, Skipped: ${skipped}`);
}

main();
