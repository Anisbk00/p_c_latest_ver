#!/usr/bin/env node

/**
 * Script to add `export const dynamic = 'force-dynamic'` to all API route files
 * This is needed for Next.js static export to skip API routes during build.
 * 
 * In Next.js 14+, API routes with `export const dynamic = 'force-dynamic'` 
 * are automatically excluded from static exports.
 */

import fs from 'fs';
import path from 'path';

const API_DIR = './src/app/api';
const DYNAMIC_EXPORT = "export const dynamic = 'force-dynamic';";

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

function hasDynamicExport(content) {
  // Check for various forms of the dynamic export
  const patterns = [
    /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/,
    /export\s+const\s+dynamic\s*=\s*['"]error['"]/,
    /export\s+const\s+dynamic\s*=\s*['"]force-static['"]/,
  ];
  
  return patterns.some(pattern => pattern.test(content));
}

function addDynamicExport(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already has dynamic export
  if (hasDynamicExport(content)) {
    console.log(`[SKIP] ${filePath} - already has dynamic export`);
    return false;
  }
  
  // Find the best insertion point
  // After the last import statement or at the beginning
  const lines = content.split('\n');
  let insertIndex = 0;
  
  // Find the last import statement
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') || line.startsWith('import{') || line.startsWith('import{')) {
      // Check if this is a multi-line import
      if (line.includes('from') || line.includes('require')) {
        insertIndex = i + 1;
      } else {
        // Multi-line import, find the end
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes("from '") || lines[j].includes('from "') || lines[j].includes("require('") || lines[j].includes('require("')) {
            insertIndex = j + 1;
            break;
          }
        }
      }
    }
  }
  
  // Check if there's a blank line after imports
  if (insertIndex > 0 && lines[insertIndex]?.trim() === '') {
    insertIndex++;
  }
  
  // Insert the dynamic export
  const newLines = [...lines];
  newLines.splice(insertIndex, 0, '', DYNAMIC_EXPORT, '');
  
  const newContent = newLines.join('\n');
  fs.writeFileSync(filePath, newContent, 'utf8');
  
  console.log(`[UPDATED] ${filePath}`);
  return true;
}

function main() {
  console.log('Adding dynamic exports to API routes...\n');
  
  const routeFiles = findRouteFiles(API_DIR);
  console.log(`Found ${routeFiles.length} API route files\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const file of routeFiles) {
    if (addDynamicExport(file)) {
      updated++;
    } else {
      skipped++;
    }
  }
  
  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}

main();
