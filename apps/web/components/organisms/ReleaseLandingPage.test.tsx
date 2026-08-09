import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_RELEASE_VIEW_MODELS } from '@/components/features/demo/mock-release-data';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { WEB196_RELEASE_ARGS } from './ReleaseLandingPage.stories';

describe('web-196 release smart-link source contract', () => {
  it('derives the deterministic fixture from checked-in demo data', () => {
    const release = DEMO_RELEASE_VIEW_MODELS[0];
    const artist = INTERNAL_DJ_DEMO_PERSONA.profile;

    expect(WEB196_RELEASE_ARGS.release.title).toBe(release.title);
    expect(WEB196_RELEASE_ARGS.release.artworkUrl).toBe(release.artworkUrl);
    expect(WEB196_RELEASE_ARGS.artist).toEqual({
      name: artist.displayName,
      handle: artist.handle,
      avatarUrl: artist.avatarSrc,
    });
    expect(WEB196_RELEASE_ARGS.providers.map(provider => provider.key)).toEqual(
      release.providers.map(provider => provider.key)
    );
    expect(WEB196_RELEASE_ARGS.tracking).toEqual({
      contentType: 'release',
      contentId: release.id,
      smartLinkSlug: release.slug,
    });
  });

  it('binds the story to the exact route component without route logic', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/r/[slug]/page.tsx'),
      'utf8'
    );
    const story = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/ReleaseLandingPage.stories.tsx'
      ),
      'utf8'
    );

    expect(route).toContain(
      "import { ReleaseLandingPage } from './ReleaseLandingPage'"
    );
    expect(route).toContain('<ReleaseLandingPage');
    expect(route).toContain('permanentRedirect(newUrl)');
    expect(route).toContain(
      'redirect(appendUTMParamsToUrl(targetUrl, utmParams))'
    );

    expect(story).toContain('component: ReleaseLandingPage');
    expect(story).toContain("registryId: 'web-196-r--[slug]'");
    expect(story).toContain("sourceExport: 'ReleaseLandingPage'");
    expect(story).toContain("storyExport: 'Web196LegacyFallback'");
    expect(story).toContain('DEMO_RELEASE_VIEW_MODELS[0]');
    expect(story).toContain('INTERNAL_DJ_DEMO_PERSONA');
    expect(story).not.toContain('getReleaseData(');
    expect(story).not.toContain('profileId:');
  });
});
