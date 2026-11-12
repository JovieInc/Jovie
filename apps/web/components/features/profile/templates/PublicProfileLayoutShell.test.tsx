import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => false,
}));

const emitProofClaimEvent = vi.fn();

vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: (...args: unknown[]) => emitProofClaimEvent(...args),
  rememberProofClaimAttribution: vi.fn(),
}));

// Clicks stay on the page: jsdom cannot navigate to another document.
const stayOnPage = (event: MouseEvent) => event.preventDefault();

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

  it('marks the viewport for the desktop hand-off only when a desktop surface ships', () => {
    render(
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout={false} />
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveClass(
      'profile-viewport--desktop-surface'
    );
  });

  it('renders only the compact column when the desktop surface is flagged off', () => {
    const { desktopSurface: _desktopSurface, ...compactOnlyProps } =
      commonProps;
    render(
      <PublicProfileLayoutShell
        {...compactOnlyProps}
        isDesktopLayout={false}
        desktopBanner={<div data-testid='desktop-banner-content'>Banner</div>}
        showClaimFooter
        claimFooterHref='/test/claim'
      />
    );

    const viewport = screen.getByTestId('public-profile-layout-shell');
    expect(viewport).toHaveAttribute('data-layout', 'compact');
    expect(viewport).not.toHaveClass('profile-viewport--desktop-surface');
    expect(screen.getByTestId('compact-content')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-desktop-shell')).toBeNull();
    expect(screen.queryByTestId('desktop-banner-content')).toBeNull();
    expect(screen.queryByTestId('profile-desktop-loading')).toBeNull();
    // The claim footer still sits under the centered column.
    expect(screen.getByTestId('profile-claim-footer-cta')).toHaveAttribute(
      'href',
      '/test/claim'
    );
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

  it('the build-time flag default and the e2e shipped-build helper agree', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', undefined);
    const { PROFILE_DESKTOP_SURFACE_ENABLED } = await import(
      '@/lib/profile/desktop-surface-flag'
    );
    const { PROFILE_DESKTOP_SURFACE_SHIPPED } = await import(
      '@/tests/e2e/utils/profile-desktop-surface'
    );
    expect(PROFILE_DESKTOP_SURFACE_ENABLED).toBe(true);
    expect(PROFILE_DESKTOP_SURFACE_SHIPPED).toBe(
      PROFILE_DESKTOP_SURFACE_ENABLED
    );
  });
});

describe('PublicProfileLayoutShell states', () => {
  it('draws the stage scrim and the plain accent glow from profile tokens', async () => {
    const { container } = render(
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout={false} />
    );

    // Both layers resolve on the shell's own .profile-viewport element, so the
    // inline artist accent still drives the glow.
    expect(
      container.querySelector('.bg-\\(image\\:--profile-stage-scrim\\)')
    ).not.toBeNull();
    expect(
      container.querySelector('.bg-\\(image\\:--profile-stage-ambient-glow\\)')
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps compact and desktop surfaces while the desktop hand-off loads', async () => {
    const { container } = render(
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout />
    );

    expect(
      screen.getByTestId('public-profile-layout-shell')
    ).not.toHaveAttribute('data-desktop-ready');
    expect(screen.getByTestId('compact-content')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lets a keyboard user leave an embedded preview for the full profile', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PublicProfileLayoutShell
        {...commonProps}
        isDesktopLayout={false}
        embedded
        previewExitHref='/unfazed'
      />
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-profile-preview',
      'true'
    );
    expect(screen.getByTestId('profile-desktop-loading')).toHaveTextContent(
      'Loading profile…'
    );
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Open full profile' })
    ).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders only the compact column with no desktop surface or footer', async () => {
    const { desktopSurface: _desktopSurface, ...compactOnlyProps } =
      commonProps;
    const { container } = render(
      <PublicProfileLayoutShell {...compactOnlyProps} isDesktopLayout={false} />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Unfazed'
    );
    expect(screen.queryByTestId('profile-claim-footer')).toBeNull();
    expect(screen.queryByTestId('profile-desktop-shell')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('carries a long name and claim label and sends the claim click', async () => {
    const user = userEvent.setup();
    document.addEventListener('click', stayOnPage);
    const label =
      'Request early access to your own Jovie profile for every release and tour date';
    const artistName =
      'The Los Angeles After Hours Orchestra and Friends Featuring Everyone';
    const { container } = render(
      <PublicProfileLayoutShell
        {...commonProps}
        artistName={artistName}
        heroImageUrl='/images/avatars/tim-white-founder.jpg'
        isDesktopLayout
        desktopSurfaceReady
        showClaimFooter
        claimFooterHref='/waitlist?campaign=proof-to-claim'
        claimFooterLabel={label}
        proofClaim
      />
    );

    expect(
      container.querySelector('.bg-\\(image\\:--profile-stage-ambient-glow\\)')
    ).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      artistName
    );
    await user.click(screen.getByRole('link', { name: `Jovie · ${label}` }));
    expect(emitProofClaimEvent).toHaveBeenCalledWith(
      'claim_started',
      expect.objectContaining({ label })
    );
    document.removeEventListener('click', stayOnPage);
    await expectNoA11yViolations(container);
  });

  it('keeps the stage and footer readable in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PublicProfileLayoutShell
          {...commonProps}
          artistName='منتصف الليل'
          isDesktopLayout={false}
          showClaimFooter
          claimFooterHref='/claim'
          claimFooterLabel='اطلب الوصول'
        />
      </div>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'منتصف الليل'
    );
    expect(screen.getByTestId('profile-claim-footer-cta')).toHaveTextContent(
      'اطلب الوصول'
    );
    await expectNoA11yViolations(container);
  });
});
