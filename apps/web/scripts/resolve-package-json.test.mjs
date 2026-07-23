import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePackageJson } from './resolve-package-json.mjs';

const requireFromTest = createRequire(import.meta.url);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('resolvePackageJson', () => {
  it('uses an exported package metadata subpath when package.json and the root are not exported', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-package-export-'));
    temporaryRoots.push(root);
    const packageRoot = path.join(root, 'node_modules', '@fixture', 'runtime');
    const packageJsonPath = path.join(packageRoot, 'package.json');
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      packageJsonPath,
      JSON.stringify({
        name: '@fixture/runtime',
        version: '1.0.0',
        exports: { './package': './package.json' },
      })
    );

    expect(
      realpathSync(
        resolvePackageJson(requireFromTest, '@fixture/runtime', [root])
      )
    ).toBe(realpathSync(packageJsonPath));
  });
});
