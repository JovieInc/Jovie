import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import NewLandingPage from '@/app/(marketing)/new/page';
import { resolvePublicSurfaceManifestSync } from '../../e2e/utils/public-surface-manifest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
}));

describe('new landing public surface', () => {
  it('audits the homepage reached by the real alias redirect', () => {
    expect(() => NewLandingPage()).toThrow('redirect');
    const target = vi.mocked(redirect).mock.calls.at(-1)?.[0] ?? '';
    expect(target).toBe('/');

    const surface = resolvePublicSurfaceManifestSync().find(
      item => item.id === 'marketing-new'
    );
    expect(surface?.expectedState).toBe('redirect');
    expect(
      surface?.expectedRedirects?.some(pattern => pattern.test(target))
    ).toBe(true);
    expect(surface?.readySelectors).toEqual(['h1', 'main']);
  });
});
