import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  prepareDependencyWorkspace,
  validateDependencyWorkspace,
} from '../ci-dependency-workspace.mjs';

const roots = [];
const runtime = {
  arch: 'x64',
  nodeVersion: '22.23.2',
  platform: 'linux',
  pnpmVersion: '9.15.9',
};

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-ci-workspace-'));
  roots.push(root);
  for (const path of [
    'apps/web/node_modules/next',
    'node_modules/.bin',
    'node_modules/.pnpm',
    'patches',
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(join(root, '.npmrc'), 'strict-peer-dependencies=false\n');
  writeFileSync(join(root, '.nvmrc'), '22.23.2\n');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@9.15.9' })
  );
  writeFileSync(join(root, 'apps/web/package.json'), '{"name":"web"}\n');
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');
  writeFileSync(join(root, 'patches/example.patch'), 'patched\n');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  writeFileSync(
    join(root, 'node_modules/.pnpm/lock.yaml'),
    'lockfileVersion: 9.0\n'
  );
  writeFileSync(join(root, 'node_modules/.modules.yaml'), 'layoutVersion: 5\n');
  writeFileSync(join(root, 'node_modules/.bin/tsx'), '#!/bin/sh\n');
  return root;
}

describe('merge-group dependency workspace', () => {
  it('accepts an installed tree bound to the exact dependency inputs', () => {
    const root = fixture();
    prepareDependencyWorkspace(root, runtime);
    expect(validateDependencyWorkspace(root, runtime)).toMatchObject(runtime);
  });
  it('rejects changed inputs and an installed lockfile mismatch', () => {
    const root = fixture();
    prepareDependencyWorkspace(root, runtime);
    writeFileSync(join(root, 'apps/web/package.json'), '{"name":"changed"}\n');
    expect(() => validateDependencyWorkspace(root, runtime)).toThrow(
      'dependency workspace receipt mismatch: dependencyInputDigest'
    );
    prepareDependencyWorkspace(root, runtime);
    writeFileSync(join(root, 'node_modules/.pnpm/lock.yaml'), 'changed\n');
    expect(() => validateDependencyWorkspace(root, runtime)).toThrow(
      'installed dependency lock does not match pnpm-lock.yaml'
    );
  });
});
