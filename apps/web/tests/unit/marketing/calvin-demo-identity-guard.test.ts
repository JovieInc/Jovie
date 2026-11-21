/**
 * Executable guard for LESSONS fingerprint:
 * "Calvin Harris demo content must avoid founder-name collisions"
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = resolve(webRoot, '../..');

const CALVIN_FIXTURE_PATHS = [
  'apps/web/lib/demo-personas.ts',
  'apps/web/components/features/demo/mock-release-data.ts',
  'apps/web/components/features/demo/demo-surface-fixtures.ts',
  'apps/web/components/features/demo/DemoPublicProfileSurface.tsx',
] as const;

const FORBIDDEN = [
  { id: 'blessings', pattern: /\bBlessings\b/u },
  { id: 'clementine', pattern: /\bClementine\s+Douglas\b/u },
  { id: 'tim-white-credit', pattern: /\bTim\s+White\b/u },
] as const;

function extractInternalDjBlock(source: string): string {
  const start = source.indexOf('export const INTERNAL_DJ_DEMO_PERSONA');
  expect(start).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf('\nexport const ', start + 1);
  return nextExport === -1
    ? source.slice(start)
    : source.slice(start, nextExport);
}

describe('Calvin Harris demo identity boundary', () => {
  it('keeps the internal DJ persona free of Blessings, Clementine, and Tim White credits', () => {
    expect(INTERNAL_DJ_DEMO_PERSONA.profile.displayName).toBe('Calvin Harris');
    const serialized = JSON.stringify(INTERNAL_DJ_DEMO_PERSONA);
    for (const rule of FORBIDDEN) {
      expect(serialized.match(rule.pattern), rule.id).toBeNull();
    }
    for (const release of INTERNAL_DJ_DEMO_PERSONA.releases) {
      expect(release.title).not.toMatch(/\bBlessings\b/u);
      expect(release.artistNames.join(' ')).not.toMatch(/\bTim\s+White\b/u);
      expect(release.artistNames.join(' ')).not.toMatch(/\bClementine\b/u);
    }
  });

  it('scans Calvin demo fixture sources for founder-name collisions', () => {
    const personas = readFileSync(
      resolve(repoRoot, 'apps/web/lib/demo-personas.ts'),
      'utf8'
    );
    const calvinBlock = extractInternalDjBlock(personas);
    for (const rule of FORBIDDEN) {
      expect(
        calvinBlock.match(rule.pattern),
        `demo-personas:${rule.id}`
      ).toBeNull();
    }

    for (const rel of CALVIN_FIXTURE_PATHS.slice(1)) {
      const source = readFileSync(resolve(repoRoot, rel), 'utf8');
      // Only enforce collision bans when the file is Calvin-scoped content.
      if (
        !/Calvin\s+Harris|calvinharris|calvin-demo|INTERNAL_DJ_DEMO_PERSONA/u.test(
          source
        )
      ) {
        continue;
      }
      expect(source.match(/\bBlessings\b/u), `${rel}:blessings`).toBeNull();
      expect(
        source.match(/\bClementine\s+Douglas\b/u),
        `${rel}:clementine`
      ).toBeNull();
    }
  });
});
