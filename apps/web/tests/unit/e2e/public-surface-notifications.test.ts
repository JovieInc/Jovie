import { describe, expect, it } from 'vitest';
import { resolvePublicSurfaceManifestSync } from '../../e2e/utils/public-surface-manifest';

function handleOf(path: string): string {
  const [handle] = path.split(/[/?]/).filter(Boolean);
  if (!handle) {
    throw new Error(`Expected a profile handle in ${path}`);
  }
  return handle;
}

describe('profile-notifications public surface', () => {
  it('requires the subscribe flow on the claimed music profile', () => {
    const manifest = resolvePublicSurfaceManifestSync();
    const notifications = manifest.find(
      surface => surface.id === 'profile-notifications'
    );
    const music = manifest.find(surface => surface.id === 'profile-music');
    const pay = manifest.find(surface => surface.id === 'profile-pay');

    expect(notifications).toBeDefined();
    expect(music).toBeDefined();
    expect(pay).toBeDefined();
    if (!notifications || !music || !pay) return;

    expect(notifications.resolvedPath).toBe(
      `/${handleOf(music.resolvedPath)}/notifications`
    );
    expect(handleOf(notifications.resolvedPath)).not.toBe(
      handleOf(pay.resolvedPath)
    );
    expect(notifications.readySelectors).toEqual([
      '[data-testid="profile-mobile-notifications-flow"]',
    ]);
    expect(
      notifications.readySelectors.some(selector =>
        selector.includes('profile-header')
      )
    ).toBe(false);
  });
});
