import { describe, expect, it } from 'vitest';
import {
  PROFILE_QUERY_MODES,
  resolveProfileModeQueryRewrite,
} from '@/lib/routing/profile-mode-query-rewrite';

interface RewriteRule {
  readonly source: string;
  readonly destination: string;
  readonly has?: readonly { type: string; key: string; value?: string }[];
}

function rewriteFor(path: string, method = 'GET') {
  return resolveProfileModeQueryRewrite({
    method,
    nextUrl: new URL(`https://jov.ie${path}`),
  });
}

describe('resolveProfileModeQueryRewrite', () => {
  it('sends /<username>?mode=<mode> to the private mode render route', () => {
    const rewrite = rewriteFor('/tim?mode=listen&source=qr');
    expect(rewrite?.pathname).toBe(
      '/tim/profile-mode-render/listen/__profile-mode-alias'
    );
    expect(rewrite?.search).toBe('?mode=listen&source=qr');
    expect(rewriteFor('/Tim?mode=pay', 'HEAD')?.pathname).toBe(
      '/Tim/profile-mode-render/pay/__profile-mode-alias'
    );
  });

  it('ignores everything the next.config rewrite would not render as a mode', () => {
    for (const path of [
      '/tim',
      '/tim?mode=profile',
      '/tim?mode=kiosk',
      '/tim?mode=LISTEN',
      '/tim/about?mode=listen',
      '/pricing?mode=pay',
      '/api?mode=listen',
      '/signin?mode=subscribe',
    ]) {
      expect(rewriteFor(path), path).toBeNull();
    }
    expect(rewriteFor('/tim?mode=listen', 'POST')).toBeNull();
  });

  it('serves the same modes as the afterFiles rewrite in next.config.js', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const rewrites = await nextConfig.rewrites();
    const rule = (rewrites.afterFiles as RewriteRule[]).find(
      candidate =>
        candidate.source === '/:username' &&
        candidate.has?.some(has => has.key === 'mode')
    );
    const pattern = rule?.has?.find(has => has.key === 'mode')?.value ?? '';
    const modes = /\(\?<profileMode>([^)]*)\)/.exec(pattern)?.[1]?.split('|');

    expect(rule?.destination).toBe(
      '/:username/profile-mode-render/:profileMode/__profile-mode-alias'
    );
    expect(modes?.toSorted()).toEqual([...PROFILE_QUERY_MODES].sort());
  }, 20_000);
});
