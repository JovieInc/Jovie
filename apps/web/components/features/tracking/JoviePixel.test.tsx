import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JoviePixel } from './JoviePixel';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  sendBeacon: vi.fn(),
}));

const pixelWindow = globalThis as typeof globalThis & {
  joviePixel?: { getSessionId?: () => string };
};

vi.mock('@/lib/queries/useTrackingMutation', () => ({
  useTrackingMutation: () => ({ mutate: mocks.mutate }),
}));

vi.mock('@/lib/tracking/consent', () => ({
  getOrCreateAcquisitionId: () => 'acq-123',
  getOrCreateSessionId: () => 'session-123',
  isTrackingAllowed: () => true,
}));

describe('JoviePixel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mutate.mockClear();
    mocks.sendBeacon.mockReset();
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: mocks.sendBeacon,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete pixelWindow.joviePixel;
  });

  it('includes the acquisition identity in the initial page view', () => {
    mocks.sendBeacon.mockReturnValue(true);
    render(<JoviePixel profileId='profile-123' />);

    act(() => vi.advanceTimersByTime(100));

    expect(mocks.sendBeacon).toHaveBeenCalledWith('/api/px', expect.any(Blob));
    expect(pixelWindow.joviePixel?.getSessionId?.()).toBe('session-123');
  });

  it('falls back to the mutation and tracks annotated link clicks', () => {
    mocks.sendBeacon.mockReturnValue(false);
    const { container } = render(
      <>
        <JoviePixel profileId='profile-123' />
        <a
          data-track-link
          data-link-id='spotify'
          href='https://open.spotify.com/artist/example'
        >
          Listen
        </a>
      </>
    );

    fireEvent.click(container.querySelector('a') as HTMLAnchorElement);

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionId: 'acq-123',
        eventType: 'link_click',
        profileId: 'profile-123',
        sessionId: 'session-123',
      })
    );
  });
});
