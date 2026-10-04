// Logo-permission gate (JOV-7795): no third-party logo renders on a Jovie
// page without an active permission record whose scope covers that page.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { ArtistNotificationsLanding } from '@/components/marketing/artist-notifications/ArtistNotificationsLanding';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  LOGO_PERMISSIONS,
  type LogoPermission,
  logoPermissionCovers,
  logoPermissionStatus,
  permittedLogoAssetIds,
  validateLogoPermission,
  validateLogoPermissions,
} from '@/data/product-truth/logo-permissions';

const webRoot = path.resolve(__dirname, '../../..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'data'] as const;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const isTestOrStory = (file: string) =>
  /\.(test|spec|stories)\.tsx?$/.test(file) || file.endsWith('.fixture.ts');

const PRODUCTION_SOURCES = SOURCE_DIRS.flatMap(dir =>
  sourceFiles(path.join(webRoot, dir))
)
  .filter(file => !isTestOrStory(file))
  .map(file => ({
    file: path.relative(webRoot, file),
    source: readFileSync(file, 'utf8'),
  }));

const GRANT: LogoPermission = {
  id: 'perm-awal-2026-10-04',
  brand: 'AWAL',
  assetId: 'awal',
  relationship: 'customer',
  grantedBy: 'Jane Doe, AWAL marketing',
  grantedAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2027-10-01T00:00:00.000Z',
  evidenceUrl: 'https://example.com/awal-approval',
  scope: { pages: ['/pricing', '/solutions/*'] },
};
const NOW = new Date('2026-10-04T00:00:00.000Z');

describe('logo permission registry', () => {
  it('holds only valid records', () => {
    expect(validateLogoPermissions(LOGO_PERMISSIONS)).toEqual([]);
  });

  it('scopes every grant to pages that exist', () => {
    const urls = MARKETING_ROUTE_MANIFEST.map(route => route.url).filter(
      (url): url is string => typeof url === 'string'
    );
    for (const permission of LOGO_PERMISSIONS) {
      for (const page of permission.scope.pages) {
        const covered = urls.some(url =>
          logoPermissionCovers(
            { ...permission, scope: { pages: [page] } },
            { page: url }
          )
        );
        expect(covered, `${permission.id} scope ${page}`).toBe(true);
      }
    }
  });

  it('rejects incomplete records', () => {
    expect(
      validateLogoPermission({
        ...GRANT,
        assetId: 'not-a-logo',
        grantedBy: '',
        evidenceUrl: 'http://insecure.example.com',
        expiresAt: '2026-09-01T00:00:00.000Z',
        scope: { pages: [] },
      })
    ).toEqual([
      'unknown-asset',
      'missing-granted-by',
      'invalid-expiry',
      'invalid-evidence-url',
      'missing-scope',
    ]);
    expect(validateLogoPermissions([GRANT, GRANT])).toContainEqual({
      permissionId: GRANT.id,
      code: 'duplicate-id',
    });
  });

  it('tracks pending, active, expired and revoked grants', () => {
    expect(logoPermissionStatus(GRANT, NOW)).toBe('active');
    expect(
      logoPermissionStatus(GRANT, new Date('2026-09-30T00:00:00.000Z'))
    ).toBe('pending');
    expect(
      logoPermissionStatus(GRANT, new Date('2027-10-01T00:00:00.000Z'))
    ).toBe('expired');
    expect(
      logoPermissionStatus(
        { ...GRANT, revokedAt: '2026-10-02T00:00:00.000Z' },
        NOW
      )
    ).toBe('revoked');
  });

  it('permits a logo only where an active, valid grant covers the page', () => {
    const options = { now: NOW, permissions: [GRANT] };
    expect(permittedLogoAssetIds({ page: '/pricing' }, options)).toEqual([
      'awal',
    ]);
    expect(
      permittedLogoAssetIds({ page: '/solutions/artists' }, options)
    ).toEqual(['awal']);
    expect(permittedLogoAssetIds({ page: '/' }, options)).toEqual([]);
    expect(
      permittedLogoAssetIds(
        { page: '/pricing' },
        { now: new Date('2028-01-01T00:00:00.000Z'), permissions: [GRANT] }
      )
    ).toEqual([]);
    expect(
      permittedLogoAssetIds(
        { page: '/pricing' },
        { now: NOW, permissions: [{ ...GRANT, evidenceUrl: '' }] }
      )
    ).toEqual([]);
  });

  it('requires a matching audience when the grant names audiences', () => {
    const scoped: LogoPermission = {
      ...GRANT,
      scope: { pages: ['*'], audiences: ['artist'] },
    };
    const options = { now: NOW, permissions: [scoped] };
    expect(
      permittedLogoAssetIds({ page: '/', audience: 'artist' }, options)
    ).toEqual(['awal']);
    expect(
      permittedLogoAssetIds({ page: '/', audience: 'general' }, options)
    ).toEqual([]);
    expect(permittedLogoAssetIds({ page: '/' }, options)).toEqual([]);
  });
});

describe('logo render gate', () => {
  it('renders logos only through the permission check', () => {
    const offenders = PRODUCTION_SOURCES.filter(
      ({ file, source }) =>
        file !== 'components/media/NormalizedTrustLogo.tsx' &&
        source.includes('<NormalizedTrustLogo') &&
        !source.includes('permittedLogoAssetIds(')
    ).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('keeps the label marks behind the trust asset registry', () => {
    const importers = PRODUCTION_SOURCES.filter(({ source }) =>
      /from '@\/components\/features\/home\/label-logos'|from '\.\/label-logos'/.test(
        source
      )
    ).map(({ file }) => file);
    expect(importers).toEqual(['components/media/trustLogoAssets.tsx']);
  });

  it('keeps example grants out of production code', () => {
    const fixtureImporters = PRODUCTION_SOURCES.filter(({ source }) =>
      source.includes('logo-permissions.fixture')
    ).map(({ file }) => file);
    expect(fixtureImporters).toEqual([]);

    // Components may forward the story/test prop, never set it.
    const fixtureProps = PRODUCTION_SOURCES.filter(({ source }) =>
      /fixturePermissions=\{(?!fixturePermissions\})/.test(source)
    ).map(({ file }) => file);
    expect(fixtureProps).toEqual([]);
  });

  it('renders no logo without a grant, and the granted logos with one', () => {
    const { container, rerender } = render(
      <HomeTrustSection placement={{ page: '/pricing' }} />
    );
    expect(
      container.querySelectorAll('[data-logo-asset]').length,
      'real registry'
    ).toBe(permittedLogoAssetIds({ page: '/pricing' }).length);

    rerender(
      <HomeTrustSection
        placement={{ page: '/pricing' }}
        fixturePermissions={[GRANT]}
      />
    );
    const rendered = [...container.querySelectorAll('[data-logo-asset]')].map(
      node => node.getAttribute('data-logo-asset')
    );
    expect(rendered).toEqual(
      permittedLogoAssetIds({ page: '/pricing' }, { permissions: [GRANT] })
    );
  });

  it.each([
    [
      '/artist-profiles',
      () => (
        <ArtistProfileLandingRoute
          logoPlacement={{ page: '/artist-profiles' }}
        />
      ),
    ],
    [
      '/artist-notifications',
      () => <ArtistNotificationsLanding copy={ARTIST_NOTIFICATIONS_COPY} />,
    ],
  ])('renders only permitted logos on %s', (page, Page) => {
    const { container } = render(<Page />);
    const rendered = new Set(
      [...container.querySelectorAll('[data-logo-asset]')].map(node =>
        node.getAttribute('data-logo-asset')
      )
    );
    const permitted = new Set(permittedLogoAssetIds({ page }));
    for (const id of rendered) {
      expect(permitted.has(id ?? ''), `${id} on ${page}`).toBe(true);
    }
  });
});
