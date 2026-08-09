import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import { LibraryAssetShareSurface } from './LibraryAssetShareSurface';
import { WEB194_PRIVATE_ASSET_VIEW } from './LibraryAssetShareSurface.stories';

describe('web-194 private asset share source contract', () => {
  it('uses only the checked-in founder release fixture', () => {
    const release = FOUNDER_DEMO_PERSONA.releases[0];
    const artist = FOUNDER_DEMO_PERSONA.profile;

    expect(WEB194_PRIVATE_ASSET_VIEW).toMatchObject({
      assetId: release.id,
      title: release.title,
      artworkUrl: release.artworkUrl,
      artistName: artist.displayName,
      artistHandle: artist.handle,
      smartLinkPath: `/${artist.handle}/${release.slug}`,
      visibility: 'private',
    });
  });

  it('renders the exact production body without a token fixture', () => {
    render(<LibraryAssetShareSurface view={WEB194_PRIVATE_ASSET_VIEW} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: WEB194_PRIVATE_ASSET_VIEW.title,
      })
    ).toBeVisible();
    expect(
      screen.getByText(WEB194_PRIVATE_ASSET_VIEW.artistName)
    ).toBeVisible();
    expect(screen.getByText('Private link')).toBeVisible();
    expect(screen.getByRole('link', { name: /Open Release/i })).toHaveAttribute(
      'href',
      WEB194_PRIVATE_ASSET_VIEW.smartLinkPath
    );
  });

  it('keeps private-token lookup and metadata in the server route', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/p/[token]/page.tsx'),
      'utf8'
    );
    const story = readFileSync(
      resolve(
        process.cwd(),
        'components/features/library-asset-share/LibraryAssetShareSurface.stories.tsx'
      ),
      'utf8'
    );

    expect(route).toContain('buildLibraryAssetSharePublicViewByToken(token)');
    expect(route).toContain('notFound()');
    expect(route).toContain('<LibraryAssetShareSurface view={view} />');
    expect(story).toContain('component: LibraryAssetShareSurface');
    expect(story).toContain("registryId: 'web-194-p--[token]'");
    expect(story).toContain("route: '/p/[token]'");
    expect(story).toContain('FOUNDER_DEMO_PERSONA.releases[0]');
    expect(story).not.toContain('accessToken');
    expect(story).not.toContain('token:');
  });
});
