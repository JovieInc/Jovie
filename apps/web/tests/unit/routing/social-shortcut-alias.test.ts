import { describe, expect, it } from 'vitest';
import {
  SOCIAL_SHORTCUT_SLUG_MAP,
  SOCIAL_SHORTCUT_SLUGS,
} from '@/lib/social/shortcut-platforms';

interface RewriteRule {
  readonly source: string;
  readonly destination: string;
  readonly has?: readonly unknown[];
}

function getAfterFilesRewrites(
  rewrites:
    | RewriteRule[]
    | {
        readonly beforeFiles?: readonly RewriteRule[];
        readonly afterFiles?: readonly RewriteRule[];
        readonly fallback?: readonly RewriteRule[];
      }
): readonly RewriteRule[] {
  return Array.isArray(rewrites) ? rewrites : (rewrites.afterFiles ?? []);
}

async function loadAfterFilesRewrites(): Promise<readonly RewriteRule[]> {
  const nextConfigModule = await import('../../../next.config.js');
  const nextConfig = nextConfigModule.default ?? nextConfigModule;
  return getAfterFilesRewrites(await nextConfig.rewrites());
}

describe('social shortcut alias rewrite (JOV-5072)', () => {
  it('aliases /{username}/{platform} onto the live /s/{platform} handler', async () => {
    const afterFiles = await loadAfterFilesRewrites();

    expect(afterFiles).toContainEqual({
      source: '/:username/:platform(ig|tt|x|yt|sp|web)',
      destination: '/:username/s/:platform',
    });
  });

  it('keeps the alias alternation in sync with SOCIAL_SHORTCUT_SLUG_MAP', async () => {
    const afterFiles = await loadAfterFilesRewrites();
    const aliasRewrite = afterFiles.find(rule =>
      rule.destination.endsWith('/s/:platform')
    );
    expect(aliasRewrite).toBeDefined();

    const alternation = aliasRewrite?.source.match(/\(([^)]+)\)/)?.[1] ?? '';
    expect(alternation.split('|').sort()).toEqual(
      [...SOCIAL_SHORTCUT_SLUGS].sort()
    );
  });

  it('matches only the bare short slugs, not full names or other segments', () => {
    const pattern = new RegExp(
      `^(${Object.keys(SOCIAL_SHORTCUT_SLUG_MAP).join('|')})$`
    );

    for (const slug of SOCIAL_SHORTCUT_SLUGS) {
      expect(pattern.test(slug)).toBe(true);
    }
    expect(pattern.test('instagram')).toBe(false);
    expect(pattern.test('spotify')).toBe(false);
    expect(pattern.test('listen')).toBe(false);
    expect(pattern.test('ig/extra')).toBe(false);
  });

  it('runs after filesystem routes so concrete pages keep precedence', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const rewrites = await nextConfig.rewrites();

    expect(Array.isArray(rewrites)).toBe(false);
    expect(
      (rewrites as { beforeFiles?: readonly RewriteRule[] }).beforeFiles ?? []
    ).toHaveLength(0);
  });
});
