import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTrack = vi.fn();

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

vi.mock('@/components/atoms/Confetti', () => ({
  ConfettiOverlay: () => <div data-testid='confetti-overlay' />,
}));

vi.mock(
  '@/components/features/dashboard/molecules/CelebrationCardPreview',
  () => ({
    CelebrationCardPreview: () => (
      <div data-testid='celebration-card-preview' />
    ),
  })
);

vi.mock(
  '@/components/features/dashboard/molecules/CopyToClipboardButton',
  () => ({
    CopyToClipboardButton: () => <button type='button'>Copy</button>,
  })
);

import { ProfileLiveCelebration } from '@/components/features/dashboard/molecules/ProfileLiveCelebration';

describe('ProfileLiveCelebration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  it('checks browser storage after hydration before opening a fresh celebration', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <ProfileLiveCelebration
        username='tim'
        profileId='profile-1'
        onComplete={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(setItem).toHaveBeenCalledWith(
        'celebrated_profile-1',
        expect.any(String)
      );
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    });
  });

  it('completes without opening a dialog when storage shows the profile was celebrated', async () => {
    localStorage.setItem('celebrated_profile-1', '1');
    const onComplete = vi.fn();

    render(
      <ProfileLiveCelebration
        username='tim'
        profileId='profile-1'
        onComplete={onComplete}
      />
    );

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('continues when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError');
    });

    render(
      <ProfileLiveCelebration
        username='tim'
        profileId='profile-1'
        onComplete={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    });
  });
});
