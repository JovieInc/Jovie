import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProfileModeQueryRewrite } from '../lib/routing/profile-publication-edge';
import { writeProfileModePrerenderSet } from './write-profile-mode-prerender-set.mjs';

const { neon, sql } = vi.hoisted(() => ({ neon: vi.fn(), sql: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon }));
vi.mock('@/lib/profile/publication-read', () => ({
  readProfilePublished: vi.fn(),
}));
const scriptDir = dirname(fileURLToPath(import.meta.url));
const roots = [];
const databaseUrl = 'postgresql://build.invalid/profiles';
const allKeys = [
  'dualipa:listen',
  'dualipa:subscribe',
  'dualipa:releases',
  'dualipa:tour',
  'testartist:pay',
];

function outputPath() {
  const root = mkdtempSync(join(tmpdir(), 'profile-mode-prerender-'));
  roots.push(root);
  return join(root, 'generated', 'prerender-set.ts');
}

async function generatedKeys(path) {
  return (await import(pathToFileURL(path).href)).PROFILE_MODE_PRERENDERED_KEYS;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DATABASE_POOLING_URL', databaseUrl);
  neon.mockReturnValue(sql);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('build profile mode prerender set', () => {
  it.each(['', '   '])(
    'keeps mode requests canonical without DATABASE_URL (%j)',
    async url => {
      vi.stubEnv('DATABASE_URL', url);
      const path = outputPath();
      await writeProfileModePrerenderSet(path);
      const keys = await generatedKeys(path);
      expect(keys).toEqual([]);
      expect(neon).not.toHaveBeenCalled();
      for (const key of allKeys) {
        const [username, mode] = key.split(':');
        expect(
          getProfileModeQueryRewrite(
            {
              method: 'GET',
              nextUrl: new URL(`https://jov.ie/${username}?mode=${mode}`),
            },
            new Set(keys)
          )
        ).toBeNull();
      }
    }
  );

  it('uses the trimmed build database and emits the complete public alias budget', async () => {
    vi.stubEnv('DATABASE_URL', ` ${databaseUrl} `);
    sql.mockResolvedValue([
      { username_normalized: 'DUALIPA', is_public: true },
      { username_normalized: 'testartist', is_public: true },
      { username_normalized: 'outside-budget', is_public: true },
    ]);
    const path = outputPath();
    await writeProfileModePrerenderSet(path);
    expect(neon).toHaveBeenCalledWith(databaseUrl);
    expect(sql.mock.calls[0][1]).toEqual(['dualipa', 'testartist']);
    const keys = await generatedKeys(path);
    expect(keys).toEqual(allKeys);
    const rewrite = getProfileModeQueryRewrite(
      {
        method: 'GET',
        nextUrl: new URL('https://jov.ie/dualipa?mode=listen'),
      },
      new Set(keys)
    );
    expect(rewrite?.headers.get('x-middleware-rewrite')).toBe(
      'https://jov.ie/dualipa/profile-mode-render/listen/__profile-mode-alias'
    );
  });

  it('excludes private, missing and non-boolean publication rows', async () => {
    vi.stubEnv('DATABASE_URL', databaseUrl);
    sql.mockResolvedValue([
      { username_normalized: 'dualipa', is_public: true },
      { username_normalized: 'testartist', is_public: false },
      { username_normalized: 'testartist', is_public: 'true' },
    ]);
    const path = outputPath();
    await writeProfileModePrerenderSet(path);
    expect(await generatedKeys(path)).toEqual(allKeys.slice(0, 4));
    sql.mockResolvedValue([]);
    const missingPath = outputPath();
    await writeProfileModePrerenderSet(missingPath);
    expect(await generatedKeys(missingPath)).toEqual([]);
  });

  it.each([new Error('build database unavailable'), 'connection refused'])(
    'replaces an earlier set with an empty fallback when the database fails (%s)',
    async error => {
      vi.stubEnv('DATABASE_URL', databaseUrl);
      const path = outputPath();
      sql.mockResolvedValue([
        { username_normalized: 'testartist', is_public: true },
      ]);
      await writeProfileModePrerenderSet(path);
      sql.mockRejectedValue(error);
      await writeProfileModePrerenderSet(path);
      // Load a fresh module URL to observe the replacement on disk.
      expect(await generatedKeys(path)).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('build database unreachable'),
        error instanceof Error ? error.message : error
      );
    }
  );

  it('executes the real build CLI and writes an importable empty module without a database', async () => {
    const root = dirname(dirname(outputPath()));
    mkdirSync(join(root, 'scripts'));
    symlinkSync(
      resolve(scriptDir, '../node_modules'),
      join(root, 'node_modules'),
      'dir'
    );
    const script = join(root, 'scripts/write-profile-mode-prerender-set.mjs');
    copyFileSync(
      join(scriptDir, 'write-profile-mode-prerender-set.mjs'),
      script
    );
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: '',
        DATABASE_POOLING_URL: databaseUrl,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      await generatedKeys(
        join(root, 'lib/routing/generated/profile-mode-prerender-set.ts')
      )
    ).toEqual([]);
  });
});
