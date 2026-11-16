import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeProfileShowcase } from './HomeProfileShowcase';

const { captureSurface } = vi.hoisted(() => ({ captureSurface: vi.fn() }));
vi.mock('../profile/templates/ProfileCompactSurface', () => ({
  ProfileCompactSurface: (props: Record<string, unknown>) => {
    captureSurface(props);
    return <div data-testid='mounted-preview' />;
  },
}));

describe('HomeProfileShowcase certificate', () => {
  beforeEach(() => captureSurface.mockClear());

  it('renders an empty Events tab with no tour dates or releases', async () => {
    const { container } = render(
      <HomeProfileShowcase stateId='events-empty' />
    );

    expect(screen.getByTestId('mounted-preview')).toBeInTheDocument();
    expect(captureSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        tourDates: [],
        releases: [],
        latestRelease: null,
        drawerOpen: true,
        drawerView: 'tour',
        activeMode: 'tour',
      })
    );
    await expectNoA11yViolations(container);
  });

  it('falls back to a playlist when there is no release or tour', async () => {
    const { container } = render(
      <HomeProfileShowcase stateId='playlist-fallback' />
    );

    expect(captureSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        featuredPlaylistFallback: expect.anything(),
        tourDates: [],
        latestRelease: null,
      })
    );
    await expectNoA11yViolations(container);
  });

  it('shows only the overlay card when the surface is hidden', async () => {
    const { container } = render(
      <HomeProfileShowcase
        stateId='tips-apple-pay'
        presentation='surface-card'
        overlayMode='only'
      />
    );

    expect(
      screen.getByTestId('homepage-overlay-apple-pay')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mounted-preview')).not.toBeInTheDocument();
    expect(captureSurface).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('homepage-phone-state-tips-apple-pay')
    ).toHaveAttribute('data-overlay-mode', 'only');
    await expectNoA11yViolations(container);
  });

  it('hides the overlay card when the overlay mode is hidden', async () => {
    const { container } = render(
      <HomeProfileShowcase stateId='tips-apple-pay' overlayMode='hidden' />
    );

    expect(
      screen.queryByTestId('homepage-overlay-apple-pay')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('mounted-preview')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the preview inert and axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomeProfileShowcase stateId='streams-latest' cropAnchor='right' />
      </div>
    );

    const root = screen.getByTestId('homepage-phone-state-streams-latest');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveAttribute('inert');
    expect(root).toHaveAttribute('data-crop-anchor', 'right');
    await expectNoA11yViolations(container);
  });
});
