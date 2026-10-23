import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageArtistHero } from '@/components/homepage/HomepageArtistProfile';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HomepageHeroLight } from './HomepageHeroLight';
import { startHeroLight } from './hero-light-gl';

vi.mock('./hero-light-gl', () => ({ startHeroLight: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

function stubMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('HomepageHeroLight', () => {
  beforeEach(() => {
    vi.mocked(startHeroLight).mockReset();
    vi.mocked(startHeroLight).mockReturnValue({ stop: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders a decorative CSS poster with no canvas and no copy', () => {
    render(<HomepageHeroLight renderer='css' />);
    const light = screen.getByTestId('homepage-hero-light');

    expect(light).toHaveAttribute('aria-hidden', 'true');
    expect(light).toHaveAttribute('data-renderer', 'css');
    expect(light).toHaveAttribute('data-live', 'false');
    expect(light.querySelector('canvas')).toBeNull();
    expect(light.querySelector('.homepage-hero-light__edge')).not.toBeNull();
    expect(light.querySelector('.homepage-hero-light__grid')).not.toBeNull();
    expect(light).toHaveTextContent('');
  });

  it('does not create a canvas when reduced motion is on', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    stubMotion(true);
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2() {});

    render(<HomepageHeroLight renderer='webgl' />);

    expect(
      screen.getByTestId('homepage-hero-light').querySelector('canvas')
    ).toBeNull();
    expect(idle).not.toHaveBeenCalled();
    expect(startHeroLight).not.toHaveBeenCalled();
  });

  it('loads the GL chunk after idle on a capable device', async () => {
    let idleCallback: (() => void) | undefined;
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2() {});
    stubMotion(false);
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 8,
    });
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idleCallback = callback;
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    render(<HomepageHeroLight renderer='webgl' />);
    expect(startHeroLight).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('homepage-hero-light').querySelector('canvas')
    ).not.toBeNull();

    idleCallback?.();
    await waitFor(() => expect(startHeroLight).toHaveBeenCalledTimes(1));
    const [canvas, onFirstFrame] = vi.mocked(startHeroLight).mock.calls[0];
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    act(() => {
      onFirstFrame();
    });
    expect(screen.getByTestId('homepage-hero-light')).toHaveAttribute(
      'data-live',
      'true'
    );
  });
});

describe('HomepageArtistHero light flag', () => {
  afterEach(() => {
    cleanup();
  });

  it('leaves the shipped hero unchanged when the override is omitted', () => {
    render(<HomepageArtistHero />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      HOMEPAGE_COPY.hero.headline
    );
    expect(screen.queryByTestId('homepage-hero-light')).toBeNull();
    expect(document.querySelector('.homepage-artist-hero--lit')).toBeNull();
  });

  it('mounts the CSS layer behind the same headline when forced on', () => {
    render(<HomepageArtistHero heroLight='css' />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      HOMEPAGE_COPY.hero.headline
    );
    const light = screen.getByTestId('homepage-hero-light');
    expect(light).toHaveAttribute('data-renderer', 'css');
    expect(
      light.compareDocumentPosition(screen.getByRole('heading', { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(document.querySelector('.homepage-artist-hero--lit')).not.toBeNull();
  });
});
