import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = resolve(
  process.cwd(),
  'components/organisms/release-sidebar/TrackSidebar.tsx'
);

describe('TrackSidebar inspector contract', () => {
  it('uses the shared Inspector shell with Library tabs', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('InspectorShell');
    expect(source).toContain('LIBRARY_INSPECTOR_TABS');
    expect(source).toContain("setActiveTab('details')");
    expect(source).not.toContain("setActiveTab('playback')");
    expect(source).not.toContain("'platforms'");
    expect(source).not.toContain('Presence');
  });
});
