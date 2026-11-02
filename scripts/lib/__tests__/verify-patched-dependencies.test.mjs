import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyPatchedDependencies } from '../verify-patched-dependencies.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const PATCH = `diff --git a/download.js b/download.js
--- a/download.js
+++ b/download.js
@@ -1 +1 @@
-fs.access(p, fs.R_OK, cb)
+fs.access(p, fs.constants.R_OK, cb)
`;

function fixture(linkTo) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-patched-deps-'));
  roots.push(root);
  mkdirSync(join(root, 'patches'));
  writeFileSync(join(root, 'patches/p.patch'), PATCH);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      pnpm: {
        patchedDependencies: { 'prebuild-install@7.1.3': 'patches/p.patch' },
      },
    })
  );
  const store = join(root, 'node_modules/.pnpm');
  const make = (dir, source) => {
    const pkg = join(store, dir, 'node_modules/prebuild-install');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"version":"7.1.3"}');
    writeFileSync(join(pkg, 'download.js'), source);
    return pkg;
  };
  const stale = make('prebuild-install@7.1.3', 'fs.access(p, fs.R_OK, cb)\n');
  const patched = make(
    'prebuild-install@7.1.3_patch_hash=abc',
    'fs.access(p, fs.constants.R_OK, cb)\n'
  );
  const dependent = join(store, 'better-sqlite3@12.10.0/node_modules');
  mkdirSync(dependent, { recursive: true });
  symlinkSync(
    linkTo === 'stale' ? stale : patched,
    join(dependent, 'prebuild-install')
  );
  return root;
}

describe('verifyPatchedDependencies', () => {
  it('passes when dependents link the patched copy, even if an orphan unpatched copy remains', () => {
    expect(verifyPatchedDependencies(fixture('patched'))).toEqual([]);
  });

  it('names the patch and file when a dependent still links the unpatched copy', () => {
    const problems = verifyPatchedDependencies(fixture('stale'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('prebuild-install@7.1.3');
    expect(problems[0]).toContain('patches/p.patch is not applied');
    expect(problems[0]).toContain('fs.constants.R_OK');
  });
});
