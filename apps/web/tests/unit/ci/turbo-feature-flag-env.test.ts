import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Code flags read `FEATURE_<NAME>` (lib/flags/code-flags.ts). Vercel builds
 * with `pnpm turbo build`, and Turbo's strict env mode hides any variable the
 * build task does not declare, so a statically rendered page such as the
 * homepage would never see a flag flipped in the Vercel env. Declaring
 * `FEATURE_*` also puts the flag in the cache key, so a flip is not served
 * from a stale cached build.
 */
const TURBO_JSON = path.resolve(__dirname, '../../../../../turbo.json');

describe('turbo build env', () => {
  it('declares FEATURE_* so code flag overrides reach the build', () => {
    const source = readFileSync(TURBO_JSON, 'utf8');
    const build = source.slice(source.indexOf('"build": {'));
    const start = build.indexOf('"env": [');
    const env = build.slice(start, build.indexOf(']', start));
    expect(env).toContain('"FEATURE_*"');
  });
});
