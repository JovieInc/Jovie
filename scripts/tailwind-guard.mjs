#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

export async function validateTailwindConfig() {
  console.log('🔒 BULLETPROOF TAILWIND CONFIGURATION GUARD');
  console.log('🔍 Validating Tailwind CSS configuration...');

  const errors = [];
  const warnings = [];

  // 1. Check tailwind.config.js exists and has correct structure
  const tailwindConfigPath = join(projectRoot, 'tailwind.config.js');
  if (!existsSync(tailwindConfigPath)) {
    errors.push('❌ CRITICAL: tailwind.config.js is missing');
  } else {
    try {
      const configContent = readFileSync(tailwindConfigPath, 'utf8');

      // Must be .js file (not .ts for v4)
      if (!configContent.includes('module.exports')) {
        errors.push('❌ CRITICAL: tailwind.config.js must use module.exports (not ES6 exports)');
      }

      // Must have content array
      if (!configContent.includes('content:')) {
        errors.push('❌ CRITICAL: tailwind.config.js missing content array');
      }

      // Should not have @config directive
      if (configContent.includes('@config')) {
        errors.push('❌ CRITICAL: tailwind.config.js should not contain @config directive in v4');
      }

      console.log('✅ tailwind.config.js structure valid');
    } catch (err) {
      errors.push(`❌ CRITICAL: Error reading tailwind.config.js: ${err.message}`);
    }
  }

  // 2. CRITICAL: PostCSS Configuration Validation
  const postcssPaths = [
    join(projectRoot, 'postcss.config.js'),
    join(projectRoot, 'postcss.config.mjs')
  ];

  let postcssFound = false;
  for (const postcssPath of postcssPaths) {
    if (existsSync(postcssPath)) {
      postcssFound = true;
      try {
        const postcssContent = readFileSync(postcssPath, 'utf8');

        // CRITICAL: Must use @tailwindcss/postcss for v4 (not 'tailwindcss')
        if (!postcssContent.includes('@tailwindcss/postcss')) {
          errors.push('❌ CRITICAL: postcss.config must use "@tailwindcss/postcss" plugin');
        }

        // CRITICAL: Must NOT use 'tailwindcss' directly
        if (postcssContent.includes('tailwindcss:') && !postcssContent.includes('@tailwindcss/postcss')) {
          errors.push('❌ CRITICAL: postcss.config using "tailwindcss" directly - THIS BREAKS THE BUILD');
        }

        // Validate exact format
        if (!postcssContent.includes("'@tailwindcss/postcss': {}") && !postcssContent.includes('"@tailwindcss/postcss": {}')) {
          errors.push('❌ CRITICAL: postcss.config must use exact format: "@tailwindcss/postcss": {}');
        }

        // Should include autoprefixer
        if (!postcssContent.includes('autoprefixer')) {
          warnings.push('⚠️  postcss.config missing autoprefixer (recommended)');
        }

        console.log('✅ PostCSS configuration valid');
      } catch (err) {
        errors.push(`❌ CRITICAL: Error reading PostCSS config: ${err.message}`);
      }
      break;
    }
  }

  if (!postcssFound) {
    errors.push('❌ CRITICAL: PostCSS configuration file missing');
  }

  // 3. Check globals.css
  const globalsCssPath = join(projectRoot, 'app/globals.css');
  if (!existsSync(globalsCssPath)) {
    errors.push('❌ CRITICAL: app/globals.css is missing');
  } else {
    try {
      const cssContent = readFileSync(globalsCssPath, 'utf8');

      // Must import tailwindcss
      if (!cssContent.includes('@import "tailwindcss"')) {
        errors.push('❌ CRITICAL: app/globals.css missing @import "tailwindcss"');
      }

      // CRITICAL: Check for incorrect theme import path
      if (cssContent.includes('@import "./theme.css"')) {
        errors.push('❌ CRITICAL: app/globals.css has incorrect theme import path (should be "../styles/theme.css")');
      }

      if (cssContent.includes('@import "../styles/theme.css"')) {
        console.log('✅ globals.css theme import path correct');
      } else {
        errors.push('❌ CRITICAL: app/globals.css missing theme import or incorrect path');
      }

      console.log('✅ globals.css structure valid');
    } catch (err) {
      errors.push(`❌ CRITICAL: Error reading globals.css: ${err.message}`);
    }
  }

  // 4. Check styles/theme.css exists
  const themeCssPath = join(projectRoot, 'styles/theme.css');
  if (!existsSync(themeCssPath)) {
    errors.push('❌ CRITICAL: styles/theme.css is missing');
  } else {
    console.log('✅ styles/theme.css exists');
  }

  // 5. CRITICAL: Check package.json for correct dependencies
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageContent = readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageContent);

      // Check for @tailwindcss/postcss dependency
      const hasTailwindPostcss =
        packageJson.dependencies?.['@tailwindcss/postcss'] ||
        packageJson.devDependencies?.['@tailwindcss/postcss'];

      if (!hasTailwindPostcss) {
        errors.push('❌ CRITICAL: @tailwindcss/postcss dependency missing from package.json');
      } else {
        console.log('✅ @tailwindcss/postcss dependency found');
      }
    } catch (err) {
      errors.push(`❌ CRITICAL: Error reading package.json: ${err.message}`);
    }
  }

  // 6. Check for multiple config files (causes conflicts)
  const tailwindConfigs = await glob('tailwind.config.*', {
    cwd: projectRoot,
    ignore: 'node_modules/**'
  });

  if (tailwindConfigs.length > 1) {
    errors.push(`❌ CRITICAL: Multiple Tailwind configs found: ${tailwindConfigs.join(', ')}`);
  }

  // 7. Check for multiple globals.css files
  const globalsFiles = await glob('**/*globals.css', {
    cwd: projectRoot,
    ignore: 'node_modules/**'
  });

  const tailwindImports = [];
  globalsFiles.forEach(file => {
    try {
      const content = readFileSync(join(projectRoot, file), 'utf8');
      if (content.includes('@import "tailwindcss"') || content.includes("@import 'tailwindcss'")) {
        tailwindImports.push(file);
      }
    } catch {
      // Ignore files that can't be read
    }
  });

  if (tailwindImports.length > 1) {
    errors.push(`❌ CRITICAL: Multiple files importing Tailwind: ${tailwindImports.join(', ')}`);
  }

  // Report results
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(warning => console.log(`  ${warning}`));
  }

  if (errors.length === 0) {
    console.log('\n🎉 ALL TAILWIND CONFIGURATION CHECKS PASSED!');
    console.log('🔒 Configuration is LOCKED and BULLETPROOF.');
    console.log('🛡️  Protected against future breakage.');
    return true;
  } else {
    console.log('\n💥 CRITICAL TAILWIND CONFIGURATION ERRORS:');
    errors.forEach(error => console.log(`  ${error}`));
    console.log('\n🚨 BUILD WILL FAIL until these are resolved!');
    console.log('🔧 Fix these immediately to restore functionality.');
    return false;
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const isValid = await validateTailwindConfig();
  process.exit(isValid ? 0 : 1);
}