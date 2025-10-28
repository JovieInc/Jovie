#!/usr/bin/env tsx
/**
 * Codemod: Migrate Headless UI Input to shadcn Input + Field
 *
 * Transformations:
 * 1. Import: Input from @/components/atoms/Input → Input, Field from @jovie/ui
 * 2. Props: validationState → variant (error, success)
 * 3. Wrapping: If label/error/helpText exist, wrap in <Field>
 * 4. Props: Move label, error, helpText to Field component
 * 5. Props: Rename helpText → description
 *
 * Examples:
 *   <Input label="Email" error={errors.email} />
 *   → <Field label="Email" error={errors.email}><Input /></Field>
 *
 *   <Input validationState="invalid" />
 *   → <Input variant="error" />
 *
 * Usage:
 *   tsx tools/codemods/migrate-input.ts [path] [--dry-run]
 */

import fs from 'fs';
import { glob } from 'glob';

interface MigrationStats {
  filesScanned: number;
  filesModified: number;
  inputsTransformed: number;
  fieldsCreated: number;
  errors: string[];
}

const stats: MigrationStats = {
  filesScanned: 0,
  filesModified: 0,
  inputsTransformed: 0,
  fieldsCreated: 0,
  errors: [],
};

const isDryRun = process.argv.includes('--dry-run');
const targetPath = process.argv[2] || 'components/**/*.{tsx,ts}';

/**
 * Extract props from JSX element
 */
function extractProps(jsxString: string): Record<string, string | true> {
  const props: Record<string, string | true> = {};

  // Match prop="value" or prop={value} or prop
  const propRegex = /(\w+)(?:=(?:{([^}]+)}|"([^"]+)"))?/g;
  let match;

  while ((match = propRegex.exec(jsxString)) !== null) {
    const [, propName, bracedValue, quotedValue] = match;
    if (bracedValue !== undefined) {
      props[propName] = `{${bracedValue}}`;
    } else if (quotedValue !== undefined) {
      props[propName] = `"${quotedValue}"`;
    } else {
      props[propName] = true;
    }
  }

  return props;
}

/**
 * Build props string from object
 */
function buildPropsString(props: Record<string, string | true>): string {
  return Object.entries(props)
    .map(([key, value]) => {
      if (value === true) return key;
      return `${key}=${value}`;
    })
    .join(' ');
}

/**
 * Transform Input component
 */
function transformInput(inputJsx: string): {
  transformed: string;
  needsField: boolean;
} {
  const props = extractProps(inputJsx);

  // Field-level props (will be moved to Field wrapper)
  const fieldProps: Record<string, string | true> = {};
  const inputProps: Record<string, string | true> = {};

  let needsField = false;

  for (const [key, value] of Object.entries(props)) {
    // Props that go to Field
    if (key === 'label' || key === 'error' || key === 'helpText') {
      fieldProps[key === 'helpText' ? 'description' : key] = value;
      needsField = true;
    }
    // Rename inputClassName → className
    else if (key === 'inputClassName') {
      inputProps.className = value;
    }
    // Transform validationState → variant
    else if (key === 'validationState') {
      // Rename prop to variant, keep expression as-is
      // Note: Developer needs to update values manually: 'invalid'→'error', 'valid'→'success'
      // 'pending' state is not supported (only default/error/success)
      inputProps.variant = value;
    }
    // Props that stay on Input
    else {
      inputProps[key] = value;
    }
  }

  const inputPropsString = buildPropsString(inputProps);
  const transformedInput = `<Input ${inputPropsString}/>`;

  if (needsField) {
    const fieldPropsString = buildPropsString(fieldProps);
    stats.fieldsCreated++;
    return {
      transformed: `<Field ${fieldPropsString}>\n      ${transformedInput}\n    </Field>`,
      needsField: true,
    };
  }

  return { transformed: transformedInput, needsField: false };
}

/**
 * Transform file content
 */
function transformFile(filePath: string, content: string): string | null {
  let modified = content;
  let hasChanges = false;
  let needsFieldImport = false;

  // Skip if file doesn't import Input
  if (!content.includes("from '@/components/atoms/Input'")) {
    return null;
  }

  // 1. Transform import
  const importRegex =
    /import\s+{\s*Input\s*}\s+from\s+['"]@\/components\/atoms\/Input['"]/g;
  if (importRegex.test(content)) {
    // First pass: just replace with Input
    modified = modified.replace(
      importRegex,
      "import { Input } from '@jovie/ui'"
    );
    hasChanges = true;
  }

  // 2. Transform Input usages
  // Match self-closing (including multiline): <Input ... />
  // Use [\s\S] to match any character including newlines
  const selfClosingRegex = /<Input\s+([\s\S]*?)\/>/g;
  modified = modified.replace(selfClosingRegex, (match, propsString) => {
    const { transformed, needsField } = transformInput(propsString);
    if (needsField) needsFieldImport = true;
    stats.inputsTransformed++;
    return transformed;
  });

  // 3. Update import to include Field if needed
  if (needsFieldImport) {
    modified = modified.replace(
      "import { Input } from '@jovie/ui'",
      "import { Input, Field } from '@jovie/ui'"
    );
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
  console.log('🔄 Input → shadcn Input + Field Migration Codemod\n');
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
  console.log(`Inputs transformed: ${stats.inputsTransformed}`);
  console.log(`Fields created: ${stats.fieldsCreated}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors: ${stats.errors.length}`);
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (isDryRun && stats.filesModified > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }

  console.log('\n⚠️  Note: This codemod handles simple cases.');
  console.log('   Manual review recommended for:');
  console.log('   - Complex conditional props');
  console.log('   - Spread operators');
  console.log('   - Refs and special handlers');
}

main().catch(console.error);
