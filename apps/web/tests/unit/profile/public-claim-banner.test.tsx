import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicClaimBanner } from '@/app/[username]/_components/PublicClaimBanner';
import { track } from '@/lib/analytics';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    'data-testid': testId,
  }: {
    href: string;
    children: ReactNode;
    'data-testid'?: string;
  }) => (
    <a href={href} data-testid={testId}>
      {children}
    </a>
  ),
}));

const READY_COPY = 'Your profile is ready. Claim it to turn on release emails.';
const ORGANIC_COPY =
  'This profile is unclaimed. Is it yours? Claim it with Spotify.';

const banner = () => (
  <PublicClaimBanner
    profileHandle='test-artist'
    displayName='Test Artist'
    directClaimSupported
    isClaimed={false}
    visitorState='organic_unclaimed'
  />
);

describe('PublicClaimBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '';
  });

  it('carries campaign attribution to the real claim CTA without forwarding unsafe parameters', () => {
    window.history.replaceState(
      null,
      '',
      '/test-artist?claim=1&utm_campaign=claim-link-outreach&utm_source=claim_link&utm_medium=dm&token=synthetic&redirect_url=https://evil.example'
    );
    render(banner());
    const href = screen.getByTestId('claim-banner-cta').getAttribute('href');
    const destination = new URL(href!, 'https://jov.ie');
    expect(destination.pathname).toBe('/test-artist/claim');
    expect(destination.searchParams.get('next')).toBe('auth');
    expect(destination.searchParams.get('utm_campaign')).toBe(
      'claim-link-outreach'
    );
    expect(destination.searchParams.has('token')).toBe(false);
    expect(destination.searchParams.has('redirect_url')).toBe(false);
  });

  it('server-renders both copies in one cell so a claim link cannot change its height', () => {
    const html = renderToString(banner());

    expect(html).toContain('data-testid="claim-banner-copy"');
    expect(html).toContain(ORGANIC_COPY);
    expect(html).toContain('data-testid="claim-banner-reserved-copy"');
    expect(html).toContain(READY_COPY);
  });

  it('hydrates a claim link into the ready copy and counts only that impression', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(banner());
    document.body.appendChild(container);
    window.history.replaceState(null, '', '/test-artist?claim=1');

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, banner());
    });

    await waitFor(() => {
      expect(screen.getByTestId('claim-banner-copy')).toHaveTextContent(
        READY_COPY
      );
    });
    expect(screen.getByTestId('claim-banner-reserved-copy')).toHaveTextContent(
      ORGANIC_COPY
    );
    const variants = vi
      .mocked(track)
      .mock.calls.filter(
        ([event]) => event === 'profile_claim_banner_impression'
      )
      .map(([, props]) => (props as { variant: string }).variant);
    expect(variants).toEqual(['claim_intent']);

    act(() => root?.unmount());
  });

  it('reserves nothing when the claim link cannot change the copy', () => {
    render(
      <PublicClaimBanner
        profileHandle='test-artist'
        displayName='Test Artist'
        directClaimSupported
        isClaimed={false}
        visitorState='claim_intent_token'
      />
    );

    expect(screen.getByTestId('claim-banner-copy')).toHaveTextContent(
      READY_COPY
    );
    expect(screen.queryByTestId('claim-banner-reserved-copy')).toBeNull();
  });
});
