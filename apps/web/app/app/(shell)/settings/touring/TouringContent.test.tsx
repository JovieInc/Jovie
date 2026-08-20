import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouringContent } from './TouringContent';

const { contextState, writeText, toastSuccess } = vi.hoisted(() => ({
  contextState: {
    artist: null as null | {
      id: string;
      handle: string;
      published: boolean;
    },
  },
  writeText: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/features/dashboard/organisms/useSettingsContext', () => ({
  useSettingsContext: () => contextState,
}));

vi.mock('@/features/dashboard/organisms/SettingsTouringSection', () => ({
  SettingsTouringSection: ({ profileId }: { profileId: string }) => (
    <div data-testid='touring-section'>{profileId}</div>
  ),
}));

vi.mock('@/components/feedback', () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
  },
}));

describe('TouringContent', () => {
  beforeEach(() => {
    contextState.artist = null;
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    toastSuccess.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('keeps the route on the canonical page error surface without an artist', () => {
    render(<TouringContent />);

    expect(
      screen.getByText(
        'Unable to load your profile settings. Please refresh the page.'
      )
    ).toBeInTheDocument();
  });

  it('preserves the public calendar action inside canonical settings panels', async () => {
    contextState.artist = {
      id: 'profile-1',
      handle: 'ada',
      published: true,
    };

    render(<TouringContent />);

    expect(screen.getByTestId('touring-section')).toHaveTextContent(
      'profile-1'
    );
    const copyButton = screen.getByRole('button', { name: 'Copy Link' });
    expect(copyButton.closest('.px-4')).toHaveClass('py-4', 'sm:px-5');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        `${globalThis.location.origin}/api/calendar/profile/ada`
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith('Subscribe URL copied');
  });
});
