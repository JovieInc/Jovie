import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CURATED_ROUTE_FILES = [
  join(
    process.cwd(),
    'app',
    'app',
    '(shell)',
    'admin',
    'playlists',
    'page.tsx'
  ),
  join(
    process.cwd(),
    'app',
    'app',
    '(shell)',
    'settings',
    'analytics',
    'page.tsx'
  ),
  join(
    process.cwd(),
    'app',
    'app',
    '(shell)',
    'settings',
    'contacts',
    'ContactsContent.tsx'
  ),
  join(
    process.cwd(),
    'app',
    'app',
    '(shell)',
    'settings',
    'touring',
    'TouringContent.tsx'
  ),
  join(
    process.cwd(),
    'app',
    'app',
    '(shell)',
    'dashboard',
    'profile',
    'ProfilePageChat.tsx'
  ),
] as const;

const BLOCKED_PATTERNS = [
  'SettingsErrorState',
  "className='rounded-lg border border-white/[0.06] bg-white/[0.02] p-4'",
  "className='mx-auto max-w-2xl rounded-[22px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'",
] as const;

describe('internal shell surface guard', () => {
  it('keeps curated route entrypoints on canonical shell and surface primitives', () => {
    const offenders = CURATED_ROUTE_FILES.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return BLOCKED_PATTERNS.some(pattern => contents.includes(pattern));
    });

    expect(offenders).toEqual([]);
  });
});
