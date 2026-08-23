import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');

const ALLOWED_DIRECT_SURFACE_CONSUMERS = [
  'app/(marketing)/renders/[state]/MarketingStateRenderClient.tsx',
  'components/features/demo/DemoTimWhiteProfileSurface.tsx',
  'components/features/home/HomeProfileShowcase.tsx',
  'components/features/profile/ProfilePreviewBento.tsx',
  'components/features/profile/templates/ProfileCompactTemplate.tsx',
] as const;

function walkTsx(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walkTsx(fullPath);
    if (!entry.name.endsWith('.tsx')) return [];
    if (entry.name.includes('.test.') || entry.name.includes('.stories.')) {
      return [];
    }
    return [fullPath];
  });
}

function findDirectSurfaceConsumers(): readonly string[] {
  return [join(WEB_ROOT, 'app'), join(WEB_ROOT, 'components')]
    .flatMap(walkTsx)
    .filter(path =>
      readFileSync(path, 'utf8').match(
        /import\s+\{\s*ProfileCompactSurface\s*\}\s+from/
      )
    )
    .map(path => relative(WEB_ROOT, path))
    .sort();
}

describe('public-profile consumer attachment', () => {
  it('keeps the live public route attached to the canonical template and surface', () => {
    const route = readFileSync(
      join(WEB_ROOT, 'app/[username]/page.tsx'),
      'utf8'
    );
    const entry = readFileSync(
      join(WEB_ROOT, 'components/features/profile/StaticArtistPage.tsx'),
      'utf8'
    );
    const template = readFileSync(
      join(
        WEB_ROOT,
        'components/features/profile/templates/ProfileCompactTemplate.tsx'
      ),
      'utf8'
    );
    const surface = readFileSync(
      join(
        WEB_ROOT,
        'components/features/profile/templates/ProfileCompactSurface.tsx'
      ),
      'utf8'
    );
    const tabBar = readFileSync(
      join(WEB_ROOT, 'components/features/profile/nav/BottomTabBar.tsx'),
      'utf8'
    );

    expect(route).toContain('<StaticArtistPage');
    expect(entry).toContain('<ProfileCompactTemplate');
    expect(template).toContain('<ProfileCompactSurface');
    expect(template).toContain("from '@/lib/profile/route-config'");
    expect(template).toContain('getPermittedPublicProfileNavigation');
    expect(surface).toContain('resolvePublicProfileActiveDestination');
    expect(tabBar).toContain('getPermittedPublicProfileNavigation');
  });

  it('fails when a new route-local or preview consumer detaches from the canonical template owner', () => {
    expect(findDirectSurfaceConsumers()).toEqual(
      ALLOWED_DIRECT_SURFACE_CONSUMERS
    );
  });
});
