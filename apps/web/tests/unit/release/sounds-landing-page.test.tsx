import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoProviderKey } from '@/lib/discography/types';

// Mock next/image
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt?: string; src: string }) => (
    <img alt={props.alt ?? ''} {...props} />
  ),
}));

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

    expect(
      screen.getByRole('link', { name: /use sound on tiktok/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /use audio on instagram/i })
    ).toBeInTheDocument();
  });

  it('fires click tracking via sendBeacon when provider button is clicked', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    const tiktokLink = screen.getByRole('link', {
      name: /use sound on tiktok/i,
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

    // Should not render an img element
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The fallback is an Icon component (rendered as svg)
    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });

  it('renders artwork image when artworkUrl is provided', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    const img = screen.getByAltText('Test Song artwork');
    expect(img).toBeInTheDocument();
  });

  it('shows "Listen on streaming platforms" back link', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    const backLink = screen.getByText('Listen on streaming platforms');
    expect(backLink.closest('a')).toHaveAttribute(
      'href',
      '/testartist/test-song'
    );
  });

  it('preserves UTM params on back link', () => {
    render(
      <SoundsLandingPage
        {...defaultProps}
        utmParams={{ utm_source: 'tiktok', utm_medium: 'sound' }}
      />
    );

    const backLink = screen.getByText('Listen on streaming platforms');
    const href = backLink.closest('a')?.getAttribute('href') ?? '';
    expect(href).toContain('utm_source=tiktok');
    expect(href).toContain('utm_medium=sound');
  });

  it('renders artist name as link when handle is provided', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    const artistLink = screen.getByText('Test Artist');
    expect(artistLink.closest('a')).toHaveAttribute('href', '/testartist');
  });

  it('renders artist name as text when handle is null', () => {
    render(
      <SoundsLandingPage
        {...defaultProps}
        artist={{ name: 'Test Artist', handle: null }}
      />
    );

    const artistText = screen.getByText('Test Artist');
    expect(artistText.tagName).toBe('P');
  });

  it('renders "Use this sound" label', () => {
    render(<SoundsLandingPage {...defaultProps} />);

    expect(screen.getByText('Use this sound')).toBeInTheDocument();
  });
});
