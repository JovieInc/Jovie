import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT_SOURCES = [
  'lib/tracking/pac-events.ts',
  'lib/notifications/validation.ts',
  'components/features/profile/usePacEvents.ts',
  'components/features/profile/pac/ProfilePacCard.tsx',
  'components/features/profile/artist-notifications-cta/useSubscriptionForm.ts',
] as const;

const SERVER_CONTRACTS = [
  '@/lib/tracking/pac-events-contract',
  '@/lib/validation/schemas/notifications',
] as const;

const FORBIDDEN_SHARED_IMPORTS = [
  'server-only',
  "from 'zod'",
  'from "zod"',
  '@/lib/validation/',
  '@/lib/db',
  '@/lib/env-server',
  '@/lib/flags/statsig',
  'next/headers',
  'next/cache',
] as const;

function readWebSource(sourcePath: string): string {
  return readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
}

describe('PAC public-profile client boundary', () => {
  it('keeps client entrypoints off Zod-backed server contracts', () => {
    for (const sourcePath of CLIENT_SOURCES) {
      const source = readWebSource(sourcePath);
      for (const serverContract of SERVER_CONTRACTS) {
        expect(source, sourcePath).not.toContain(serverContract);
      }
    }
  });

  it('keeps the shared event definitions free of server dependencies', () => {
    const source = readWebSource('lib/tracking/pac-events-shared.ts');

    for (const forbiddenImport of FORBIDDEN_SHARED_IMPORTS) {
      expect(source, forbiddenImport).not.toContain(forbiddenImport);
    }
  });

  it('keeps notification capture validation free of server dependencies', () => {
    const source = readWebSource('lib/notifications/capture-validation.ts');

    for (const forbiddenImport of FORBIDDEN_SHARED_IMPORTS) {
      expect(source, forbiddenImport).not.toContain(forbiddenImport);
    }
  });
});
