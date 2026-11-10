import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (security triage 2026-10-25): attempt counters that bound guessing of
 * a secret (OTP, verification code, PIN, passcode) must be incremented in SQL
 * (`col + 1` under a WHERE cap), never written back from a value read earlier.
 * The fan email OTP wrote `snapshot + 1`, so concurrent wrong guesses all saw
 * the same count and the 5-attempt cap did not hold.
 */
const ROOT = process.cwd();
const COUNTER_KEY =
  /\b(\w*(?:Otp|Code|Verification|Pin|Passcode)Attempts)\s*:\s*([^,\n}]+)/g;

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

describe('credential attempt counters', () => {
  it('are only reset to 0 or incremented in SQL', () => {
    const offenders: string[] = [];
    for (const file of ['lib', 'app'].flatMap(dir =>
      sourceFiles(join(ROOT, dir))
    )) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(COUNTER_KEY)) {
        const [, key, value] = match;
        const trimmed = value.trim();
        // Schema column definitions and selections are not writes.
        if (
          /^(integer|notificationSubscriptions\.|\w+\.\w+Attempts$)/.test(
            trimmed
          )
        )
          continue;
        if (trimmed === '0' || /^(drizzleSql|sql)`/.test(trimmed)) continue;
        if (/^(number|boolean|string)\b/.test(trimmed)) continue; // types
        offenders.push(`${relative(ROOT, file)}: ${key}: ${trimmed}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
