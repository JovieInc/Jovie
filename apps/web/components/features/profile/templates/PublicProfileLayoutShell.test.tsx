import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

const baseProps = {
  artistName: 'Artist Name',
  heroImageUrl: null,
  heroImageError: false,
  shouldRenderHeading: true,
  profileAccentStyle: {},
  compactSurface: <div>Compact profile</div>,
  desktopSurface: <div>Desktop profile</div>,
};

describe('PublicProfileLayoutShell', () => {
  it('does not infer a banner height from a child that renders null', () => {
    function NoBanner() {
      return null;
    }
    render(
      <PublicProfileLayoutShell
        {...baseProps}
        isDesktopLayout
        desktopBanner={<NoBanner />}
      />
    );
    // :empty controls layout before paint; no mount effect guesses visibility.
    expect(screen.getByTestId('profile-desktop-banner')).toBeEmptyDOMElement();
    expect(screen.getByTestId('profile-desktop-shell')).not.toHaveClass(
      'profile-desktop-surface--banner'
    );
  });

  it('offers a noninteractive desktop loading state before hydration', () => {
    render(<PublicProfileLayoutShell {...baseProps} isDesktopLayout={false} />);
    expect(screen.getByTestId('profile-desktop-loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByTestId('profile-desktop-loading')).not.toHaveAttribute(
      'data-interactive-ready'
    );
  });
  it('mounts only the selected responsive surface', () => {
    const { rerender } = render(
      <PublicProfileLayoutShell {...baseProps} isDesktopLayout={false} />
    );

    expect(screen.getByText('Compact profile')).toBeInTheDocument();
    expect(screen.queryByText('Desktop profile')).not.toBeInTheDocument();

    rerender(
      <PublicProfileLayoutShell {...baseProps} isDesktopLayout={true} />
    );

    expect(screen.getByText('Desktop profile')).toBeInTheDocument();
    expect(screen.queryByText('Compact profile')).not.toBeInTheDocument();
  });

  it('labels an embedded compact preview and exposes an exit', () => {
    render(
      <PublicProfileLayoutShell
        {...baseProps}
        isDesktopLayout={false}
        embedded
        previewExitHref='/artist-name'
      />
    );

    expect(screen.getByTestId('profile-preview-label')).toHaveTextContent(
      'Preview'
    );
    expect(
      screen.getByRole('link', { name: 'Open full profile' })
    ).toHaveAttribute('href', '/artist-name');
  });
});
