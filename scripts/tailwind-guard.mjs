#!/usr/bin/env node

import fs from 'fs';
import glob from 'glob';

console.log('🔍 Tailwind Guard - Checking for config violations...');

let errors = 0;

// Check for multiple globals.css files with @import "tailwindcss"
const globalsFiles = glob.sync('**/*globals.css', { ignore: 'node_modules/**' });
const tailwindImports = [];

globalsFiles.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('@import "tailwindcss"') || content.includes("@import 'tailwindcss'")) {
      tailwindImports.push(file);
    }
  } catch {
    // Ignore files that can't be read
  }
});

if (tailwindImports.length > 1) {
  console.error(`❌ Found multiple globals.css files with Tailwind imports:`);
  tailwindImports.forEach(file => console.error(`   - ${file}`));
  console.error(`   Only app/globals.css should contain @import "tailwindcss"`);
  errors++;
} else if (tailwindImports.length === 1) {
  console.log(`✅ Found single Tailwind import in: ${tailwindImports[0]}`);
} else {
  console.error(`❌ No Tailwind imports found in any globals.css file`);
  errors++;
}

// Check for multiple tailwind.config.* files
const tailwindConfigs = glob.sync('tailwind.config.*', { ignore: 'node_modules/**' });

if (tailwindConfigs.length > 1) {
  console.error(`❌ Found multiple Tailwind config files:`);
  tailwindConfigs.forEach(file => console.error(`   - ${file}`));
  console.error(`   Only one tailwind.config.ts should exist`);
  errors++;
} else if (tailwindConfigs.length === 1) {
  console.log(`✅ Found single Tailwind config: ${tailwindConfigs[0]}`);
} else {
  console.error(`❌ No Tailwind config file found`);
  errors++;
}

// Check for globals.css imports outside app/layout.tsx
const otherTsxFiles = glob.sync('**/*.{ts,tsx}', { 
  ignore: ['node_modules/**', 'app/layout.tsx', 'tests/**', '.storybook/**'] 
});

const badImports = [];
otherTsxFiles.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('import') && content.includes('globals.css')) {
      badImports.push(file);
    }
  } catch {
    // Ignore files that can't be read
  }
});

if (badImports.length > 0) {
  console.error(`❌ Found globals.css imports outside of app/layout.tsx:`);
  badImports.forEach(file => console.error(`   - ${file}`));
  console.error(`   globals.css should only be imported in app/layout.tsx`);
  errors++;
} else {
  console.log(`✅ No invalid globals.css imports found`);
}

// Summary
if (errors === 0) {
  console.log('\n✅ All Tailwind configuration checks passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${errors} configuration violation(s) found`);
  process.exit(1);
}