import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('public catalog accessibility contract', () => {
  it('uses the registered header primitive as the Artists route h1', () => {
    const page = read('app/artists/page.tsx');
    const directory = read('components/organisms/ArtistsDirectory.tsx');
    const story = read('components/molecules/ContentSectionHeader.stories.tsx');

    expect(page.match(/headingLevel='h1'/g)).toHaveLength(1);
    expect(directory.match(/headingLevel='h1'/g)).toHaveLength(1);
    expect(`${page}${directory}`).not.toContain('<h1');
    expect(story).toContain('export const RouteHeading');
    expect(story).toContain("headingLevel: 'h1'");
  });

  it('uses a contrast-gated semantic token for the playlist empty state', () => {
    const source = read('app/(dynamic)/playlists/_components/PlaylistGrid.tsx');

    expect(source).toContain("className='text-mid text-tertiary-token'");
    expect(source).not.toContain("className='text-mid text-white/40'");
  });
});
