import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);

const CURATED_ROUTE_FILES = [
  join(TEST_DIR, '../../../app/app/(shell)/admin/playlists/page.tsx'),
  join(TEST_DIR, '../../../app/app/(shell)/settings/analytics/page.tsx'),
  join(
    TEST_DIR,
    '../../../app/app/(shell)/settings/contacts/ContactsContent.tsx'
  ),
  join(
    TEST_DIR,
    '../../../app/app/(shell)/settings/touring/TouringContent.tsx'
  ),
  join(
    TEST_DIR,
    '../../../app/app/(shell)/dashboard/profile/ProfilePageChat.tsx'
  ),
] as const;

const BLOCKED_PATTERNS = [
  /SettingsErrorState/,
  /rounded-lg[\s\S]*border[\s\S]*border-white\/\[0\.06\][\s\S]*bg-white\/\[0\.02\][\s\S]*p-4/,
  /max-w-2xl[\s\S]*rounded-\[22px\][\s\S]*border-\(--linear-app-frame-seam\)[\s\S]*bg-\(--linear-app-content-surface\)[\s\S]*p-3/,
] as const;

describe('internal shell surface guard', () => {
  it('keeps curated route entrypoints on canonical shell and surface primitives', () => {
    const missingFiles = CURATED_ROUTE_FILES.filter(
      filePath => !existsSync(filePath)
    );
    expect(missingFiles).toEqual([]);

    const offenders = CURATED_ROUTE_FILES.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return BLOCKED_PATTERNS.some(pattern => pattern.test(contents));
    });

    expect(offenders).toEqual([]);
  });
});
