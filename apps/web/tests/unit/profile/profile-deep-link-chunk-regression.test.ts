import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const LISTEN_DRAWER = readFileSync(
  join(WEB_ROOT, 'components/features/profile/ListenDrawer.tsx'),
  'utf8'
);
const STATIC_LISTEN_INTERFACE = readFileSync(
  join(WEB_ROOT, 'components/features/profile/StaticListenInterface.tsx'),
  'utf8'
);

describe('public profile DSP drawer chunking', () => {
  it('keeps deep-link helpers inside the already-lazy unified drawer chunk', () => {
    expect(STATIC_LISTEN_INTERFACE).toContain(
      "import { getDSPDeepLinkConfig, openDeepLink } from '@/lib/deep-links';"
    );
    expect(STATIC_LISTEN_INTERFACE).not.toMatch(
      /await\s+import\(\s*['"]@\/lib\/deep-links['"]\s*\)/
    );
    expect(LISTEN_DRAWER).not.toMatch(
      /import\(\s*['"]@\/lib\/deep-links['"]\s*\)/
    );
  });
});
