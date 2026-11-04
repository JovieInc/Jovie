/**
 * The release-alerts page is a phone/email signup form. Third-party pixels
 * and replay tools must not load where people type (CIPA wiretap exposure;
 * canon: gbrain decisions/company/privacy-tracking-compliance-guidelines).
 * Executes the real page with the profile loader mocked at its boundary.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getProfileAndLinksMock, notFoundMock } = vi.hoisted(() => ({
  getProfileAndLinksMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: getProfileAndLinksMock,
}));
vi.mock('@/components/features/alerts/AlertGrowthLanding', () => ({
  AlertGrowthLanding: () => null,
}));

import AlertsPage, { generateMetadata } from '@/app/[username]/alerts/page';

const profile = {
  id: 'p1',
  username: 'tim',
  display_name: 'Tim White',
  is_public: true,
  creator_meta_pixel_id: '1234567890',
};

function collectTypeNames(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) collectTypeNames(child, out);
  } else if (isValidElement(node)) {
    const type = node.type as { displayName?: string; name?: string } | string;
    out.push(
      typeof type === 'string' ? type : (type.displayName ?? type.name ?? '')
    );
    collectTypeNames((node.props as { children?: ReactNode }).children, out);
  }
  return out;
}

describe('release alerts page', () => {
  beforeEach(() => {
    getProfileAndLinksMock.mockReset();
    notFoundMock.mockClear();
  });

  it('mounts no tracker component even when the creator has a Meta pixel id', async () => {
    getProfileAndLinksMock.mockResolvedValue({
      status: 'ok',
      profile,
      links: [],
      creatorMetaPixelId: '1234567890',
    });

    const tree = await AlertsPage({
      params: Promise.resolve({ username: 'tim' }),
    });
    const names = collectTypeNames(tree);

    expect(names).toContain('AlertGrowthLanding');
    expect(names.filter(n => /Pixel|Analytics|Retargeting/i.test(n))).toEqual(
      []
    );
  });

  it('404s when the profile does not exist', async () => {
    getProfileAndLinksMock.mockResolvedValue({
      status: 'not_found',
      profile: null,
    });

    await expect(
      AlertsPage({ params: Promise.resolve({ username: 'nobody' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('builds a canonical, alerts-specific title for an existing profile', async () => {
    getProfileAndLinksMock.mockResolvedValue({
      status: 'ok',
      profile,
      links: [],
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ username: 'tim' }),
    });

    expect(meta.title).toBe('Get release alerts from Tim White');
    expect(meta.alternates?.canonical).toMatch(/\/tim\/alerts$/);
  });

  it('falls back to a generic title when the profile is missing', async () => {
    getProfileAndLinksMock.mockResolvedValue({
      status: 'not_found',
      profile: null,
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ username: 'nobody' }),
    });

    expect(String(meta.title)).toMatch(/^Get release alerts/);
  });
});
