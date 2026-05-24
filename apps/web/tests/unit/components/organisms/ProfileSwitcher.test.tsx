import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSwitcher } from '@/components/organisms/ProfileSwitcher';

const {
  mockRefresh,
  mockSwitchActiveProfile,
  mockToastError,
  mockUseDashboardData,
} = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockSwitchActiveProfile: vi.fn(),
  mockToastError: vi.fn(),
  mockUseDashboardData: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError },
}));

vi.mock('@/app/app/(shell)/dashboard/actions/switch-profile', () => ({
  switchActiveProfile: mockSwitchActiveProfile,
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => mockUseDashboardData(),
}));

vi.mock('@/components/molecules/Avatar', () => ({
  Avatar: ({ alt }: { alt: string }) => <span data-avatar-alt={alt} />,
}));

vi.mock('@/components/organisms/CreateProfileDialog', () => ({
  CreateProfileDialog: () => null,
}));

vi.mock('@jovie/ui', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button type='button' disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('ProfileSwitcher sidebar workspace selection', () => {
  const originalLocation = globalThis.location;
  const mockReload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'location', {
      value: {
        ...originalLocation,
        reload: mockReload,
      },
      writable: true,
      configurable: true,
    });
    mockSwitchActiveProfile.mockResolvedValue({ success: true });
    mockUseDashboardData.mockReturnValue({
      creatorProfiles: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          avatarUrl: null,
          displayName: 'Alpha Artist',
          username: 'alpha',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          avatarUrl: null,
          displayName: 'Beta Artist',
          username: 'beta',
        },
      ],
      selectedProfile: {
        id: '11111111-1111-4111-8111-111111111111',
        avatarUrl: null,
        displayName: 'Alpha Artist',
        username: 'alpha',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('refreshes App Router data instead of forcing a document reload', async () => {
    const user = userEvent.setup();

    render(<ProfileSwitcher />);

    await user.click(screen.getByRole('button', { name: /Beta Artist/ }));

    await waitFor(() => {
      expect(mockSwitchActiveProfile).toHaveBeenCalledWith(
        '22222222-2222-4222-8222-222222222222'
      );
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('keeps the shell in place when profile switching fails', async () => {
    const user = userEvent.setup();
    mockSwitchActiveProfile.mockResolvedValue({
      error: "Couldn't switch profile. Try again.",
      success: false,
    });

    render(<ProfileSwitcher />);

    await user.click(screen.getByRole('button', { name: /Beta Artist/ }));

    await waitFor(() => {
      expect(mockSwitchActiveProfile).toHaveBeenCalledWith(
        '22222222-2222-4222-8222-222222222222'
      );
      expect(mockToastError).toHaveBeenCalledWith(
        "Couldn't switch profile. Try again."
      );
    });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });
});
