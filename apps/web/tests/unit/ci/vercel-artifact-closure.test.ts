import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectVercelArtifactClosure,
  verifyVercelArtifactClosure,
} from '../../../../../.github/scripts/vercel-artifact-closure.mjs';

const roots: string[] = [];
const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');

async function fixture(filePathMap: Record<string, string>) {
  const root = join(tmpdir(), `vercel-closure-${crypto.randomUUID()}`);
  roots.push(root);
  const functionDir = join(root, '.vercel/output/functions/example.func');
  await mkdir(functionDir, { recursive: true });
  await writeFile(
    join(functionDir, '.vc-config.json'),
    JSON.stringify({ filePathMap })
  );
  return root;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    roots.splice(0).map(root => rm(root, { force: true, recursive: true }))
  );
});

describe('Vercel artifact dependency closure', () => {
  it('collects only generated .next paths referenced outside the Vercel output', async () => {
    const root = await fixture({
      'apps/web/.next/node_modules/runtime-hash': 'runtime-hash',
      'apps/web/.next/server/chunks/123.js': '123.js',
      'node_modules/package/index.js': 'index.js',
    });

    await expect(collectVercelArtifactClosure(root)).resolves.toEqual([
      'apps/web/.next/node_modules/runtime-hash',
      'apps/web/.next/server/chunks/123.js',
    ]);
  });

  it('classifies missing and dangling generated dependencies before upload', async () => {
    const missingPath = 'apps/web/.next/node_modules/missing-hash';
    const danglingPath = 'apps/web/.next/node_modules/dangling-hash';
    const root = await fixture({
      [danglingPath]: danglingPath,
      [missingPath]: missingPath,
    });
    const danglingAbsolute = join(root, danglingPath);
    await mkdir(join(root, 'apps/web/.next/node_modules'), { recursive: true });
    await symlink('does-not-exist', danglingAbsolute);

    await expect(verifyVercelArtifactClosure(root)).resolves.toEqual({
      missing: [danglingPath, missingPath],
      paths: [danglingPath, missingPath],
    });
  });

  it('accepts a complete generated runtime dependency closure', async () => {
    const runtimePath = 'apps/web/.next/node_modules/runtime-hash';
    const root = await fixture({ [runtimePath]: runtimePath });
    const absolutePath = join(root, runtimePath);
    await mkdir(absolutePath, { recursive: true });
    await writeFile(join(absolutePath, 'index.js'), 'export {};');

    await expect(verifyVercelArtifactClosure(root)).resolves.toEqual({
      missing: [],
      paths: [runtimePath],
    });
  });

  it('packages symlinked runtime dependencies as self-contained files', async () => {
    const runtimePath = 'apps/web/.next/node_modules/runtime-hash';
    const root = await fixture({ [runtimePath]: runtimePath });
    const scriptsDir = join(root, '.github/scripts');
    const packageDir = join(root, 'runtime-package');
    const archivePath = join(root, 'vercel-build-output.tar.gz');
    const restoredRoot = join(root, 'restored');
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'index.js'), 'export {};');
    await mkdir(join(root, 'apps/web/.next/node_modules'), { recursive: true });
    await symlink('../../../../runtime-package', join(root, runtimePath));
    await copyFile(
      join(repoRoot, '.github/scripts/vercel-artifact-closure.mjs'),
      join(scriptsDir, 'vercel-artifact-closure.mjs')
    );
    await copyFile(
      join(repoRoot, '.github/scripts/package-vercel-build-output.sh'),
      join(scriptsDir, 'package-vercel-build-output.sh')
    );

    await execFileAsync(
      'bash',
      ['.github/scripts/package-vercel-build-output.sh', archivePath],
      { cwd: root }
    );
    await mkdir(restoredRoot);
    await execFileAsync('tar', ['-xzf', archivePath, '-C', restoredRoot]);

    const restoredRuntime = join(restoredRoot, runtimePath);
    expect((await lstat(restoredRuntime)).isSymbolicLink()).toBe(false);
    await expect(
      lstat(join(restoredRuntime, 'index.js'))
    ).resolves.toBeDefined();
    await expect(verifyVercelArtifactClosure(restoredRoot)).resolves.toEqual({
      missing: [],
      paths: [runtimePath],
    });
  });
});
