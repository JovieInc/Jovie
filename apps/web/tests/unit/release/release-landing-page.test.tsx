import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Type helpers for mock props
// ---------------------------------------------------------------------------
type LinkProps = {
  readonly href: string;
  readonly children: React.ReactNode;
  readonly [key: string]: unknown;
};

type ChildrenProps = { readonly children: React.ReactNode };

// ---------------------------------------------------------------------------
// Mock ALL heavy dependencies to avoid vitest worker OOM
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  Share2: (p: Record<string, unknown>) => (
    <span data-testid='icon-share2' {...p} />
  ),
  Sparkles: (p: Record<string, unknown>) => (
    <span data-testid='icon-sparkles' {...p} />
  ),
  Users: (p: Record<string, unknown>) => (
    <span data-testid='icon-users' {...p} />
  ),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/[username]/[slug]/_lib/data', () => ({}));

vi.mock('@/components/atoms/DspLogo', () => ({
  DSP_LOGO_CONFIG: {} as Record<string, { name: string; iconPath: string }>,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name, ...rest }: { name: string } & Record<string, unknown>) => (
    <span data-testid={`icon-${name}`} {...rest} />
  ),
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: { SIGNUP: '/signup' },
}));

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    children,
    open,
  }: ChildrenProps & { open: boolean }) =>
    open ? <div data-testid='profile-drawer'>{children}</div> : null,
}));

vi.mock('@/features/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({ children }: ChildrenProps) => (
    <div data-testid='artwork-context-menu'>{children}</div>
  ),
  buildArtworkSizes: () => ({}),
}));

vi.mock('@/features/release/ReleaseCreditsDrawer', () => ({
  ReleaseCreditsDrawer: () => <div data-testid='credits-drawer' />,
}));

vi.mock('@/features/release/SmartLinkAudioPreview', () => ({
  SmartLinkAudioPreview: () => <div data-testid='audio-preview' />,
}));

vi.mock('@/features/release/SmartLinkPagePrimitives', () => ({
  SmartLinkPoweredByFooter: () => <div data-testid='powered-by-footer' />,
}));

vi.mock('@/features/release/SmartLinkProviderButton', () => ({
  SmartLinkProviderButton: ({
    href,
    label,
  }: {
    href: string;
    label: string;
    onClick?: () => void;
  }) => (
    <div data-testid='provider-button' data-href={href} data-label={label}>
      {label}
    </div>
  ),
}));

const shareSpy = vi.fn();

vi.mock('@/features/release/SmartLinkShell', () => ({
  SmartLinkShell: ({
    children,
    heroOverlay,
  }: ChildrenProps & { heroOverlay?: React.ReactNode }) => (
    <div data-testid='smart-link-shell'>
      {heroOverlay}
      {children}
    </div>
  ),
  useSmartLinkShare: () => shareSpy,
  SMART_LINK_MENU_ICON_CLASS: 'menu-icon',
  SMART_LINK_MENU_ITEM_CLASS: 'menu-item',
}));

vi.mock('@/lib/discography/types', () => ({}));

vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: vi.fn(),
}));

vi.mock('@/lib/utm', () => ({
  appendUTMParamsToUrl: (url: string) => url,
  extractUTMParams: () => ({}),
}));

// ---------------------------------------------------------------------------
// Import component AFTER all vi.mock calls
// ---------------------------------------------------------------------------
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------
const defaultProps = {
  release: {
    title: 'Midnight Drive',
    artworkUrl: 'https://example.com/art.jpg',
    releaseDate: '2026-05-01',
    previewUrl: null,
    isrc: null,
    previewVerification: undefined,
    previewSource: undefined,
  },
  artist: {
    name: 'Tim White',
    handle: 'timwhite',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
  providers: [
    {
      key: 'spotify' as const,
      label: 'Spotify',
      accent: '#1DB954',
      url: 'https://open.spotify.com/track/1',
      confidence: undefined,
    },
    {
      key: 'apple_music' as const,
      label: 'Apple Music',
      accent: '#FA2D48',
      url: 'https://music.apple.com/track/1',
      confidence: undefined,
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests (@critical)
// ---------------------------------------------------------------------------
describe('@critical ReleaseLandingPage', () => {
  it('renders release title and artist name', () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    expect(screen.getByText('Midnight Drive')).toBeDefined();
    expect(screen.getByText('Tim White')).toBeDefined();
  });

  it('renders provider buttons for each provider with a URL', () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    const buttons = screen.getAllByTestId('provider-button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('data-href')).toBe(
      'https://open.spotify.com/track/1'
    );
    expect(buttons[1].getAttribute('data-href')).toBe(
      'https://music.apple.com/track/1'
    );
  });

  it('renders only one audio preview when a verified preview is available', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        release={{
          ...defaultProps.release,
          previewUrl: 'https://example.com/preview.mp3',
          previewVerification: 'verified',
        }}
      />
    );

    expect(screen.getAllByTestId('audio-preview')).toHaveLength(1);
  });

  it('shows empty state when no providers have URLs', () => {
    const noUrlProviders = [
      {
        key: 'spotify' as const,
        label: 'Spotify',
        accent: '#1DB954',
        url: null,
      },
      {
        key: 'apple_music' as const,
        label: 'Apple Music',
        accent: '#FA2D48',
        url: null,
      },
    ];
    render(<ReleaseLandingPage {...defaultProps} providers={noUrlProviders} />);
    expect(screen.getByText('No streaming links available yet.')).toBeDefined();
  });

  it('artist name links to /${handle} when handle exists', () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    const artistLink = screen.getByText('Tim White');
    expect(artistLink.closest('a')?.getAttribute('href')).toBe('/timwhite');
  });

  it('artist name is plain text when handle is null', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        artist={{ name: 'Ghost Artist', handle: null, avatarUrl: null }}
      />
    );
    const el = screen.getByText('Ghost Artist');
    expect(el.tagName).toBe('SPAN');
    expect(el.closest('a')).toBeNull();
  });

  it('credits drawer renders when credits exist', () => {
    const credits = [
      {
        role: 'Producer',
        entries: [{ name: 'Jane Doe', handle: null }],
      },
    ];
    render(<ReleaseLandingPage {...defaultProps} credits={credits} />);
    expect(screen.getByTestId('credits-drawer')).toBeDefined();
  });

  it('claim banner renders when claimBanner prop is provided', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        claimBanner={{ profileId: 'p-123', username: 'timwhite' }}
      />
    );
    expect(screen.getByText('Is this your music?')).toBeDefined();
    expect(screen.getByText('Claim profile')).toBeDefined();
  });

  it('featured artists line renders "feat." with linked names', () => {
    const featured = [
      { name: 'DJ Nova', handle: 'djnova' },
      { name: 'MC Flow', handle: null },
    ];
    render(<ReleaseLandingPage {...defaultProps} featuredArtists={featured} />);
    expect(screen.getByText('feat.')).toBeDefined();
    // DJ Nova should be a link
    const novaEl = screen.getByText('DJ Nova');
    expect(novaEl.closest('a')?.getAttribute('href')).toBe('/djnova');
    // MC Flow should be plain text
    const flowEl = screen.getByText('MC Flow');
    expect(flowEl.tagName).toBe('SPAN');
    expect(flowEl.closest('a')).toBeNull();
  });

  it('captures javascript: protocol in provider URLs for XSS audit', () => {
    const xssProviders = [
      {
        key: 'spotify' as const,
        label: 'Evil Link',
        accent: '#000',
        url: 'javascript:alert(1)',
      },
    ];
    render(<ReleaseLandingPage {...defaultProps} providers={xssProviders} />);
    const btn = screen.getByTestId('provider-button');
    // The mock captures the href value. In production, the real
    // SmartLinkProviderButton renders an <a> tag. This test documents
    // that the URL passes through without sanitization — a security
    // invariant to monitor.
    expect(btn.getAttribute('data-href')).toBe('javascript:alert(1)');
  });
});
