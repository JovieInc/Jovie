import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { afterEach, describe, expect, it } from 'vitest';
import { REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS } from '@/lib/readiness/signup-onboarding';
import { reconcileVercelBuildEnv } from './reconcile-vercel-build-env';

const roots: string[] = [];

function fixture(): string {
  const root = resolve(
    tmpdir(),
    `jovie-vercel-build-env-${process.pid}-${roots.length}`
  );
  rmSync(root, { force: true, recursive: true });
  mkdirSync(root, { mode: 0o700 });
  roots.push(root);
  return root;
}

function canonicalEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS.map((key, index) => [
      key,
      key === 'BETTER_AUTH_URL' || key === 'NEXT_PUBLIC_BETTER_AUTH_URL'
        ? 'https://jov.ie'
        : `value-${index}_with-safe.punctuation:/?@%+=,`,
    ])
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('reconcileVercelBuildEnv', () => {
  it('atomically makes canonical process values authoritative and preserves unrelated values', () => {
    const root = fixture();
    const path = resolve(root, 'production.env');
    writeFileSync(
      path,
      'NEXT_PUBLIC_BETTER_AUTH_URL="not a url"\nUNRELATED_VERCEL_VALUE="keep me"\n',
      { mode: 0o644 }
    );
    const env = canonicalEnv();

    expect(reconcileVercelBuildEnv(path, env)).toBe(
      REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS.length
    );

    const parsed = parse(readFileSync(path));
    expect(parsed.UNRELATED_VERCEL_VALUE).toBe('keep me');
    for (const key of REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS) {
      expect(parsed[key], key).toBe(env[key]);
    }
    expect(Number(lstatSync(path).mode & 0o777)).toBe(0o600);
    expect(readdirSync(root)).toEqual(['production.env']);
  });

  it('fails closed without replacing the file when a canonical value is missing', () => {
    const root = fixture();
    const path = resolve(root, 'production.env');
    const original = 'UNRELATED_VERCEL_VALUE="keep me"\n';
    writeFileSync(path, original);
    const env = canonicalEnv();
    delete env.SESSION_SECRET;

    expect(() => reconcileVercelBuildEnv(path, env)).toThrow(
      'Missing canonical build environment value: SESSION_SECRET'
    );
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(readdirSync(root)).toEqual(['production.env']);
  });

  it('fails closed without replacing the file when a value is unsafe to serialize', () => {
    const root = fixture();
    const path = resolve(root, 'production.env');
    const original = 'UNRELATED_VERCEL_VALUE="keep me"\n';
    writeFileSync(path, original);
    const env = canonicalEnv();
    env.SESSION_SECRET = 'unsafe\nvalue';

    expect(() => reconcileVercelBuildEnv(path, env)).toThrow(
      'Canonical build environment value is not safely serializable: SESSION_SECRET'
    );
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(readdirSync(root)).toEqual(['production.env']);
  });

  it('rejects values that Next env loading would expand', () => {
    const root = fixture();
    const path = resolve(root, 'production.env');
    const original = 'UNRELATED_VERCEL_VALUE="keep me"\n';
    writeFileSync(path, original);
    const env = canonicalEnv();
    env.SESSION_SECRET = 'prefix$UNDEFINEDsuffix';

    expect(() => reconcileVercelBuildEnv(path, env)).toThrow(
      'Canonical build environment value is not safely serializable: SESSION_SECRET'
    );
    expect(readFileSync(path, 'utf8')).toBe(original);
  });

  it('covers the installed Next env dollar-expansion semantics', () => {
    const rootRequire = createRequire(import.meta.url);
    const nextRequire = createRequire(rootRequire.resolve('next/package.json'));
    const { processEnv, resetEnv } = nextRequire('@next/env') as {
      processEnv: (
        files: Array<{ path: string; contents: string; env: object }>,
        directory: string,
        logger: { info: () => void; error: () => void },
        forceReload: boolean
      ) => unknown;
      resetEnv: () => void;
    };
    const probe = 'JOVIE_RECONCILE_EXPANSION_PROBE';
    delete process.env[probe];

    try {
      processEnv(
        [
          {
            path: '.env',
            contents: `${probe}=prefix$UNDEFINEDsuffix\n`,
            env: {},
          },
        ],
        process.cwd(),
        { info: () => undefined, error: () => undefined },
        true
      );
      expect(process.env[probe]).toBe('prefix');
    } finally {
      resetEnv();
      delete process.env[probe];
    }
  });

  it('does not remove a pre-existing predictable collision sentinel', () => {
    const root = fixture();
    const path = resolve(root, 'production.env');
    const sentinel = `${path}.reconcile-${process.pid}`;
    writeFileSync(path, 'UNRELATED_VERCEL_VALUE="keep me"\n');
    writeFileSync(sentinel, 'owned by another process');

    reconcileVercelBuildEnv(path, canonicalEnv());

    expect(readFileSync(sentinel, 'utf8')).toBe('owned by another process');
    expect(readdirSync(root).sort()).toEqual([
      'production.env',
      `production.env.reconcile-${process.pid}`,
    ]);
  });

  it('preserves the destination and cleans up owned temp files when rename fails', () => {
    const root = fixture();
    const path = resolve(root, 'production.env');
    const original = 'UNRELATED_VERCEL_VALUE="keep me"\n';
    writeFileSync(path, original);

    expect(() =>
      reconcileVercelBuildEnv(path, canonicalEnv(), {
        rename: () => {
          throw new Error('simulated rename failure');
        },
      })
    ).toThrow('simulated rename failure');
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(readdirSync(root)).toEqual(['production.env']);
  });

  it('rejects a symlinked destination', () => {
    const root = fixture();
    const target = resolve(root, 'target.env');
    const link = resolve(root, 'production.env');
    writeFileSync(target, 'SAFE="1"\n');
    symlinkSync(target, link);

    expect(() => reconcileVercelBuildEnv(link, canonicalEnv())).toThrow(
      'Vercel build environment file must be a regular file'
    );
    expect(readFileSync(target, 'utf8')).toBe('SAFE="1"\n');
  });
});
