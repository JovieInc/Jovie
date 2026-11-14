// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

it('boots the relocated standalone tree without borrowing react peers from the build checkout', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'visual-standalone-'));
  const app = resolve(root, 'build/apps/web');
  const write = (name: string, content: string) => {
    const file = resolve(app, name);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, content);
  };
  try {
    for (const name of [
      'next',
      '@next/env',
      '@swc/helpers',
      '@statsig/statsig-node-core',
      'require-in-the-middle',
      'react',
      'react-dom',
      'scheduler',
    ]) {
      write(
        `node_modules/${name}/package.json`,
        JSON.stringify({
          name,
          version: '1.0.0',
          main: 'index.js',
          ...(name === 'react-dom'
            ? {
                dependencies: { scheduler: '1.0.0' },
                peerDependencies: { react: '*' },
              }
            : {}),
        })
      );
      write(
        `node_modules/${name}/index.js`,
        name === 'react-dom'
          ? "module.exports = require('react').version + ':' + require('scheduler').version;"
          : "module.exports = { version: '1.0.0' };"
      );
    }
    write('public/fixture.txt', 'public asset');
    write('.next/static/fixture.txt', 'static asset');
    write(
      '.next/standalone/apps/web/server.js',
      "console.log(require('react').version, require('react-dom'));"
    );
    vi.doMock('node:url', async () => {
      const actual =
        await vi.importActual<typeof import('node:url')>('node:url');
      return {
        ...actual,
        fileURLToPath: (url: string | URL) =>
          String(url).endsWith('/sync-standalone-assets.mjs')
            ? resolve(app, 'scripts/sync-standalone-assets.mjs')
            : actual.fileURLToPath(url),
      };
    });
    vi.doMock('node:module', async () => {
      const actual =
        await vi.importActual<typeof import('node:module')>('node:module');
      return {
        ...actual,
        createRequire: (url: string | URL) =>
          actual.createRequire(
            String(url).endsWith('/sync-standalone-assets.mjs')
              ? resolve(app, 'scripts/sync-standalone-assets.mjs')
              : url
          ),
      };
    });
    await import('../../../scripts/sync-standalone-assets.mjs');
    const relocated = resolve(root, 'runtime');
    cpSync(resolve(app, '.next/standalone'), relocated, { recursive: true });
    rmSync(resolve(root, 'build'), { recursive: true, force: true });
    const boot = spawnSync(
      process.execPath,
      [resolve(relocated, 'apps/web/server.js')],
      { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } }
    );
    expect(boot.status, boot.stderr).toBe(0);
    expect(boot.stdout.trim()).toBe('1.0.0 1.0.0:1.0.0');
    expect(
      readFileSync(resolve(relocated, 'apps/web/public/fixture.txt'), 'utf8')
    ).toBe('public asset');
  } finally {
    vi.doUnmock('node:url');
    vi.doUnmock('node:module');
    vi.resetModules();
    rmSync(root, { recursive: true, force: true });
  }
});
