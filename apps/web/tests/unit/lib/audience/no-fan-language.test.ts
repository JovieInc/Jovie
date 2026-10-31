import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Product language guard (Tim, 2026-10-24): the surface is Audience and the
 * people in it are audience members or contacts. The word "fan" must not
 * appear in user-facing strings of the Audience surface.
 */
const ROOT = join(__dirname, '../../../..');
const DIRS = [
  'components/features/dashboard/organisms/dashboard-audience-table',
  'components/features/dashboard/organisms/audience-member-sidebar',
  'components/organisms/table/atoms',
  'app/app/(shell)/contacts',
  'lib/audience',
];

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    if (!/\.(ts|tsx)$/.test(name)) return [];
    if (/\.(test|stories)\.(ts|tsx)$/.test(name)) return [];
    return [full];
  });
}

const FAN_IN_STRING = /(['"`])[^'"`\n]*\b[Ff]ans?\b[^'"`\n]*\1/;
// Internal identifiers that predate the rename; not user-facing.
const ALLOWED = [/\bid:\s*'fan'/, /AUDIENCE_FIT/, /\bfan:\s*\d/];

describe('Audience language', () => {
  it('has no "fan" in user-facing strings', () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of listSources(join(ROOT, dir))) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
            if (ALLOWED.some(rx => rx.test(line))) return;
            if (FAN_IN_STRING.test(line)) {
              offenders.push(`${file.replace(ROOT, '')}:${i + 1}: ${trimmed}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
