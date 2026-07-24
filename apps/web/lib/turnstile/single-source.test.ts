import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail (Shame-on-Me clause): the Cloudflare Turnstile siteverify call must
 * live in exactly one place — `lib/turnstile/verify.ts`. A second inline
 * implementation already drifted once (the changelog route had its own copy
 * with a different timeout and rejected/unavailable mapping). This test fails
 * if any other source file calls siteverify directly, forcing callers through
 * the shared, bounded `verifyTurnstileToken` helper.
 */

const SITEVERIFY_MARKER = 'turnstile/v0/siteverify';
const CANONICAL_FILE = 'lib/turnstile/verify.ts';
const SCAN_ROOTS = ['app', 'lib', 'components'];
const SCANNABLE = /\.(ts|tsx)$/;

function collectFiles(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc);
    } else if (SCANNABLE.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('turnstile siteverify single source of truth', () => {
  it('is only called from lib/turnstile/verify.ts', () => {
    const webRoot = join(__dirname, '..', '..');
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      const files = collectFiles(join(webRoot, root), []);
      for (const file of files) {
        if (!readFileSync(file, 'utf8').includes(SITEVERIFY_MARKER)) continue;
        const rel = relative(webRoot, file).replaceAll('\\', '/');
        if (rel !== CANONICAL_FILE) offenders.push(rel);
      }
    }

    expect(
      offenders,
      `siteverify must only be called from ${CANONICAL_FILE}; found inline call(s) in: ${offenders.join(', ')}`
    ).toEqual([]);
  });
});
