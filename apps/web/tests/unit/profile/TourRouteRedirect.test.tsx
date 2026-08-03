import { describe, expect, it } from 'vitest';
import {
  getLegacyProfileModeRedirectHref,
  getProfileModeRedirectHref,
} from '@/app/[username]/_lib/mode-route-redirect';

type RedirectRule = {
  readonly source: string;
  readonly destination: string;
  readonly permanent: boolean;
};

type RewriteRule = Omit<RedirectRule, 'permanent'>;

function getAfterFilesRewrites(
  rewrites:
    | RewriteRule[]
    | {
        readonly afterFiles?: readonly RewriteRule[];
      }
): readonly RewriteRule[] {
  return Array.isArray(rewrites) ? rewrites : (rewrites.afterFiles ?? []);
}

describe('profile mode route redirects', () => {
  it('does not shadow smart-link slugs with config-level redirects', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = (await nextConfig.redirects()) as RedirectRule[];
    const profileRedirects = redirects.filter(rule =>
      rule.source.startsWith('/:username/')
    );

    expect(profileRedirects).toEqual([]);
  });

  it('routes legacy aliases through the collision-safe resolver after filesystem matches', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const afterFiles = getAfterFilesRewrites(await nextConfig.rewrites());

    expect(afterFiles.slice(0, 6)).toEqual(
      ['listen', 'music', 'releases', 'subscribe', 'tip', 'tour'].map(
        alias => ({
          source: `/:username/${alias}`,
          destination: `/:username/${alias}/__profile-mode-alias/resolve`,
        })
      )
    );
  });

  it.each([
    ['listen', 'listen'],
    ['music', 'listen'],
    ['releases', 'releases'],
    ['subscribe', 'subscribe'],
    ['tip', 'pay'],
    ['tour', 'tour'],
  ] as const)('maps the missing %s slug to %s mode', (slug, mode) => {
    expect(
      getLegacyProfileModeRedirectHref('dualipa', slug, { source: 'qr' })
    ).toBe(`/dualipa?mode=${mode}&source=qr`);
  });

  it('leaves arbitrary content slugs to the smart-link route', () => {
    expect(
      getLegacyProfileModeRedirectHref('dualipa', 'future-nostalgia', {
        source: 'qr',
      })
    ).toBeNull();
  });

  it('normalizes repeated attribution values without losing the first source', () => {
    expect(
      getProfileModeRedirectHref(
        'dualipa',
        { source: ['', 'qr', 'campaign'] },
        'tour'
      )
    ).toBe('/dualipa?mode=tour&source=qr');
  });
});
