import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_FILE_DIR, '../../..');
const PUBLIC_PROFILE_TEMPLATE_V2_SOURCE = readFileSync(
  path.join(
    WEB_ROOT,
    'components/features/profile/templates/PublicProfileTemplateV2.tsx'
  ),
  'utf8'
);

describe('PublicProfileTemplateV2 source structure', () => {
  it('pushes history entries for overlay mode changes', () => {
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain('history.pushState');
  });

  it('syncs active state from browser back/forward navigation', () => {
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain(
      "addEventListener('popstate'"
    );
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain('getModeFromLocation');
  });

  it('scrolls to the tour section for legacy tour mode URLs', () => {
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain('scrollIntoView');
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain(
      'requestAnimationFrame'
    );
  });

  it('removes the swipe-specific V2 composition', () => {
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).not.toContain(
      'ProfileQuickActions'
    );
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).not.toContain(
      'SwipeableModeContainer'
    );
  });
});
