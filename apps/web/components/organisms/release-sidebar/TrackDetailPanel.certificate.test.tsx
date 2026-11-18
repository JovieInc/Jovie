import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { TrackForDetail } from './TrackDetailPanel';
import { TrackDetailPanel } from './TrackDetailPanel';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/feedback', () => ({ toast: toastMock }));
vi.mock('@/lib/utils/platform-detection', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/utils/platform-detection')>()),
  getBaseUrl: () => 'https://jov.ie',
}));

const track: TrackForDetail = {
  title: 'Summer Lights (Radio Edit)',
  smartLinkPath: '/smart/track-1',
  trackNumber: 2,
  discNumber: 1,
  durationMs: 187_000,
  isrc: 'USABC2600001',
  isExplicit: false,
  providers: [
    { key: 'spotify', label: 'Spotify', url: 'https://open.spotify.com/t/1' },
    { key: 'deezer', label: 'Deezer', url: '' },
  ],
};

describe('TrackDetailPanel certificate', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it('goes back to the release, axe-clean', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const { container } = render(
      <TrackDetailPanel
        track={track}
        releaseTitle='Summer Lights'
        onBack={onBack}
      />
    );

    await user.click(screen.getByRole('button', { name: /Summer Lights$/ }));
    expect(onBack).toHaveBeenCalledOnce();
    // Only providers with a URL are listed.
    expect(screen.getByRole('link', { name: /Spotify/ })).toBeInTheDocument();
    expect(screen.queryByText('Deezer')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('copies the ISRC and confirms it', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    render(
      <TrackDetailPanel
        track={track}
        releaseTitle='Summer Lights'
        onBack={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Copy ISRC/ }));

    expect(writeText).toHaveBeenCalledWith('USABC2600001');
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('ISRC copied')
    );
    writeText.mockRestore();
  });

  it('reports a failed ISRC copy', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('denied'));
    render(
      <TrackDetailPanel
        track={track}
        releaseTitle='Summer Lights'
        onBack={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Copy ISRC/ }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Failed to copy ISRC')
    );
    writeText.mockRestore();
  });

  it('hides the actions card without an ISRC, axe-clean', async () => {
    const { container } = render(
      <TrackDetailPanel
        track={{ ...track, isrc: null, providers: [] }}
        releaseTitle='Summer Lights'
        onBack={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Copy ISRC/ })).toBeNull();
    expect(screen.getByTestId('track-platforms-empty')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
