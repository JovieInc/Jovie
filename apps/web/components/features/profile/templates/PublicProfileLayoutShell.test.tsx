import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => false,
}));

vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: vi.fn(),
  rememberProofClaimAttribution: vi.fn(),
}));

const commonProps = {
  artistName: 'Unfazed',
  heroImageUrl: null,
  heroImageError: false,
  shouldRenderHeading: true,
  profileAccentStyle: {},
  compactSurface: <div data-testid='compact-content'>Compact</div>,
  desktopSurface: <div data-testid='desktop-content'>Desktop</div>,
};

describe('PublicProfileLayoutShell', () => {
  it('owns exactly the desktop surface in desktop layout', () => {
    render(
      <PublicProfileLayoutShell
        {...commonProps}
        isDesktopLayout={true}
        desktopSurfaceReady
      />
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-layout',
      'desktop'
    );
    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-desktop-ready',
      'true'
    );
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    expect(screen.queryByTestId('compact-content')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps compact content available to assistive tech until the desktop surface is ready', () => {
    render(
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout={true} />
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-layout',
      'desktop'
    );
    expect(screen.getByTestId('compact-content')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shares server-rendered desktop content below the desktop boundary', () => {
    render(
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout={false} />
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-layout',
      'compact'
    );
    expect(screen.getByTestId('compact-content')).toBeInTheDocument();
    // Both surfaces are SSR'd and CSS picks the visible one per breakpoint, so
    // a cold desktop load never morphs through a mobile shell or loading text
    // (JOV-6452).
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-desktop-loading')).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('labels an embedded compact surface as a preview with an exit', () => {
    render(
      <PublicProfileLayoutShell
        {...commonProps}
        isDesktopLayout={false}
        embedded
        previewExitHref='/unfazed'
      />
    );

    expect(screen.getByTestId('profile-preview-label')).toHaveTextContent(
      'Preview'
    );
    expect(screen.getByTestId('profile-preview-exit')).toHaveAttribute(
      'href',
      '/unfazed'
    );
  });

  it('forwards the proof-to-claim footer without calling the profile unclaimed', () => {
    render(
      <PublicProfileLayoutShell
        {...commonProps}
        isDesktopLayout={true}
        showClaimFooter
        claimFooterHref='/waitlist?campaign=proof-to-claim'
        claimFooterLabel='Request access'
        proofClaim
      />
    );

    const cta = screen.getByTestId('profile-claim-footer-cta');
    expect(cta).toHaveAttribute('href', '/waitlist?campaign=proof-to-claim');
    expect(cta).toHaveTextContent('Request access');
    expect(screen.queryByText(/unclaimed/i)).toBeNull();
  });

  it('does not infer a banner height from a child that renders null', () => {
    function NoBanner() {
      return null;
    }

    render(
      <PublicProfileLayoutShell
        {...commonProps}
        isDesktopLayout
        desktopBanner={<NoBanner />}
      />
    );
    expect(screen.getByTestId('profile-desktop-banner')).toBeEmptyDOMElement();
  });

  it('renders the real desktop surface instead of a loading interstitial before hydration', () => {
    render(
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout={false} />
    );

    expect(screen.queryByTestId('profile-desktop-loading')).toBeNull();
    expect(screen.queryByText('Loading profile…')).toBeNull();
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
  });

  it('keeps the desktop placeholder for embedded previews', () => {
    render(
      <PublicProfileLayoutShell
        {...commonProps}
        isDesktopLayout={false}
        embedded
      />
    );

    expect(screen.getByTestId('profile-desktop-loading')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.queryByTestId('desktop-content')).toBeNull();
  });
});
