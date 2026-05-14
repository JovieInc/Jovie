/**
 * Render-layer dedupe + fail-safe label regression tests.
 *
 * Targets the reported JOV-2149 bug ("YouTube YouTube YouTube" in the
 * Social tab) at the component layer. The parser/property tests live in
 * `social-platform.property.test.ts`; this file validates the rendered
 * DOM. Together they exercise gotcha class #1 (duplicate items) and
 * class #2 (placeholder strings rendered as real content).
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { expectNoBrokenStrings } from '../../helpers/broken-string-scan';

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({ platform }: { platform: string }) =>
    React.createElement('span', {
      'data-testid': `social-icon-${platform}`,
    }),
}));

vi.mock('@/components/atoms/VerifiedBadge', () => ({
  VerifiedBadge: () =>
    React.createElement('span', { 'data-testid': 'verified-badge' }),
}));

vi.mock('@/components/atoms/SwipeToReveal', () => ({
  SwipeToReveal: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'swipe-reveal' }, children),
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerLinkSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': `link-section-${title}` },
      children
    ),
  SidebarLinkRow: ({ label }: { label: string }) =>
    React.createElement(
      'div',
      {
        'data-testid': `sidebar-link-row-${label}`,
      },
      React.createElement('span', null, label)
    ),
}));

vi.mock('@jovie/ui', () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeLink(
  overrides: Partial<PreviewPanelLink> & {
    id: string;
    platform: string;
    url: string;
  }
): PreviewPanelLink {
  return {
    title: overrides.platform,
    isVisible: true,
    ...overrides,
  };
}

describe('ProfileLinkList — render-layer dedupe and label fallback', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('collapses three identical YouTube rows into one row', async () => {
    const { ProfileLinkList } = await import(
      '@/features/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
    );

    // Exact reproduction of the production screenshot data.
    const links: PreviewPanelLink[] = [
      makeLink({
        id: '1',
        platform: 'youtube',
        url: 'https://youtube.com/@timwhite',
      }),
      makeLink({
        id: '2',
        platform: 'youtube',
        url: 'https://youtube.com/@timwhite/',
      }),
      makeLink({
        id: '3',
        platform: 'youtube',
        url: 'https://YOUTUBE.COM/@timwhite',
      }),
    ];

    render(<ProfileLinkList links={links} selectedCategory='social' />);

    const rows = screen.getAllByTestId(/^sidebar-link-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('@timwhite');
  });

  it('keeps multiple legitimate YouTube channels with distinct URLs', async () => {
    const { ProfileLinkList } = await import(
      '@/features/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
    );

    const links: PreviewPanelLink[] = [
      makeLink({
        id: '1',
        platform: 'youtube',
        url: 'https://youtube.com/@timwhite',
      }),
      makeLink({
        id: '2',
        platform: 'youtube',
        url: 'https://youtube.com/@itstimwhite',
      }),
    ];

    render(<ProfileLinkList links={links} selectedCategory='social' />);

    expect(screen.getAllByTestId(/^sidebar-link-row-/)).toHaveLength(2);
  });

  it('falls back to a hostname (not the platform name) when no handle is extractable', async () => {
    const { ProfileLinkList } = await import(
      '@/features/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
    );

    // YouTube URL with no @handle segment — extractHandleFromUrl returns null.
    const links: PreviewPanelLink[] = [
      makeLink({
        id: '1',
        platform: 'youtube',
        url: 'https://youtube.com/channel/UCxyz',
      }),
    ];

    const { container } = render(
      <ProfileLinkList links={links} selectedCategory='social' />
    );

    // Must render `youtube.com`, not the bare word "YouTube" (which masqueraded
    // as a real handle in the production screenshot).
    expect(screen.getByText('youtube.com')).toBeDefined();
    expect(screen.queryByText('YouTube')).toBeNull();

    // Catch the broader class — no `undefined`, `null`, `NaN`, etc. in output.
    expectNoBrokenStrings(container);
  });

  it('renders multiple platforms with no duplicates after a noisy fixture (regression)', async () => {
    const { ProfileLinkList, getCategoryCounts } = await import(
      '@/features/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
    );

    // Recreates the production screenshot exactly: Instagram + TikTok +
    // YouTube × 3 (two dupes + one malformed handle-less URL).
    const links: PreviewPanelLink[] = [
      makeLink({
        id: '1',
        platform: 'youtube',
        url: 'https://youtube.com/@timwhite',
      }),
      makeLink({
        id: '2',
        platform: 'instagram',
        url: 'https://instagram.com/timwhite',
      }),
      makeLink({
        id: '3',
        platform: 'tiktok',
        url: 'https://tiktok.com/@itstimwhite',
      }),
      makeLink({
        id: '4',
        platform: 'youtube',
        url: 'https://youtube.com/@timwhite/',
      }),
      makeLink({
        id: '5',
        platform: 'youtube',
        url: 'https://youtube.com/channel/UCxyz',
      }),
    ];

    const { container } = render(
      <ProfileLinkList links={links} selectedCategory='social' />
    );

    // 4 distinct destinations: 1 IG, 1 TT, 2 YT (one handle, one channel).
    expect(screen.getAllByTestId(/^sidebar-link-row-/)).toHaveLength(4);
    // The badge counter must agree with the rendered row count.
    expect(getCategoryCounts(links).social).toBe(4);
    // No placeholder strings should leak through.
    expectNoBrokenStrings(container);
  });
});
