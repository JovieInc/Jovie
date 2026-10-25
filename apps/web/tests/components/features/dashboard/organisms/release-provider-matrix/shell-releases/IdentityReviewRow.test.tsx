import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/components/organisms/table', () => ({
  ShellListRowFrame: ({
    as: _as,
    chrome: _c,
    density: _d,
    isSelected: _s,
    children,
    ...props
  }: Record<string, unknown> & { children: React.ReactNode }) => (
    <li {...(props as object)}>{children}</li>
  ),
}));
vi.mock('@/components/shell/ArtworkThumb', () => ({
  ArtworkThumb: () => <span data-testid='art' />,
}));

const { IdentityReviewRow, IDENTITY_UNDO_WINDOW_MS } = await import(
  '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/IdentityReviewRow'
);

const release = {
  id: 'rel-1',
  title: 'Seaside Heights',
  artistNames: ['Tim White'],
  releaseType: 'single',
  identityReview: {
    reason: 'owner_not_credited',
    provenance:
      "Found on Spotify · 2020 · credited to Someone · unsure: your Spotify artist id isn't credited",
  },
} as unknown as ReleaseViewModel;

describe('IdentityReviewRow', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('shows the prompt, provenance, and 44px Accept / Reject buttons', () => {
    render(
      <IdentityReviewRow
        release={release}
        typeLabel='Single'
        commit={vi.fn()}
      />
    );
    expect(
      screen.getByTestId('identity-review-provenance').textContent
    ).toContain('Found on Spotify');
    for (const name of ['Accept', 'Reject']) {
      const button = screen.getByRole('button', { name });
      // The DS Button carries its own 44px hit target (before:min-h-11).
      expect(button.className).toContain('before:min-h-11');
      expect(button.className).toContain('before:min-w-11');
    }
  });

  it('Accept is held for the undo window, then persisted as accepted', async () => {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const onDecided = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <IdentityReviewRow
        release={release}
        typeLabel='Single'
        commit={commit}
        onDecided={onDecided}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByRole('status').textContent).toContain('Accepted');
    expect(commit).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDENTITY_UNDO_WINDOW_MS + 10);
    });
    expect(commit).toHaveBeenCalledWith('rel-1', 'accepted');
    expect(onDecided).toHaveBeenCalledWith('accepted');
  });

  it('Reject persists as rejected after the window and removes the row', async () => {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <IdentityReviewRow release={release} typeLabel='Single' commit={commit} />
    );
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDENTITY_UNDO_WINDOW_MS + 10);
    });
    expect(commit).toHaveBeenCalledWith('rel-1', 'rejected');
    expect(container.querySelector('li')).toBeNull();
  });

  it('Undo within the window writes nothing and asks again', async () => {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <IdentityReviewRow release={release} typeLabel='Single' commit={commit} />
    );
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDENTITY_UNDO_WINDOW_MS * 2);
    });
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
  });

  it('offers Undo targets at 44px too and lets a failed save be retried', async () => {
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <IdentityReviewRow release={release} typeLabel='Single' commit={commit} />
    );
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByRole('button', { name: 'Undo' }).className).toContain(
      'min-h-11'
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDENTITY_UNDO_WINDOW_MS + 10);
    });
    expect(screen.getAllByText(/Couldn't save/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDENTITY_UNDO_WINDOW_MS + 10);
    });
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
