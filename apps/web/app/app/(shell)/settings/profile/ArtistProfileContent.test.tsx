import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtistProfileContent } from './ArtistProfileContent';

const { contextState, openPreview, previewState, refresh } = vi.hoisted(() => ({
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
  previewState: {
    isOpen: false,
    isPreview: false,
    isPinned: false,
    isFloating: false,
    close: vi.fn(),
    toggle: vi.fn(),
  },
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ ...previewState, open: openPreview }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: { username: 'ada', displayName: 'Ada Artist' },
  }),
}));

vi.mock('@jovie/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@jovie/ui')>()),
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
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

vi.mock('@/app/app/(shell)/library/ArtistRulesSheet', () => ({
  ArtistRulesSheet: () => <button type='button'>Artist Rules</button>,
}));

describe('ArtistProfileContent', () => {
  beforeEach(() => {
    contextState.artist = null;
    contextState.setArtist.mockReset();
    openPreview.mockReset();
    previewState.isOpen = false;
    previewState.isPreview = false;
    previewState.isPinned = false;
    previewState.toggle.mockReset();
    refresh.mockReset();
  });

  it('offers a canonical preview control and releases space only after explicit close', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    contextState.artist = {
      id: 'profile-1',
      handle: 'ada',
      name: 'Ada Artist',
      published: true,
    };
    const { rerender } = render(<ArtistProfileContent />);
    const reserved = () =>
      document.querySelectorAll('[data-settings-companion-rail="true"]');

    // The automatic opening is pending during SSR/initial hydration.
    expect(reserved()).toHaveLength(1);
    const toggle = screen.getByRole('button', {
      name: 'Show Ada Artist profile',
    });
    expect(toggle).toHaveAttribute(
      'aria-controls',
      'shell-artist-profile-rail'
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    previewState.isOpen = true;
    previewState.isPinned = true;
    rerender(<ArtistProfileContent />);
    expect(reserved()).toHaveLength(1);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(previewState.toggle).toHaveBeenCalledOnce();

    previewState.isOpen = false;
    previewState.isPinned = false;
    rerender(<ArtistProfileContent />);
    expect(reserved()).toHaveLength(0);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Unrelated settings reloads must not reinstate an unsolicited reservation.
    contextState.artist = null;
    rerender(<ArtistProfileContent />);
    expect(reserved()).toHaveLength(0);

    previewState.isOpen = true;
    rerender(<ArtistProfileContent />);
    expect(reserved()).toHaveLength(1);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not keep an empty desktop reservation after the companion closes', () => {
    const { rerender } = render(<ArtistProfileContent />);
    const reserved = () =>
      document.querySelectorAll('[data-settings-companion-rail="true"]');
    expect(reserved()).toHaveLength(1);
    previewState.isOpen = true;
    rerender(<ArtistProfileContent />);
    expect(reserved()).toHaveLength(1);
    previewState.isOpen = false;
    rerender(<ArtistProfileContent />);
    expect(reserved()).toHaveLength(0);
  });

  it('keeps the canonical settings header and panel anatomy while loading', () => {
    render(<ArtistProfileContent />);

    // Same companion-rail reservation marker before and after load (no shift).
    expect(
      document.querySelectorAll('[data-settings-companion-rail="true"]')
    ).toHaveLength(1);

    expect(
      screen.getByRole('heading', { name: 'Profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Identity' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Loading Profile Settings' })
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
          name: 'Loading Profile Settings',
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
    expect(
      document.querySelectorAll('[data-settings-companion-rail="true"]')
    ).toHaveLength(1);
    expect(publicProfile).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Profile fields')).toBeInTheDocument();
    expect(screen.getByText('Pay settings')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Artist Rules' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Artist Rules' })
    ).toBeInTheDocument();

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
