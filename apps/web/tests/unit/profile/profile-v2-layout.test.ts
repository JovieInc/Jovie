import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_FILE_DIR, '../../..');
const PROFILE_VIEWPORT_SHELL_SOURCE = readFileSync(
  path.join(WEB_ROOT, 'components/features/profile/ProfileViewportShell.tsx'),
  'utf8'
);
const PROFILE_HERO_SOURCE = readFileSync(
  path.join(WEB_ROOT, 'components/features/profile/ProfileHeroCard.tsx'),
  'utf8'
);

describe('profile V2 layout constraints', () => {
  it('keeps the desktop shell boxed to a mobile-width card', () => {
    expect(PROFILE_VIEWPORT_SHELL_SOURCE).toContain('md:max-w-[440px]');
    expect(PROFILE_VIEWPORT_SHELL_SOURCE).toContain('md:rounded-xl');
  });

  it('constrains hero image sizing instead of requesting desktop 100vw', () => {
    expect(PROFILE_HERO_SOURCE).toContain(
      "sizes='(max-width: 768px) 100vw, 440px'"
    );
  });
});
