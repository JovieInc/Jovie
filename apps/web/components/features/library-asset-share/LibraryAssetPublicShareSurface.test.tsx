import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import { WEB058_PUBLIC_ASSET_VIEW } from './LibraryAssetPublicShareSurface.stories';
import { LibraryAssetShareSurface } from './LibraryAssetShareSurface';

describe('web-058 public asset share source contract', () => {
  it('shares the checked-in founder release fixture with the private body', () => {
    const release = FOUNDER_DEMO_PERSONA.releases[0];
    const artist = FOUNDER_DEMO_PERSONA.profile;

    expect(WEB058_PUBLIC_ASSET_VIEW).toMatchObject({
      assetId: release.id,
      title: release.title,
      artistName: artist.displayName,
      artistHandle: artist.handle,
      artworkUrl: release.artworkUrl,
      smartLinkPath: `/${artist.handle}/${release.slug}`,
      visibility: 'public',
    });
  });

  it('renders the exact production component in its public state', () => {
    render(<LibraryAssetShareSurface view={WEB058_PUBLIC_ASSET_VIEW} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: WEB058_PUBLIC_ASSET_VIEW.title,
      })
    ).toBeVisible();
    expect(screen.getByText('Public link')).toBeVisible();
    expect(screen.getByRole('link', { name: /Open Release/i })).toHaveAttribute(
      'href',
      WEB058_PUBLIC_ASSET_VIEW.smartLinkPath
    );
  });

  it('keeps slug lookup and unpublished fallback in the route', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/a/[handle]/[slug]/page.tsx'),
      'utf8'
    );
    const story = readFileSync(
      resolve(
        process.cwd(),
        'components/features/library-asset-share/LibraryAssetPublicShareSurface.stories.tsx'
      ),
      'utf8'
    );

    expect(route).toContain('buildLibraryAssetSharePublicViewBySlug({');
    expect(route).toContain('buildLibraryAssetSharePendingViewBySlug({');
    expect(route).toContain('<UnpublishedEntityAlerts');
    expect(route).toContain('<LibraryAssetShareSurface view={view} />');
    expect(story).toContain('component: LibraryAssetShareSurface');
    expect(story).toContain("registryId: 'web-058-a--[handle]--[slug]'");
    expect(story).toContain("route: '/a/timwhite/the-deep-end'");
    expect(story).toContain('FOUNDER_DEMO_PERSONA.releases[0]');
  });
});
