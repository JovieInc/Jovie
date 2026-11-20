import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Clerk is retired. turbo.json hashes `NEXT_PUBLIC_*` into the `build` task,
 * so a leftover NEXT_PUBLIC_CLERK_* value that differs between jobs (secret,
 * mock key, unset) gives the same source a different cache key per job and
 * defeats Turbo cache reuse. Nothing in the app reads these any more.
 */
const WORKFLOWS_DIR = path.resolve(
  __dirname,
  '../../../../../.github/workflows'
);
const RETIRED_BUILD_ENV =
  /\b(?:NEXT_PUBLIC_CLERK_[A-Z_]+|CLERK_SECRET_KEY(?:_STAGING)?|CLERK_PUBLISHABLE_KEY(?:_STAGING)?)\b/;

describe('workflow build env', () => {
  it('does not set retired Clerk keys or flags', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(WORKFLOWS_DIR)) {
      if (!file.endsWith('.yml')) continue;
      const lines = readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8').split(
        '\n'
      );
      lines.forEach((line, index) => {
        if (RETIRED_BUILD_ENV.test(line))
          offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
