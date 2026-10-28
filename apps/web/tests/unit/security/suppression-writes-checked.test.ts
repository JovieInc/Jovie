import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (security triage 2026-10-25, codex t13 F2): suppression and
 * campaign-stop writes are compliance writes. `addSuppression` reports
 * failure as `{ success: false }` instead of throwing, and
 * `stopEnrollmentsForEmail` returns 0 on failure unless asked to throw. The
 * Resend webhook ignored both and acknowledged the event, so a bounce or
 * complaint could be lost for good. Every caller must check the result.
 */
const ROOT = process.cwd();
const OWNERS = new Set([
  'lib/notifications/suppression.ts',
  'lib/email/campaigns/enrollment.ts',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const files = ['app', 'lib']
  .flatMap(dir => sourceFiles(join(ROOT, dir)))
  .map(file => ({
    path: relative(ROOT, file),
    source: readFileSync(file, 'utf8'),
  }))
  .filter(({ path }) => !OWNERS.has(path));

describe('compliance suppression writes are checked', () => {
  it('every addSuppression result is checked for success', () => {
    const unchecked: string[] = [];
    for (const { path, source } of files) {
      for (const match of source.matchAll(/addSuppression\(/g)) {
        // The call and the code that consumes its result.
        const window = source.slice(match.index, (match.index ?? 0) + 600);
        if (!/\.success\b/.test(window)) unchecked.push(path);
      }
    }
    expect(unchecked).toEqual([]);
  });

  it('every stopEnrollmentsForEmail call asks to throw on failure', () => {
    const unchecked: string[] = [];
    for (const { path, source } of files) {
      for (const match of source.matchAll(/stopEnrollmentsForEmail\(/g)) {
        const window = source.slice(match.index, (match.index ?? 0) + 200);
        if (!/throwOnError:\s*true/.test(window)) unchecked.push(path);
      }
    }
    expect(unchecked).toEqual([]);
  });
});
