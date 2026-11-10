import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One front door (Tim, 2026-11-09): the claim copy invariant CPY-01..04.
 * No public data module or homepage/marketing component may pitch access as
 * an invitation — the primary CTA is 'Claim your handle', and waitlist
 * wording may appear only as the locked post-claim state.
 */
const BANNED_COPY = new RegExp(
  'request (an )?invite|invite[- ]only|by invitation|apply for access|join the waitlist',
  'i'
);

const WEB_ROOT = process.cwd();

const SCANNED_DIRS = [
  'data',
  'components/homepage',
  'components/marketing',
] as const;

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') {
        continue;
      }
      out.push(...collectSources(path));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe('claim front-door copy lint (Tim, 2026-11-09 CPY-01..04)', () => {
  it('keeps invitation wording out of data and homepage/marketing components', () => {
    const offenders: string[] = [];
    for (const dir of SCANNED_DIRS) {
      const root = resolve(WEB_ROOT, dir);
      expect(statSync(root).isDirectory(), dir).toBe(true);
      for (const path of collectSources(root)) {
        const text = readFileSync(path, 'utf8');
        if (BANNED_COPY.test(text)) {
          offenders.push(relative(WEB_ROOT, path));
        }
      }
    }
    expect(
      offenders,
      `invitation wording must not come back: ${offenders.join(', ')}`
    ).toEqual([]);
  });
});
