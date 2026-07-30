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

const mockSelectedProfile = {
  id: 'p1',
  displayName: 'Tim White',
  avatarUrl: 'https://example.com/avatar.jpg',
};

let mockCreatorProfiles: {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}[] = [mockSelectedProfile];

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: mockSelectedProfile,
    creatorProfiles: mockCreatorProfiles,
  }),
}));

vi.mock('@jovie/ui', () => ({
  TooltipShortcut: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ArtistProfileRailToggle', () => {
  beforeEach(() => {
    mockIsOpen = false;
    mockCreatorProfiles = [mockSelectedProfile];
    toggleMock.mockReset();
  });

  it('renders a non-avatar rail icon and toggles the panel', async () => {
    const user = userEvent.setup();

    render(<ArtistProfileRailToggle />);

    const button = screen.getByTestId('artist-profile-rail-toggle');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-label', 'Show Tim White profile');
    expect(screen.getByTestId('artist-profile-rail-icon')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(button.querySelector('img')).toBeNull();
    expect(screen.queryByText('Tim White')).not.toBeInTheDocument();

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

  it('keeps a single icon control when multiple artist profiles exist', () => {
    mockCreatorProfiles = [
      { id: 'p1', displayName: 'Tim White', avatarUrl: null },
      { id: 'p2', displayName: 'Jane Doe', avatarUrl: null },
      { id: 'p3', displayName: 'Bob Smith', avatarUrl: null },
    ];

    render(<ArtistProfileRailToggle />);

    expect(screen.getAllByTestId('artist-profile-rail-icon')).toHaveLength(1);
    expect(screen.queryByText(/\+1 artists/)).not.toBeInTheDocument();
  });
});
