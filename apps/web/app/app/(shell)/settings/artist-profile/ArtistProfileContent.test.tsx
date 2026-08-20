import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtistProfileContent } from './ArtistProfileContent';

const { contextState, openPreview, refresh } = vi.hoisted(() => ({
  contextState: {
    artist: null as null | {
      id: string;
      handle: string;
      name: string;
      published: boolean;
    },
    avatarQuality: null,
    setArtist: vi.fn(),
  },
  openPreview: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ open: openPreview }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: { username: 'ada' } }),
}));

vi.mock('@/features/dashboard/organisms/useSettingsContext', () => ({
  useSettingsContext: () => contextState,
}));

vi.mock('@/features/dashboard/organisms/settings-profile-section', () => ({
  SettingsProfileSection: () => <div>Profile fields</div>,
}));

vi.mock('@/features/dashboard/organisms/SettingsPaySection', () => ({
  SettingsPaySection: () => <div>Pay settings</div>,
}));

describe('ArtistProfileContent', () => {
  beforeEach(() => {
    contextState.artist = null;
    contextState.setArtist.mockReset();
    openPreview.mockReset();
    refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the canonical settings header and panel anatomy while loading', () => {
    render(<ArtistProfileContent />);

    expect(screen.getByRole('heading', { name: 'Artist' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Loading Artist Profile Settings' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Payments' })
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('status', { name: 'Loading Shop Settings' })
        .closest('.min-h-52')
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('status', {
          name: 'Loading Artist Profile Settings',
        })
        .querySelectorAll('[data-state="shimmer"]')
    ).toHaveLength(16);
    expect(screen.getByTestId('mobile-profile-trigger-skeleton')).toHaveClass(
      'min-h-16',
      'lg:hidden'
    );
  });

  it('keeps Shop geometry stable through artist and Shopify loading', async () => {
    let resolveShop!: (value: { json: () => Promise<unknown> }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise(resolve => {
          resolveShop = resolve;
        })
      )
    );

    const { rerender } = render(<ArtistProfileContent />);
    const shopRootClassName = screen
      .getByRole('status', { name: 'Loading Shop Settings' })
      .closest('.min-h-52')?.className;

    contextState.artist = {
      id: 'profile-1',
      handle: 'ada',
      name: 'Ada Artist',
      published: true,
    };
    rerender(<ArtistProfileContent />);

    const shopPending = screen.getByRole('status', {
      name: 'Loading Shop Settings',
    });
    expect(shopPending.closest('.min-h-52')).toHaveClass(shopRootClassName!, {
      exact: true,
    });

    const publicProfile = screen.getByRole('link', {
      name: /view as visitor/i,
    });
    expect(publicProfile).toHaveAttribute('href', '/ada');
    expect(publicProfile).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Profile fields')).toBeInTheDocument();
    expect(screen.getByText('Pay settings')).toBeInTheDocument();

    await act(async () => {
      resolveShop({
        json: vi.fn().mockResolvedValue({ shopifyUrl: null }),
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'Loading Shop Settings' })
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: 'Shop' }).closest('.min-h-52')
    ).toHaveClass(shopRootClassName!, { exact: true });

    const mobileProfileTrigger = screen.getByRole('button', {
      name: 'Open Links And Music Preview Panel',
    });
    expect(mobileProfileTrigger).toHaveClass('min-h-16', 'lg:hidden');
    fireEvent.click(mobileProfileTrigger);
    expect(openPreview).toHaveBeenCalledOnce();
  });
});
