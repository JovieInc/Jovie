import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME,
  PROFILE_LISTEN_DSP_COLUMN_CLASSNAME,
  PROFILE_LISTEN_RELEASES_COLUMN_CLASSNAME,
} from './profile-listen-desktop-grid';

const SURFACE = readFileSync(
  join(__dirname, 'ProfileDesktopSurface.tsx'),
  'utf8'
);

describe('desktop listen grid contract', () => {
  it('splits releases and DSP columns at the 1180px desktop hand-off', () => {
    expect(PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME).toContain(
      '[@media(min-width:1180px)]:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]'
    );
    expect(PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME).toContain('min-w-0');
    expect(PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME).not.toContain('xl:grid-cols');
    expect(PROFILE_LISTEN_RELEASES_COLUMN_CLASSNAME).toContain(
      'overflow-hidden'
    );
    expect(PROFILE_LISTEN_DSP_COLUMN_CLASSNAME).toContain('min-w-0');

    expect(SURFACE).toContain('PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME');
    expect(SURFACE).toContain("data-testid='profile-listen-desktop-grid'");
    expect(SURFACE).toContain("data-testid='profile-listen-dsp-column'");
    expect(SURFACE).not.toContain('xl:grid-cols-[minmax(0,1.3fr)_360px]');
  });
});
