import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MismatchCard } from '@/features/dashboard/organisms/dsp-presence/MismatchCard';
import type { CatalogMismatch } from '@/features/dashboard/organisms/dsp-presence/types';

const baseMismatch: CatalogMismatch = {
  id: 'mismatch-1',
  scanId: 'scan-1',
  creatorProfileId: 'profile-1',
  isrc: 'USRC12345678',
  mismatchType: 'not_in_catalog',
  externalTrackId: 'spotify-track-123',
  externalTrackName: 'Bad Love',
  externalAlbumName: 'Country Roads',
  externalAlbumId: 'album-1',
  externalArtworkUrl: 'https://example.com/art.jpg',
  externalArtistNames: 'Some Country Artist',
  status: 'flagged',
  dismissedAt: null,
  dismissedReason: null,
  dedupKey: 'profile-1:USRC12345678:spotify',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('MismatchCard', () => {
  const mockOnAction = vi.fn<
    [string, 'confirmed_mismatch' | 'dismissed'],
    Promise<boolean>
  >();
  const mockOnRemoved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockOnAction.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders track info with album name', () => {
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );
    expect(screen.getByText('Bad Love')).toBeInTheDocument();
    expect(
      screen.getByText('Some Country Artist · Country Roads')
    ).toBeInTheDocument();
  });

  it('renders Mine and Not Mine buttons', () => {
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Not Mine')).toBeInTheDocument();
  });

  it('renders artwork as clickable Spotify link', () => {
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );
    const link = screen.getByLabelText('Open Bad Love on Spotify');
    expect(link).toHaveAttribute(
      'href',
      'https://open.spotify.com/track/spotify-track-123'
    );
  });

  it('renders fallback when no artwork', () => {
    render(
      <MismatchCard
        mismatch={{ ...baseMismatch, externalArtworkUrl: null }}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );
    // Should still render without error, fallback div present
    expect(screen.getByText('Bad Love')).toBeInTheDocument();
  });

  it('shows undo state after clicking Mine', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );

    await user.click(screen.getByText('Mine'));
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('shows undo state after clicking Not Mine', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );

    await user.click(screen.getByText('Not Mine'));
    expect(screen.getByText('Marked as not yours')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('fires PATCH after undo delay', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );

    await user.click(screen.getByText('Mine'));
    vi.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(mockOnAction).toHaveBeenCalledWith('mismatch-1', 'dismissed');
    });
  });

  it('cancels action on undo click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );

    await user.click(screen.getByText('Mine'));
    expect(screen.getByText('Undo')).toBeInTheDocument();

    await user.click(screen.getByText('Undo'));
    // Card should return to normal state
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Not Mine')).toBeInTheDocument();

    // Advance past undo delay — action should NOT fire
    vi.advanceTimersByTime(4000);
    expect(mockOnAction).not.toHaveBeenCalled();
  });

  it('shows error state on PATCH failure', async () => {
    mockOnAction.mockResolvedValue(false);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );

    await user.click(screen.getByText('Not Mine'));
    vi.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to update. Try again.')
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls onRemoved after successful action', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MismatchCard
        mismatch={baseMismatch}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );

    await user.click(screen.getByText('Mine'));
    vi.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(mockOnAction).toHaveBeenCalled();
    });

    // Animation delay (300ms)
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(mockOnRemoved).toHaveBeenCalledWith('mismatch-1', 'dismissed');
    });
  });

  it('uses ISRC as fallback when track name is null', () => {
    render(
      <MismatchCard
        mismatch={{ ...baseMismatch, externalTrackName: null }}
        onAction={mockOnAction}
        onRemoved={mockOnRemoved}
      />
    );
    expect(screen.getByText('USRC12345678')).toBeInTheDocument();
  });
});
