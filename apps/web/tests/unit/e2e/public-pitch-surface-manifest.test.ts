import { describe, expect, it } from 'vitest';
import { resolvePublicSurfaceManifestSync } from '@/tests/e2e/utils/public-surface-manifest';

describe('public pitch surface manifest', () => {
  it('keeps pitch in canonical public axe, exhaustive, and overflow coverage', () => {
    const pitch = resolvePublicSurfaceManifestSync().find(
      surface => surface.id === 'investor-pitch'
    );
    expect(pitch).toMatchObject({
      path: '/pitch',
      expectedState: 'ok',
      mainSelector: 'main',
    });
    expect(pitch?.readySelectors).toEqual(
      expect.arrayContaining([
        'h1',
        '[data-pitch-slide]',
        '[data-testid="pitch-appendix"]',
      ])
    );
  });
});
