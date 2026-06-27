import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtistProfileRailToggle } from '../ArtistProfileRailToggle';

const toggleMock = vi.fn();
let mockIsOpen = false;

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    isOpen: mockIsOpen,
    toggle: toggleMock,
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: {
      displayName: 'Tim White',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
  }),
}));

vi.mock('@jovie/ui', () => ({
  TooltipShortcut: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ArtistProfileRailToggle', () => {
  beforeEach(() => {
    mockIsOpen = false;
    toggleMock.mockReset();
  });

  it('renders the artist name and toggles the preview panel', async () => {
    const user = userEvent.setup();

    render(<ArtistProfileRailToggle />);

    const button = screen.getByTestId('artist-profile-rail-toggle');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-label', 'Show Tim White profile');
    expect(screen.getByText('Tim White')).toBeInTheDocument();

    await user.click(button);
    expect(toggleMock).toHaveBeenCalledTimes(1);
  });

  it('reflects the open pressed state', () => {
    mockIsOpen = true;

    render(<ArtistProfileRailToggle />);

    expect(screen.getByTestId('artist-profile-rail-toggle')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('artist-profile-rail-toggle')).toHaveAttribute(
      'aria-label',
      'Hide Tim White profile'
    );
  });
});
