import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtistProfileModeSwitcher } from '@/components/marketing/artist-profile/ArtistProfileModeSwitcher';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

const reducedMotionMock = vi.hoisted(() => ({ value: false }));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reducedMotionMock.value,
}));

let intersectionCallback: IntersectionObserverCallback | undefined;
const observeMock = vi.fn();
const disconnectMock = vi.fn();

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0.35];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe = observeMock;
  unobserve = vi.fn();
  disconnect = disconnectMock;
  takeRecords = () => [];
}

function triggerIntersection(isIntersecting: boolean) {
  act(() => {
    intersectionCallback?.(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
  });
}

function expectSelectedTab(name: string) {
  expect(screen.getByRole('tab', { name })).toHaveAttribute(
    'aria-selected',
    'true'
  );
}

describe('ArtistProfileModeSwitcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotionMock.value = false;
    intersectionCallback = undefined;
    observeMock.mockClear();
    disconnectMock.mockClear();
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the accessible two-stage release-to-tour cadence in the scheduled mode IDs after the section intersects', () => {
    render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    expect(observeMock).toHaveBeenCalledTimes(1);
    expectSelectedTab('Upcoming Release');

    triggerIntersection(false);
    act(() => vi.advanceTimersByTime(1500));
    expectSelectedTab('Upcoming Release');

    triggerIntersection(true);
    act(() => vi.advanceTimersByTime(220));
    expectSelectedTab('Upcoming Release');

    act(() => vi.advanceTimersByTime(1100));
    expectSelectedTab('Touring');

    act(() => vi.advanceTimersByTime(5000));
    expectSelectedTab('Touring');
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('lets a manual choice cancel the automatic sequence', () => {
    render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    triggerIntersection(true);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Live Support' }), {
      button: 0,
      ctrlKey: false,
    });
    expectSelectedTab('Live Support');

    act(() => vi.advanceTimersByTime(3000));
    expectSelectedTab('Live Support');
  });

  it('keeps all four accessible modes in one reserved panel slot', () => {
    render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    const panelSlot = screen.getByRole('tabpanel').parentElement;
    expect(panelSlot).toHaveClass('min-h-28');

    for (const mode of ARTIST_PROFILE_COPY.adaptive.modes) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: mode.label }), {
        button: 0,
        ctrlKey: false,
      });
      expectSelectedTab(mode.label);
      expect(screen.getByRole('tabpanel').parentElement).toBe(panelSlot);
    }
  });

  it('stops automatic selection when keyboard focus enters the tabs', () => {
    render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    triggerIntersection(true);
    fireEvent.focus(screen.getByRole('tab', { name: 'Upcoming Release' }));
    act(() => vi.advanceTimersByTime(3000));

    expectSelectedTab('Upcoming Release');
  });

  it('does not autoplay when reduced motion is requested', () => {
    reducedMotionMock.value = true;
    render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    triggerIntersection(true);
    act(() => vi.advanceTimersByTime(3000));

    expectSelectedTab('Upcoming Release');
  });

  it('keeps compact consumers descriptive and interactive', () => {
    render(
      <ArtistProfileModeSwitcher
        adaptive={ARTIST_PROFILE_COPY.adaptive}
        phoneCaption='One profile.'
        phoneSubcaption='Adapts to every fan.'
        showIntroHeading={false}
      />
    );

    expect(
      screen.getByText('One profile. Adapts to every fan.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: ARTIST_PROFILE_COPY.adaptive.headline,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: ARTIST_PROFILE_COPY.adaptive.modes[0].screenshotAlt,
      })
    ).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Release Day' }), {
      button: 0,
      ctrlKey: false,
    });
    expectSelectedTab('Release Day');
    expect(
      screen.getByRole('img', {
        name: ARTIST_PROFILE_COPY.adaptive.modes[1].screenshotAlt,
      })
    ).toBeInTheDocument();
  });

  it('disconnects its observer and clears scheduled work on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    triggerIntersection(true);
    unmount();

    expect(disconnectMock).toHaveBeenCalled();
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    clearTimeoutSpy.mockRestore();
  });
});
