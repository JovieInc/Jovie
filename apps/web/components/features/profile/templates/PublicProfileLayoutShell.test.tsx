import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

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
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout={true} />
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-layout',
      'desktop'
    );
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    expect(screen.queryByTestId('compact-content')).not.toBeInTheDocument();
  });

  it('owns exactly the compact surface below the desktop boundary', () => {
    render(
      <PublicProfileLayoutShell {...commonProps} isDesktopLayout={false} />
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-layout',
      'compact'
    );
    expect(screen.getByTestId('compact-content')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-content')).not.toBeInTheDocument();
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
});
