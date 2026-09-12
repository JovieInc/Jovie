import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SURFACE = readFileSync(
  join(__dirname, 'ProfileDesktopSurface.tsx'),
  'utf8'
);

describe('desktop listen grid contract', () => {
  it('splits releases and DSP columns at the 1180px desktop hand-off', () => {
    const listenGrid = SURFACE.match(
      /PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME =\n {2}'([^']+)'/
    )?.[1];

    expect(listenGrid).toContain(
      '[@media(min-width:1180px)]:grid-cols-[minmax(0,1.3fr)_360px]'
    );
    expect(listenGrid).toContain('min-w-0');
    expect(listenGrid).not.toContain('xl:grid-cols');

    expect(SURFACE).toContain('PROFILE_LISTEN_RELEASES_COLUMN_CLASSNAME');
    expect(SURFACE).toContain("data-testid='profile-listen-desktop-grid'");
    expect(SURFACE).toContain("data-testid='profile-listen-dsp-column'");
    expect(SURFACE).not.toContain(
      'grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]'
    );
  });
});
