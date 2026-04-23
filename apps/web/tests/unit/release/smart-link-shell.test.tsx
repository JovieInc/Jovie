import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ImageProps = {
  readonly src: string;
  readonly alt: string;
  readonly [key: string]: unknown;
};

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...rest }: ImageProps) => (
    <img src={src} alt={alt} data-testid='next-image' {...rest} />
  ),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    readonly href: string;
    readonly children: React.ReactNode;
    readonly [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/organisms/public-surface', () => ({
  PublicSurfaceShell: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => <div data-testid='public-surface-shell'>{children}</div>,
  PublicSurfaceHeader: ({
    leftSlot,
    rightSlot,
  }: {
    readonly leftSlot: React.ReactNode;
    readonly rightSlot: React.ReactNode;
  }) => (
    <div data-testid='public-surface-header'>
      {leftSlot}
      {rightSlot}
    </div>
  ),
  PublicSurfaceStage: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => <div data-testid='public-surface-stage'>{children}</div>,
}));

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: () => <div data-testid='brand-logo'>Logo</div>,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({
    name,
    ...rest
  }: {
    readonly name: string;
    readonly [key: string]: unknown;
  }) => (
    <div data-testid={`icon-${name}`} {...rest}>
      {name}
    </div>
  ),
}));

vi.mock('lucide-react', () => ({
  MoreHorizontal: (props: Record<string, unknown>) => (
    <svg data-testid='more-horizontal-icon' {...props} />
  ),
}));

// Must import AFTER all vi.mock calls
import {
  SmartLinkShell,
  useSmartLinkShare,
} from '@/features/release/SmartLinkShell';

describe('SmartLinkShell', () => {
  const defaultProps = {
    artworkUrl: 'https://example.com/artwork.jpg',
    artworkAlt: 'Test Artwork',
    children: <div data-testid='children-content'>Content</div>,
    onMenuOpen: vi.fn(),
  };

  it('renders artwork via Image when artworkUrl is provided', () => {
    render(<SmartLinkShell {...defaultProps} />);
    const img = screen.getByTestId('next-image');
    expect(img).toHaveAttribute('src', 'https://example.com/artwork.jpg');
    expect(img).toHaveAttribute('alt', 'Test Artwork');
  });

  it('renders ArtworkFallback (Disc3 icon) when artworkUrl is null', () => {
    render(<SmartLinkShell {...defaultProps} artworkUrl={null} />);
    expect(screen.getByTestId('icon-Disc3')).toBeInTheDocument();
    expect(screen.queryByTestId('next-image')).toBeNull();
  });

  it('renders heroOverlay content in the hero area', () => {
    render(
      <SmartLinkShell
        {...defaultProps}
        heroOverlay={<div data-testid='hero-overlay'>Overlay</div>}
      />
    );
    expect(screen.getByTestId('hero-overlay')).toHaveTextContent('Overlay');
  });

  it('calls onMenuOpen when menu button is clicked', () => {
    const onMenuOpen = vi.fn();
    render(<SmartLinkShell {...defaultProps} onMenuOpen={onMenuOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(onMenuOpen).toHaveBeenCalledTimes(1);
  });

  it('renders children content', () => {
    render(<SmartLinkShell {...defaultProps} />);
    expect(screen.getByTestId('children-content')).toHaveTextContent('Content');
  });
});

describe('useSmartLinkShare', () => {
  const originalLocation = globalThis.location;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: { href: 'https://jov.ie/test-release' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('calls navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useSmartLinkShare('Midnight Drive', 'Tim White')
    );

    await result.current();

    expect(shareMock).toHaveBeenCalledWith({
      title: 'Midnight Drive \u2014 Tim White',
      url: 'https://jov.ie/test-release',
    });
  });

  it('falls back to clipboard.writeText when share is unavailable', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useSmartLinkShare('Midnight Drive', 'Tim White')
    );

    await result.current();

    expect(writeTextMock).toHaveBeenCalledWith('https://jov.ie/test-release');
  });

  it('calls onClose callback before sharing', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });

    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useSmartLinkShare('Midnight Drive', 'Tim White', onClose)
    );

    await result.current();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
