import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import { LibraryShareDropSurface } from './LibraryShareDropSurface';
import { WEB171_DROP_VIEW } from './LibraryShareDropSurface.stories';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('web-171 library share drop source contract', () => {
  it('derives its visible asset from the checked-in founder release', () => {
    const release = FOUNDER_DEMO_PERSONA.releases[0];
    const artist = FOUNDER_DEMO_PERSONA.profile;

    expect(WEB171_DROP_VIEW).toMatchObject({
      title: release.title,
      artistName: artist.displayName,
      artistHandle: artist.handle,
      requiresPassphrase: false,
      isExpired: false,
    });
    expect(WEB171_DROP_VIEW.assets).toEqual([
      expect.objectContaining({
        id: release.id,
        releaseId: release.id,
        title: release.title,
        artworkUrl: release.artworkUrl,
        smartLinkPath: `/${artist.handle}/${release.slug}`,
      }),
    ]);
  });

  it('renders the exact production unlocked body', () => {
    render(<LibraryShareDropSurface view={WEB171_DROP_VIEW} initialUnlocked />);

    expect(screen.getByTestId('library-share-drop-surface')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: WEB171_DROP_VIEW.title,
      })
    ).toBeVisible();
    expect(screen.getByTestId('library-share-drop-header')).toHaveTextContent(
      WEB171_DROP_VIEW.artistName
    );
  });

  it('keeps token lookup and passphrase access in the server route', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/drop/[token]/page.tsx'),
      'utf8'
    );
    const story = readFileSync(
      resolve(
        process.cwd(),
        'components/features/library-share/LibraryShareDropSurface.stories.tsx'
      ),
      'utf8'
    );

    expect(route).toContain('buildLibraryShareDropPublicView(token)');
    expect(route).toContain('hasLibraryShareDropAccess(token)');
    expect(route).toContain('<LibraryShareDropSurface');
    expect(story).toContain('component: LibraryShareDropSurface');
    expect(story).toContain("registryId: 'web-171-drop--[token]'");
    expect(story).toContain("route: '/drop/[token]'");
    expect(story).toContain('FOUNDER_DEMO_PERSONA.releases[0]');
    expect(story).toContain("token: 'drop-token'");
    expect(story).not.toContain('passphrase:');
  });
});
