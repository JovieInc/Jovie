import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const RUNTIME_SOURCE_DIRS = [
  'apps/web/app',
  'apps/web/components',
  'packages/ui',
].map(dir => join(REPO_ROOT, dir));
const SWITCH_OWNER = 'packages/ui/atoms/switch.tsx';
const SOURCE_EXT = /\.(tsx|ts)$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry)) {
      out.push(full);
    }
  }
}

describe('Switch canonicalization ratchet', () => {
  it('keeps Radix switch imports isolated to the shared UI owner', () => {
    const files: string[] = [];
    for (const dir of RUNTIME_SOURCE_DIRS) walk(dir, files);

    const violations = files
      .filter(file =>
        readFileSync(file, 'utf8').includes('@radix-ui/react-switch')
      )
      .map(file => relative(REPO_ROOT, file).replaceAll('\\', '/'))
      .filter(file => file !== SWITCH_OWNER);

    expect(violations).toEqual([]);
  });

  it('keeps the Radix switch dependency owned by the shared UI package', () => {
    const webPackage = JSON.parse(
      readFileSync(join(REPO_ROOT, 'apps/web/package.json'), 'utf8')
    );
    const uiPackage = JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/ui/package.json'), 'utf8')
    );

    expect(webPackage.dependencies?.['@radix-ui/react-switch']).toBeUndefined();
    expect(uiPackage.dependencies?.['@radix-ui/react-switch']).toBeDefined();
  });
});
