# Codemods for UI Migration

Automated code transformation scripts for migrating to shadcn/ui primitives.

## Available Codemods

### 1. `migrate-frosted-button.ts`

Migrates `FrostedButton` to `Button` with `variant` prop.

**Transformations:**
- `<FrostedButton>` → `<Button variant="frosted">`
- `frostedStyle="ghost"` → `variant="frosted-ghost"`
- `frostedStyle="outline"` → `variant="frosted-outline"`
- `shape="circle"` → `className="rounded-full"`
- `shape="square"` → `className="rounded-none"`
- Import paths updated to `@jovie/ui`

**Usage:**
```bash
# Dry run (preview changes)
tsx tools/codemods/migrate-frosted-button.ts --dry-run

# Apply to specific directory
tsx tools/codemods/migrate-frosted-button.ts "components/dashboard/**/*.tsx" --dry-run

# Apply changes
tsx tools/codemods/migrate-frosted-button.ts

# Apply to specific files
tsx tools/codemods/migrate-frosted-button.ts "components/dashboard/**/*.tsx"
```

**Example:**

Before:
```tsx
import { FrostedButton } from '@/components/atoms/FrostedButton';

<FrostedButton frostedStyle="ghost" shape="circle" onClick={handleClick}>
  Click me
</FrostedButton>
```

After:
```tsx
import { Button } from '@jovie/ui';

<Button variant="frosted-ghost" className="rounded-full" onClick={handleClick}>
  Click me
</Button>
```

---

## Running Codemods

### Prerequisites
```bash
pnpm install tsx -D
```

### Workflow

1. **Always dry-run first:**
   ```bash
   tsx tools/codemods/[codemod-name].ts --dry-run
   ```

2. **Review the changes** that will be made

3. **Apply the codemod:**
   ```bash
   tsx tools/codemods/[codemod-name].ts
   ```

4. **Test the changes:**
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

5. **Commit:**
   ```bash
   git add .
   git commit -m "refactor: migrate [component] to shadcn pattern"
   ```

---

## Creating New Codemods

### Template

```typescript
#!/usr/bin/env tsx
/**
 * Codemod: [Description]
 *
 * Transformations:
 * 1. [Transformation 1]
 * 2. [Transformation 2]
 *
 * Usage:
 *   tsx tools/codemods/[name].ts [path] [--dry-run]
 */

import fs from 'fs';
import { glob } from 'glob';

const isDryRun = process.argv.includes('--dry-run');
const targetPath = process.argv[2] || 'components/**/*.{tsx,ts}';

function transformFile(filePath: string, content: string): string | null {
  // Your transformation logic here
  return modifiedContent;
}

async function main() {
  const files = await glob(targetPath, {
    ignore: ['node_modules/**', '.next/**'],
  });

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const transformed = transformFile(file, content);

    if (transformed) {
      if (!isDryRun) {
        fs.writeFileSync(file, transformed, 'utf-8');
      }
      console.log(`${isDryRun ? '[DRY RUN]' : '✓'} ${file}`);
    }
  }
}

main().catch(console.error);
```

---

## Best Practices

1. **Always run dry-run first** - Preview changes before applying
2. **Test incrementally** - Apply to one directory at a time
3. **Commit often** - Commit after each successful codemod
4. **Review manually** - Always review the diff before committing
5. **Run tests** - Ensure typecheck, lint, and tests pass
6. **Keep backups** - Git should have uncommitted changes backed up

---

## Troubleshooting

### "Command not found: tsx"
```bash
pnpm install tsx -D
```

### "Pattern matched no files"
Check your glob pattern. Try absolute path or simpler pattern:
```bash
tsx tools/codemods/[name].ts "components/atoms/*.tsx"
```

### "Permission denied"
Make the script executable:
```bash
chmod +x tools/codemods/[name].ts
```

### Codemod made incorrect changes
Revert and run dry-run to debug:
```bash
git restore .
tsx tools/codemods/[name].ts --dry-run
```

---

## Future Codemods

Planned codemods for remaining migration phases:

- `migrate-input.ts` - Headless UI Input → shadcn Input
- `migrate-select.ts` - Native Select → Radix Select
- `consolidate-imports.ts` - Consolidate all imports to @jovie/ui
- `migrate-cta-button.ts` - CTAButton wrapper → Button behavior
- `remove-deprecated.ts` - Remove deprecated component files

---

**Last Updated:** 2025-10-28
