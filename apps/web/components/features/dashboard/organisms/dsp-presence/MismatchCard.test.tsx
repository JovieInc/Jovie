import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MismatchCard } from './MismatchCard';
import type { CatalogMismatch } from './types';

const mismatch: CatalogMismatch = {
  id: 'mismatch-1',
  scanId: 'scan-1',
  creatorProfileId: 'profile-1',
  isrc: 'USRC17607839',
  mismatchType: 'not_in_catalog',
  externalTrackId: 'track-1',
  externalTrackName: 'Midnight Drive',
  externalAlbumName: 'Night Sessions',
  externalAlbumId: 'album-1',
  externalArtworkUrl: 'https://i.scdn.co/image/cover.jpg',
  externalArtistNames: 'Midnight Echo',
  status: 'flagged',
  dismissedAt: null,
  dismissedReason: null,
  dedupKey: 'dedup-1',
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

function renderCard(
  onAction = vi.fn(async () => true),
  item: CatalogMismatch = mismatch
) {
  const onRemoved = vi.fn();
  const view = render(
    <ul>
      <MismatchCard mismatch={item} onAction={onAction} onRemoved={onRemoved} />
    </ul>
  );
  return { ...view, onAction, onRemoved };
}

describe('MismatchCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the flagged track axe-clean with sized artwork', async () => {
    const { container } = renderCard();
    const artwork = container.querySelector('img');
    expect(artwork).toHaveAttribute('width', '32');
    expect(artwork).toHaveAttribute('height', '32');
    expect(
      screen.getByRole('link', { name: 'Open Midnight Drive on Spotify' })
    ).toHaveAttribute('href', 'https://open.spotify.com/track/track-1');
    await expectNoA11yViolations(container);
  });

  it('commits Not Mine after the undo window and removes the card', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container, onAction, onRemoved } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Not Mine' }));
    expect(screen.getByRole('status')).toHaveTextContent('Marked as not yours');
    expect(onAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onAction).toHaveBeenCalledWith('mismatch-1', 'confirmed_mismatch');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(onRemoved).toHaveBeenCalledWith('mismatch-1', 'confirmed_mismatch');
    expect(container.querySelector('li')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('undoes a pending Mine answer before it is sent', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container, onAction } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Mine' }));
    expect(screen.getByRole('status')).toHaveTextContent('Dismissed');
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mine' })).toBeInTheDocument();
  });

  it('shows Retry when the update fails and retries the same answer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onAction = vi.fn(async () => false);
    const { container } = renderCard(onAction);

    await user.click(screen.getByRole('button', { name: 'Not Mine' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to update. Try again.'
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith('mismatch-1', 'dismissed');
    await expectNoA11yViolations(container);
  });

  it('falls back to the ISRC and an unknown artist without a track link', async () => {
    const { container } = renderCard(undefined, {
      ...mismatch,
      externalTrackId: null,
      externalArtworkUrl: null,
      externalTrackName: null,
      externalArtistNames: null,
      externalAlbumName: null,
    });
    expect(screen.getByText('USRC17607839')).toBeInTheDocument();
    expect(screen.getByText('Unknown artist')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
