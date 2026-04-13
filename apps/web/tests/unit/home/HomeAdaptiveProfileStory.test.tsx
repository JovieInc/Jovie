import { act, render, screen, waitFor, within } from '@testing-library/react';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  HomeAdaptiveProfileStory,
  type ObservedSceneState,
  selectActiveSceneId,
} from '@/features/home/HomeAdaptiveProfileStory';

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => motionState.reduced,
}));

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  emit(entries: readonly Partial<IntersectionObserverEntry>[]) {
    this.callback(
      entries as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver
    );
  }
}

describe('HomeAdaptiveProfileStory', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeAll(() => {
    // @ts-expect-error test shim
    globalThis.IntersectionObserver = MockIntersectionObserver;
  });

  afterAll(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  beforeEach(() => {
    motionState.reduced = false;
    MockIntersectionObserver.instances = [];
  });

  it('hides the secondary CTA when proof is unavailable', () => {
    render(<HomeAdaptiveProfileStory proofAvailability='hidden' />);

    expect(
      screen.queryByTestId('homepage-secondary-cta')
    ).not.toBeInTheDocument();
  });

  it('shows the secondary CTA and proof anchor when proof is available', () => {
    render(<HomeAdaptiveProfileStory proofAvailability='visible' />);

    for (const cta of screen.getAllByTestId('homepage-secondary-cta')) {
      expect(cta).toHaveAttribute('href', '#homepage-live-proof');
    }
  });

  it('disables animated phone transitions in reduced-motion mode', () => {
    motionState.reduced = true;

    render(<HomeAdaptiveProfileStory proofAvailability='hidden' />);

    for (const panel of screen.getAllByTestId('homepage-phone-state-default')) {
      expect(panel).toHaveAttribute('data-motion-mode', 'reduced');
    }
  });

  it('updates the desktop phone state when a later scene becomes active', async () => {
    const { container } = render(
      <HomeAdaptiveProfileStory proofAvailability='hidden' />
    );

    const desktopRail = screen.getByTestId('homepage-desktop-phone-rail');
    expect(
      within(desktopRail).getByTestId('homepage-phone-state-default')
    ).toBeInTheDocument();

    const targetScene = screen.getByTestId('homepage-story-scene-when-its-out');
    await waitFor(() => {
      expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0);
    });

    const observer = MockIntersectionObserver.instances.at(-1);

    act(() => {
      observer?.emit([
        {
          target: targetScene,
          isIntersecting: true,
          intersectionRatio: 0.72,
          boundingClientRect: {
            top: 18,
          } as DOMRectReadOnly,
        },
      ]);
    });

    await waitFor(() => {
      expect(
        within(desktopRail).getByTestId('homepage-phone-state-listen')
      ).toBeInTheDocument();
    });

    expect(
      container.querySelector(
        '[data-testid="homepage-desktop-phone-rail"] [data-testid="homepage-phone-state-listen"]'
      )
    ).toBeTruthy();
  });

  it('keeps the strongest active scene when later callbacks only update weaker overlaps', async () => {
    render(<HomeAdaptiveProfileStory proofAvailability='hidden' />);

    const desktopRail = screen.getByTestId('homepage-desktop-phone-rail');
    const strongestScene = screen.getByTestId(
      'homepage-story-scene-when-its-out'
    );
    const weakerScene = screen.getByTestId(
      'homepage-story-scene-before-the-drop'
    );

    await waitFor(() => {
      expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0);
    });

    const observer = MockIntersectionObserver.instances.at(-1);

    act(() => {
      observer?.emit([
        {
          target: strongestScene,
          isIntersecting: true,
          intersectionRatio: 0.72,
          boundingClientRect: {
            top: 18,
          } as DOMRectReadOnly,
        },
      ]);
    });

    await waitFor(() => {
      expect(
        within(desktopRail).getByTestId('homepage-phone-state-listen')
      ).toBeInTheDocument();
    });

    act(() => {
      observer?.emit([
        {
          target: weakerScene,
          isIntersecting: true,
          intersectionRatio: 0.21,
          boundingClientRect: {
            top: -24,
          } as DOMRectReadOnly,
        },
      ]);
    });

    await waitFor(() => {
      expect(
        within(desktopRail).getByTestId('homepage-phone-state-listen')
      ).toBeInTheDocument();
    });
  });

  it('renders one shared phone instance for the mobile story rail', () => {
    render(<HomeAdaptiveProfileStory proofAvailability='hidden' />);

    const mobileRail = screen.getByTestId('homepage-mobile-phone-rail');
    expect(
      within(mobileRail).getAllByTestId('homepage-phone-state-default')
    ).toHaveLength(1);
  });

  it('selects the intersecting scene closest to the focus line', () => {
    const scenes: ObservedSceneState[] = [
      {
        sceneId: 'one-link',
        isIntersecting: true,
        intersectionRatio: 0.45,
        top: 74,
      },
      {
        sceneId: 'when-its-out',
        isIntersecting: true,
        intersectionRatio: 0.7,
        top: 8,
      },
      {
        sceneId: 'support',
        isIntersecting: false,
        intersectionRatio: 0.9,
        top: -18,
      },
    ];

    expect(selectActiveSceneId(scenes, 'one-link')).toBe('when-its-out');
  });
});
