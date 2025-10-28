#!/usr/bin/env tsx
/**
 * Codemod: Migrate FrostedButton to Button with variant prop
 *
 * Transformations:
 * 1. Import: FrostedButton from @/components/atoms/FrostedButton -> Button from @jovie/ui
 * 2. Component: <FrostedButton> -> <Button variant="frosted">
 * 3. Props: frostedStyle="ghost" -> variant="frosted-ghost"
 * 4. Props: frostedStyle="outline" -> variant="frosted-outline"
 * 5. Props: shape -> className (rounded-full, rounded-none)
 *
 * Usage:
 *   tsx tools/codemods/migrate-frosted-button.ts [path] [--dry-run]
 */

import fs from 'fs';
import { glob } from 'glob';

interface MigrationStats {
  filesScanned: number;
  filesModified: number;
  transformations: number;
  errors: string[];
}

const stats: MigrationStats = {
  filesScanned: 0,
  filesModified: 0,
  transformations: 0,
  errors: [],
};

const isDryRun = process.argv.includes('--dry-run');
const targetPath = process.argv[2] || 'components/**/*.{tsx,ts}';

/**
 * Transform FrostedButton component to Button with variant
 */
function transformFile(filePath: string, content: string): string | null {
  let modified = content;
  let hasChanges = false;

  // 1. Transform import statement
  const importRegex =
    /import\s+{\s*FrostedButton\s*(?:,\s*type\s+FrostedButtonProps\s*)?\}\s+from\s+['"]@\/components\/atoms\/FrostedButton['"]/g;
  if (importRegex.test(content)) {
    modified = modified.replace(
      importRegex,
      "import { Button, type ButtonProps } from '@jovie/ui'"
    );
    hasChanges = true;
    stats.transformations++;
  }

  // 2. Transform component usage
  // Handle self-closing tags: <FrostedButton ... />
  const selfClosingRegex = /<FrostedButton\s+([^>]*?)\/>/g;
  modified = modified.replace(selfClosingRegex, (match, props) => {
    hasChanges = true;
    stats.transformations++;
    return transformFrostedButtonProps(`<Button ${props}/>`, props);
  });

  // Handle opening tags: <FrostedButton ...>
  const openingRegex = /<FrostedButton(\s+[^>]*?)?>/g;
  modified = modified.replace(openingRegex, (match, props) => {
    hasChanges = true;
    stats.transformations++;
    return transformFrostedButtonProps(`<Button${props || ''}>`, props || '');
  });

  // Handle closing tags
  modified = modified.replace(/<\/FrostedButton>/g, '</Button>');

  // 3. Transform type references
  modified = modified.replace(/FrostedButtonProps/g, 'ButtonProps');

  return hasChanges ? modified : null;
}

/**
 * Transform FrostedButton props to Button props with variant
 */
function transformFrostedButtonProps(buttonTag: string, props: string): string {
  let transformedProps = props;

  // Extract frostedStyle prop
  const frostedStyleMatch = props.match(/frostedStyle=["'](\w+)["']/);
  const frostedStyle = frostedStyleMatch ? frostedStyleMatch[1] : 'default';

  // Extract shape prop
  const shapeMatch = props.match(/shape=["'](\w+)["']/);
  const shape = shapeMatch ? shapeMatch[1] : null;

  // Remove frostedStyle and shape props
  transformedProps = transformedProps.replace(
    /\s*frostedStyle=["']\w+["']/g,
    ''
  );
  transformedProps = transformedProps.replace(/\s*shape=["']\w+["']/g, '');

  // Map frostedStyle to variant
  const variantMap: Record<string, string> = {
    default: 'frosted',
    ghost: 'frosted-ghost',
    outline: 'frosted-outline',
  };
  const variant = variantMap[frostedStyle] || 'frosted';

  // Add variant prop
  transformedProps = `variant="${variant}" ${transformedProps}`;

  // Handle shape prop -> className
  if (shape && shape !== 'default') {
    const shapeClassName = shape === 'circle' ? 'rounded-full' : 'rounded-none';

    // Check if className already exists
    const classNameMatch = transformedProps.match(/className=["']([^"']*)["']/);
    if (classNameMatch) {
      // Append to existing className
      const existingClassName = classNameMatch[1];
      transformedProps = transformedProps.replace(
        /className=["']([^"']*)["']/,
        `className="${existingClassName} ${shapeClassName}"`
      );
    } else {
      // Add new className
      transformedProps = `className="${shapeClassName}" ${transformedProps}`;
    }
  }

  return buttonTag.replace(
    /(<Button)(\s+[^>]*?)?([/>])/,
    `$1 ${transformedProps.trim()}$3`
  );
}

/**
 * Process a single file
 */
async function processFile(filePath: string): Promise<void> {
  try {
    stats.filesScanned++;

    const content = fs.readFileSync(filePath, 'utf-8');

    // Skip if file doesn't use FrostedButton
    if (!content.includes('FrostedButton')) {
      return;
    }

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
  console.log('🔄 FrostedButton → Button Migration Codemod\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'WRITE'}`);
  console.log(`Pattern: ${targetPath}\n`);

  const files = await glob(targetPath, {
    ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**'],
  });

  console.log(`Found ${files.length} files to scan\n`);

  for (const file of files) {
    await processFile(file);
  }

  console.log('\n📊 Migration Summary:');
  console.log(`Files scanned: ${stats.filesScanned}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Transformations: ${stats.transformations}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors: ${stats.errors.length}`);
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (isDryRun && stats.filesModified > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

main().catch(console.error);
