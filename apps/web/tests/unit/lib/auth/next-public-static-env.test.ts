/**
 * JOV-2131 — prove Next.js still collects NEXT_PUBLIC_* for build-time
 * inlining when the vars are present on process.env.
 *
 * This is the local stand-in for the issue's "throwaway NEXT_PUBLIC_DEBUG_FLAG
 * on a preview deploy" check. A full Vercel preview is not required to show
 * that the framework path works; if this collector stops seeing public keys,
 * client inlining of every NEXT_PUBLIC_* flag is at risk.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(path.join(process.cwd(), 'package.json'));

type StaticEnvModule = {
  getNextPublicEnvironmentVariables: () => Record<string, string>;
};

function loadStaticEnv(): StaticEnvModule {
  // Resolve from the web app so we use the same Next install as production builds.
  const resolved = require.resolve('next/dist/lib/static-env.js', {
    paths: [process.cwd()],
  });
  // Bust require cache so env mutations in this file are visible.
  delete require.cache[resolved];
  return require(resolved) as StaticEnvModule;
}

const DEBUG_KEY = 'NEXT_PUBLIC_DEBUG_FLAG';
const OAUTH_KEY = 'NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED';

const saved: Record<string, string | undefined> = {
  [DEBUG_KEY]: process.env[DEBUG_KEY],
  [OAUTH_KEY]: process.env[OAUTH_KEY],
};

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Next.js NEXT_PUBLIC static env collection (JOV-2131)', () => {
  it('includes throwaway NEXT_PUBLIC_DEBUG_FLAG when set on process.env', () => {
    process.env[DEBUG_KEY] = 'hello';
    const { getNextPublicEnvironmentVariables } = loadStaticEnv();
    const publicEnv = getNextPublicEnvironmentVariables();
    expect(publicEnv[`process.env.${DEBUG_KEY}`]).toBe('hello');
  });

  it('includes OAuth-shaped NEXT_PUBLIC keys when set (inlining path works)', () => {
    process.env[OAUTH_KEY] = '1';
    const { getNextPublicEnvironmentVariables } = loadStaticEnv();
    const publicEnv = getNextPublicEnvironmentVariables();
    expect(publicEnv[`process.env.${OAUTH_KEY}`]).toBe('1');
  });

  it('omits NEXT_PUBLIC keys that are unset (fail-closed default for missing flags)', () => {
    delete process.env[DEBUG_KEY];
    const { getNextPublicEnvironmentVariables } = loadStaticEnv();
    const publicEnv = getNextPublicEnvironmentVariables();
    expect(publicEnv).not.toHaveProperty(`process.env.${DEBUG_KEY}`);
  });

  it('does not surface bracket-style dynamic keys — only exact NEXT_PUBLIC_ names', () => {
    // Documents why process.env[dynamicKey] can never be inlined: the define
    // map is a flat record of exact `process.env.NEXT_PUBLIC_*` property paths.
    process.env[DEBUG_KEY] = 'hello';
    const { getNextPublicEnvironmentVariables } = loadStaticEnv();
    const publicEnv = getNextPublicEnvironmentVariables();
    const keys = Object.keys(publicEnv);
    expect(keys.every(k => k.startsWith('process.env.NEXT_PUBLIC_'))).toBe(
      true
    );
    expect(keys.some(k => k.includes('['))).toBe(false);
  });
});
