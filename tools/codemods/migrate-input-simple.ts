#!/usr/bin/env tsx
/**
 * Codemod: Migrate Headless UI Input to shadcn Input (Simple/Safe Version)
 *
 * Transformations:
 * 1. Import: Input from @/components/atoms/Input → Input from @jovie/ui
 * 2. Add TODO comment for manual migration
 *
 * Manual migration needed for:
 * - inputClassName → className
 * - validationState → variant (invalid→error, valid→success, pending→remove)
 * - Wrapping with Field if label/error/description props exist
 *
 * Usage:
 *   tsx tools/codemods/migrate-input-simple.ts [path] [--dry-run]
 */

import fs from 'fs';
import { glob } from 'glob';

interface MigrationStats {
  filesScanned: number;
  filesModified: number;
  errors: string[];
}

const stats: MigrationStats = {
  filesScanned: 0,
  filesModified: 0,
  errors: [],
};

const isDryRun = process.argv.includes('--dry-run');
const targetPath = process.argv[2] || 'components/**/*.{tsx,ts}';

/**
 * Transform file content - only safe transformations
 */
function transformFile(filePath: string, content: string): string | null {
  let modified = content;
  let hasChanges = false;

  // Skip if file doesn't import Input from old location
  const oldImportRegex =
    /import\s+{[^}]*Input[^}]*}\s+from\s+['"]@\/components\/atoms\/Input['"]/;
  if (!oldImportRegex.test(content)) {
    return null;
  }

  // 1. Transform import statement
  const importRegex =
    /import\s+{([^}]*)}\s+from\s+['"]@\/components\/atoms\/Input['"]/g;
  modified = modified.replace(importRegex, (match, imports) => {
    hasChanges = true;
    // Preserve other imports, just change the source
    return `import {${imports}} from '@jovie/ui'`;
  });

  // 2. Add migration TODO comment if Input is used
  if (/<Input\s+/.test(content) && hasChanges) {
    // Find the first Input usage and add a comment above it
    const inputUsageRegex = /(\s*)<Input\s+/;
    const hasInputUsage = inputUsageRegex.test(modified);

    if (hasInputUsage && !modified.includes('TODO: Migrate Input props')) {
      modified = modified.replace(inputUsageRegex, (match, whitespace) => {
        return `${whitespace}{/* TODO: Migrate Input props:
${whitespace}   - inputClassName → className
${whitespace}   - validationState → variant (invalid→error, valid→success)
${whitespace}   - Wrap with <Field label error description> if needed
${whitespace}   - See: packages/ui/atoms/input.tsx for new API */}
${whitespace}<Input `;
      });
    }
  }

  return hasChanges ? modified : null;
}

/**
 * Process a single file
 */
async function processFile(filePath: string): Promise<void> {
  try {
    stats.filesScanned++;

    const content = fs.readFileSync(filePath, 'utf-8');
    const transformed = transformFile(filePath, content);

    if (transformed) {
      if (isDryRun) {
        console.log(`[DRY RUN] Would modify: ${filePath}`);
      } else {
        fs.writeFileSync(filePath, transformed, 'utf-8');
        console.log(`✓ Modified: ${filePath}`);
      }
      stats.filesModified++;
    }
  } catch (error) {
    const errorMsg = `Error processing ${filePath}: ${error}`;
    stats.errors.push(errorMsg);
    console.error(`✗ ${errorMsg}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Input → shadcn Input Migration Codemod (Safe Version)\\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'WRITE'}`);
  console.log(`Pattern: ${targetPath}\\n`);

  const files = await glob(targetPath, {
    ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**'],
  });

  console.log(`Found ${files.length} files to scan\\n`);

  for (const file of files) {
    await processFile(file);
  }

  console.log('\\n📊 Migration Summary:');
  console.log(`Files scanned: ${stats.filesScanned}`);
  console.log(`Files modified: ${stats.filesModified}`);

  if (stats.errors.length > 0) {
    console.log(`\\n❌ Errors: ${stats.errors.length}`);
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (isDryRun && stats.filesModified > 0) {
    console.log('\\n💡 Run without --dry-run to apply changes');
  }

  console.log('\\n⚠️  Note: This codemod only updates imports.');
  console.log('   Manual prop migration required for each Input usage.');
  console.log('   See TODO comments added to each file.');
}

main().catch(console.error);
