import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PublicRelease } from '@/components/features/profile/releases/types';
import type { Artist } from '@/types/db';

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    open,
    onOpenChange,
    title,
    subtitle,
    children,
    dataTestId,
    presentation,
  }: {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly title: string;
    readonly subtitle?: string;
    readonly children: React.ReactNode;
    readonly dataTestId?: string;
    readonly presentation?: 'standalone' | 'embedded' | 'modal';
  }) => (
    <div
      data-testid={dataTestId ?? 'profile-drawer-shell'}
      data-presentation={presentation ?? 'standalone'}
    >
      {open ? (
        <button
          type='button'
          data-testid='profile-drawer-shell-close'
          onClick={() => onOpenChange(false)}
        >
          Close drawer
        </button>
      ) : null}
      <div data-testid='drawer-title'>{title}</div>
      {subtitle ? <div data-testid='drawer-subtitle'>{subtitle}</div> : null}
      {children}
    </div>
  ),
}));

vi.mock('@/features/profile/AboutSection', () => ({
  AboutSection: () => <div data-testid='about-section'>About content</div>,
}));

vi.mock('@/features/profile/TourModePanel', () => ({
  TourDrawerContent: () => (
    <div data-testid='tour-drawer-content'>Tour content</div>
  ),
}));

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: () => (
    <div data-testid='static-listen-interface'>Listen content</div>
  ),
}));

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  TwoStepNotificationsCTA: () => (
    <div data-testid='two-step-notifications'>Subscribe content</div>
  ),
  ArtistNotificationsCTA: () => (
    <div data-testid='artist-notifications'>Subscribe content</div>
  ),
}));

vi.mock('@/components/molecules/TipSelector', () => ({
  TipSelector: () => <div data-testid='tip-selector'>Tip content</div>,
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => 'mailto:test@example.com',
    trackAction: vi.fn(),
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({ alt }: { readonly alt: string }) => (
    <img alt={alt} data-testid='release-artwork' />
  ),
}));

const mockArtist: Artist = {
  id: 'artist-1',
  name: 'Test Artist',
  handle: 'testartist',
  image_url: null,
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  is_public: true,
  is_verified: false,
  active_since_year: null,
  published: true,
  is_verified_flag: false,
};

function makeRelease(overrides: Partial<PublicRelease> = {}): PublicRelease {
  return {
    id: `release-${Math.random().toString(36).slice(2)}`,
    title: 'Test Song',
    slug: 'test-song',
    releaseType: 'single',
    releaseDate: '2024-06-15T00:00:00.000Z',
    artworkUrl: 'https://example.com/art.jpg',
    artistNames: ['Test Artist'],
    ...overrides,
  };
}

function makeReleases(count: number, yearStart = 2024): PublicRelease[] {
  return Array.from({ length: count }, (_, i) =>
    makeRelease({
      id: `release-${i}`,
      title: `Song ${i + 1}`,
      slug: `song-${i + 1}`,
      releaseDate: `${yearStart - Math.floor(i / 5)}-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00.000Z`,
    })
  );
}

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  view: 'releases' as const,
  onViewChange: vi.fn(),
  artist: mockArtist,
  socialLinks: [],
  contacts: [],
  primaryChannel: vi.fn(),
  dsps: [],
  isSubscribed: false,
  contentPrefs: { newMusic: true, tourDates: true, merch: true, general: true },
  onTogglePref: vi.fn(),
  onUnsubscribe: vi.fn(),
  isUnsubscribing: false,
  onShare: vi.fn(),
  hasAbout: false,
  hasTourDates: false,
  hasTip: false,
  hasContacts: false,
  hasReleases: true,
  releases: [
    makeRelease({ id: 'r1', title: 'First Song', slug: 'first-song' }),
    makeRelease({ id: 'r2', title: 'Second Song', slug: 'second-song' }),
  ],
};

let ProfileUnifiedDrawer: typeof import('@/features/profile/ProfileUnifiedDrawer').ProfileUnifiedDrawer;

describe('ProfileUnifiedDrawer — Releases', () => {
  beforeAll(async () => {
    ({ ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    ));
  }, 10_000);

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders releases list when view is releases', async () => {
    render(<ProfileUnifiedDrawer {...defaultProps} />);

    expect(screen.getByTestId('profile-mode-drawer-releases')).toBeDefined();
  });

  it('passes embedded presentation through to the shared drawer shell', () => {
    render(<ProfileUnifiedDrawer {...defaultProps} presentation='embedded' />);

    expect(screen.getByTestId('profile-menu-drawer')).toHaveAttribute(
      'data-presentation',
      'embedded'
    );
  });

  it('does not reopen the menu when the drawer closes', async () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const onViewChange = vi.fn();

    const view = render(
      <ProfileUnifiedDrawer
        {...defaultProps}
        view='listen'
        onOpenChange={onOpenChange}
        onViewChange={onViewChange}
      />
    );

    fireEvent.click(
      within(view.container).getByTestId('profile-drawer-shell-close')
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('renders release rows with title and artwork', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    render(<ProfileUnifiedDrawer {...defaultProps} />);

    expect(screen.getByText('First Song')).toBeDefined();
    expect(screen.getByText('Second Song')).toBeDefined();
    expect(screen.getAllByTestId('release-artwork')).toHaveLength(2);
  });

  it('links release rows to smartlink pages', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    render(<ProfileUnifiedDrawer {...defaultProps} />);

    const links = screen
      .getByTestId('profile-mode-drawer-releases')
      .querySelectorAll('a');
    expect(links[0]?.getAttribute('href')).toBe('/testartist/first-song');
    expect(links[1]?.getAttribute('href')).toBe('/testartist/second-song');
  });

  it('filters out profile owner from collaborator names', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({
        id: 'collab',
        title: 'Collab Track',
        slug: 'collab-track',
        artistNames: ['Test Artist', 'DJ Snake', 'Lil Jon'],
      }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    expect(screen.getByText(/DJ Snake, Lil Jon/)).toBeDefined();
    // The owner name "Test Artist" should not appear as a collaborator
    const container = screen.getByTestId('profile-mode-drawer-releases');
    const secondaryText = container.querySelectorAll('.text-2xs');
    for (const el of secondaryText) {
      expect(el.textContent).not.toMatch(/^Test Artist/);
    }
  });

  it('shows no collaborator names for solo releases', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({
        id: 'solo',
        title: 'Solo Track',
        slug: 'solo-track',
        artistNames: ['Test Artist'],
      }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    expect(screen.getByText('Solo Track')).toBeDefined();
    // Only metadata, no collaborator prefix
    const container = screen.getByTestId('profile-mode-drawer-releases');
    const metaEl = container.querySelector('.text-2xs');
    expect(metaEl?.textContent).toMatch(/Single/);
    expect(metaEl?.textContent).not.toContain('Test Artist');
  });

  it('shows Video pill badge for music_video releases', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({
        id: 'mv',
        title: 'Music Video',
        slug: 'music-video',
        releaseType: 'music_video',
      }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    const badges = screen.getAllByText('Video');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    // The badge should have pill styling
    const badge = badges[0]!;
    expect(badge.className).toContain('rounded-full');
  });

  it('omits year when releaseDate is null', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({
        id: 'nodate',
        title: 'No Date Song',
        slug: 'no-date',
        releaseDate: null,
      }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    const container = screen.getByTestId('profile-mode-drawer-releases');
    const metaEl = container.querySelector('.text-2xs');
    expect(metaEl?.textContent).toContain('Single');
    expect(metaEl?.textContent).not.toMatch(/\d{4}/);
  });

  it('uses UTC years for release metadata', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({
        id: 'new-year',
        title: 'New Year Song',
        slug: 'new-year-song',
        releaseDate: '2024-01-01T00:00:00.000Z',
      }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    const container = screen.getByTestId('profile-mode-drawer-releases');
    expect(within(container).getByText(/2024/)).toBeInTheDocument();
  });

  it('shows year headers for 15+ releases spanning 2+ years', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = makeReleases(16, 2024);

    render(
      <ProfileUnifiedDrawer
        {...defaultProps}
        releases={releases}
        hasReleases={true}
      />
    );

    // Should have year header dividers
    const headers = screen
      .getByTestId('profile-mode-drawer-releases')
      .querySelectorAll('.font-caption');
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show year headers for fewer than 15 releases', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = makeReleases(5, 2024);

    render(
      <ProfileUnifiedDrawer
        {...defaultProps}
        releases={releases}
        hasReleases={true}
      />
    );

    // No year header dividers
    const headers = screen
      .getByTestId('profile-mode-drawer-releases')
      .querySelectorAll('.font-caption');
    expect(headers.length).toBe(0);
  });

  it('shows Releases menu item when hasReleases is true', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    render(
      <ProfileUnifiedDrawer {...defaultProps} view='menu' hasReleases={true} />
    );

    expect(screen.getByText('Releases')).toBeDefined();
  });

  it('hides Releases menu item when hasReleases is false', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    render(
      <ProfileUnifiedDrawer {...defaultProps} view='menu' hasReleases={false} />
    );

    expect(screen.queryByText('Releases')).toBeNull();
  });

  it('hides Releases menu item when no releases have usable slugs', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({ id: 'missing-1', title: 'Missing One', slug: '' }),
      makeRelease({ id: 'missing-2', title: 'Missing Two', slug: '' }),
    ];

    render(
      <ProfileUnifiedDrawer
        {...defaultProps}
        view='menu'
        hasReleases={true}
        releases={releases}
      />
    );

    expect(screen.queryByText('Releases')).toBeNull();
  });

  it('adds aria-label to release links', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({
        id: 'aria',
        title: 'Aria Song',
        slug: 'aria-song',
        artistNames: ['Test Artist', 'Collab Artist'],
      }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    const link = screen
      .getByTestId('profile-mode-drawer-releases')
      .querySelector('a');
    expect(link?.getAttribute('aria-label')).toBe(
      'View Aria Song by Collab Artist'
    );
  });

  it('omits the old catalog subtitle for the mock-faithful releases drawer', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({ id: 's1', releaseType: 'single' }),
      makeRelease({ id: 's2', releaseType: 'single' }),
      makeRelease({ id: 'a1', releaseType: 'album' }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    expect(screen.queryByTestId('drawer-subtitle')).toBeNull();
  });

  it('skips releases with missing slugs', async () => {
    const { ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    );

    const releases = [
      makeRelease({ id: 'good', title: 'Good Song', slug: 'good-song' }),
      makeRelease({ id: 'bad', title: 'Bad Song', slug: '' }),
    ];

    render(<ProfileUnifiedDrawer {...defaultProps} releases={releases} />);

    expect(screen.getByText('Good Song')).toBeDefined();
    expect(screen.queryByText('Bad Song')).toBeNull();
  });
});
