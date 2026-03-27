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

describe('PublicProfileTemplateV2 history handling', () => {
  it('pushes a new history entry for mode changes', () => {
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain('history.pushState');
  });

  it('replaces history for the initial overlay navigation', () => {
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain('history.replaceState');
  });

  it('syncs active mode from browser back/forward navigation', () => {
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain(
      "addEventListener('popstate'"
    );
    expect(PUBLIC_PROFILE_TEMPLATE_V2_SOURCE).toContain('getModeFromLocation');
  });
});
