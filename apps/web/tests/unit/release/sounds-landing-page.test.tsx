import { fireEvent, render, screen } from '@testing-library/react';
import { cloneElement, isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoProviderKey } from '@/lib/discography/types';

// Mock next/link
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt?: string; src: string }) => (
    <img alt={props.alt ?? ''} {...props} />
  ),
}));

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open?: boolean;
    }) => (open ? <div>{children}</div> : null),
    Portal: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Overlay: () => <div />,
    Content: ({
      children,
      ...props
    }: { children: React.ReactNode } & Record<string, unknown>) => (
      <div {...props}>{children}</div>
    ),
    Title: ({
      children,
      asChild,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    } & Record<string, unknown>) =>
      asChild && isValidElement(children) ? (
        cloneElement(children, props)
      ) : (
        <div {...props}>{children}</div>
      ),
    Description: ({
      children,
      asChild,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    } & Record<string, unknown>) =>
      asChild && isValidElement(children) ? (
        cloneElement(children, props)
      ) : (
        <div {...props}>{children}</div>
      ),
  },
}));

// Must import after mocks — use relative path since @/app/ alias
// maps to app/app/ (authenticated routes), not app/[username]/
const { SoundsLandingPage } = await import(
  '../../../app/[username]/[slug]/sounds/SoundsLandingPage'
);

const mockVideoProviders: Array<{
  key: VideoProviderKey;
  label: string;
  cta: string;
  accent: string;
  url: string;
}> = [
  {
    key: 'tiktok_sound',
    label: 'TikTok',
    cta: 'Use sound on TikTok',
    accent: '#000000',
    url: 'https://tiktok.com/music/test-123',
  },
  {
    key: 'instagram_reels',
    label: 'Instagram Reels',
    cta: 'Use audio on Instagram',
    accent: '#E4405F',
    url: 'https://instagram.com/reels/audio/456',
  },
];

const defaultProps = {
  release: {
    title: 'Test Song',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
  },
  artist: {
    name: 'Test Artist',
    handle: 'testartist',
  },
  videoProviders: mockVideoProviders,
  smartLinkPath: '/testartist/test-song',
  tracking: {
    contentType: 'release' as const,
    contentId: 'release-123',
    smartLinkSlug: 'test-song',
  },
};

describe('SoundsLandingPage', () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendBeaconSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      writable: true,
      configurable: true,
    });
  });

  it('renders video provider buttons for each provider', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    // Buttons now use platform name from VIDEO_LOGO_CONFIG, not cta text
    expect(
      screen.getByRole('link', { name: /open tiktok/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open instagram/i })
    ).toBeInTheDocument();
  });

  it('fires click tracking via sendBeacon when provider button is clicked', () => {
    render(<SoundsLandingPage {...defaultProps} />);
    sendBeaconSpy.mockClear();

    const tiktokLink = screen.getByRole('link', {
      name: /open tiktok/i,
    });
    fireEvent.click(tiktokLink);

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    expect(sendBeaconSpy).toHaveBeenCalledWith('/api/track', expect.any(Blob));

    // Verify the payload
    const blob = sendBeaconSpy.mock.calls[0][1] as Blob;
    expect(blob.type).toBe('application/json');
  });

  it('renders artwork with fallback icon when artworkUrl is null', () => {
    render(
      <SoundsLandingPage
        {...defaultProps}
        release={{ title: 'Test Song', artworkUrl: null }}
      />
    );

    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });

  it('renders artwork image when artworkUrl is provided', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    const img = screen.getByAltText('Test Song artwork');
    expect(img).toBeInTheDocument();
  });

  it('shows listen link in menu drawer', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    // Menu not visible before click
    expect(screen.queryByText('Listen')).not.toBeInTheDocument();

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));

    // Listen link in menu
    expect(screen.getByText('Listen')).toBeInTheDocument();
  });

  it('preserves UTM params on menu listen link', () => {
    render(
      <SoundsLandingPage
        {...defaultProps}
        utmParams={{ utm_source: 'tiktok', utm_medium: 'sound' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    const listenLink = screen.getByText('Listen').closest('a');
    const href = listenLink?.getAttribute('href') ?? '';
    expect(href).toContain('utm_source=tiktok');
    expect(href).toContain('utm_medium=sound');
  });

  it('renders artist name as link when handle is provided', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    const artistLink = screen.getByText('Test Artist');
    expect(artistLink.closest('a')).toHaveAttribute('href', '/testartist');
  });

  it('renders artist name as plain text when handle is null', () => {
    render(
      <SoundsLandingPage
        {...defaultProps}
        artist={{ name: 'No Handle', handle: null }}
      />
    );

    const artistName = screen.getByText('No Handle');
    expect(artistName.closest('a')).toBeNull();
  });

  it('renders release title', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });
});
