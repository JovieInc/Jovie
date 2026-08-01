import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareWorkspaceSpecifiers,
  formatMismatches,
} from '../../lockfile-specifier-preflight.mjs';

const tempRoots = [];
afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(
  lockfile,
  manifest = { devDependencies: { typescript: '^6.0.3', vitest: '4.1.8' } }
) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-lockfile-preflight-'));
  tempRoots.push(root);
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n"
  );
  writeFileSync(join(root, 'package.json'), '{}\n');
  mkdirPackage(root, 'packages/audio-contracts', manifest);
  return { root, lockfile };
}

function mkdirPackage(root, packagePath, manifest) {
  const directory = join(root, packagePath);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
}

describe('lockfile importer specifier preflight', () => {
  it('accepts matching workspace manifest specifiers', () => {
    const { root, lockfile } = fixture(
      `lockfileVersion: '9.0'\n\nimporters:\n  .:\n  packages/audio-contracts:\n    devDependencies:\n      typescript:\n        specifier: ^6.0.3\n      vitest:\n        specifier: 4.1.8\n`
    );
    expect(compareWorkspaceSpecifiers({ root, lockfile })).toEqual([]);
  });

  it('reports the exact package path and mismatched keys', () => {
    const { root, lockfile } = fixture(
      `lockfileVersion: '9.0'\n\nimporters:\n  .:\n  packages/audio-contracts:\n    devDependencies:\n      typescript:\n        specifier: ^5.9.0\n      vitest:\n        specifier: 4.1.8\n`
    );
    const mismatches = compareWorkspaceSpecifiers({ root, lockfile });
    expect(mismatches).toEqual([
      {
        packagePath: 'packages/audio-contracts',
        key: 'devDependencies:typescript',
        expected: '^6.0.3',
        actual: '^5.9.0',
      },
    ]);
    expect(formatMismatches(mismatches)).toContain(
      '- packages/audio-contracts: devDependencies:typescript (manifest="^6.0.3", lockfile="^5.9.0")'
    );
  });

  it('fails closed when an importer dependency key is absent', () => {
    const { root, lockfile } = fixture(
      `lockfileVersion: '9.0'\n\nimporters:\n  .:\n  packages/audio-contracts:\n    devDependencies:\n      typescript:\n        specifier: ^6.0.3\n`
    );
    const mismatches = compareWorkspaceSpecifiers({ root, lockfile });
    expect(mismatches).toEqual([
      {
        packagePath: 'packages/audio-contracts',
        key: 'devDependencies:vitest',
        expected: '4.1.8',
        actual: 'missing',
      },
    ]);
  });

  it('returns a failing process with actionable output for a stale importer', () => {
    const { root, lockfile } = fixture(
      `lockfileVersion: '9.0'\n\nimporters:\n  .:\n  packages/audio-contracts:\n    devDependencies:\n      typescript:\n        specifier: ^5.9.0\n      vitest:\n        specifier: 4.1.8\n`
    );
    writeFileSync(join(root, 'pnpm-lock.yaml'), lockfile);
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), 'scripts', 'lockfile-specifier-preflight.mjs')],
      {
        cwd: process.cwd(),
        env: { ...process.env, JOVIE_REPO_ROOT: root },
        encoding: 'utf8',
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '- packages/audio-contracts: devDependencies:typescript (manifest="^6.0.3", lockfile="^5.9.0")'
    );
  });

  it('honors negated workspace package paths like !apps/eve-pilot', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-lockfile-preflight-'));
    tempRoots.push(root);
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - '!apps/eve-pilot'\n  - 'packages/*'\n"
    );
    writeFileSync(join(root, 'package.json'), '{}\n');
    mkdirPackage(root, 'apps/web', {
      dependencies: { next: '15.0.0' },
    });
    mkdirPackage(root, 'apps/eve-pilot', {
      dependencies: { '@openai/agents': '0.1.0' },
    });
    mkdirPackage(root, 'packages/audio-contracts', {
      devDependencies: { typescript: '^6.0.3' },
    });
    const lockfile = `lockfileVersion: '9.0'\n\nimporters:\n  .:\n  apps/web:\n    dependencies:\n      next:\n        specifier: 15.0.0\n  packages/audio-contracts:\n    devDependencies:\n      typescript:\n        specifier: ^6.0.3\n`;
    expect(compareWorkspaceSpecifiers({ root, lockfile })).toEqual([]);
  });
});
