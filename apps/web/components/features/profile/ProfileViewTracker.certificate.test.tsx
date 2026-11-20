import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileViewTracker } from './ProfileViewTracker';

const { mockTrack, mockMutate } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockMutate: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

vi.mock('@/lib/queries/useTrackingMutation', () => ({
  useTrackingMutation: () => ({ mutate: mockMutate }),
}));

function setSendBeacon(value: unknown) {
  Object.defineProperty(navigator, 'sendBeacon', {
    value,
    writable: true,
    configurable: true,
  });
}

// The tracker renders nothing in every state, so the evidence is that the
// profile around it stays clean when the view beacon cannot be sent.
describe('ProfileViewTracker: certificate states', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    mockMutate.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSendBeacon(undefined);
  });

  it('falls back to the tracking mutation when the browser refuses the beacon offline', async () => {
    setSendBeacon(vi.fn(() => false));
    const { container } = render(
      <section aria-label='Some Artist'>
        <h1>Some Artist</h1>
        <ProfileViewTracker handle='someartist' artistId='artist-1' />
      </section>
    );

    expect(mockTrack).toHaveBeenCalledWith(
      'profile_view',
      expect.objectContaining({ handle: 'someartist', artist_id: 'artist-1' })
    );
    expect(mockMutate).toHaveBeenCalledWith({ handle: 'someartist' });
    expect(container.querySelector('section')?.children).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('records the view once per mount even when rerendered', async () => {
    setSendBeacon(vi.fn(() => true));
    const { container, rerender } = render(
      <ProfileViewTracker handle='someartist' artistId='artist-1' />
    );
    rerender(<ProfileViewTracker handle='someartist' artistId='artist-1' />);

    expect(
      mockTrack.mock.calls.filter(([name]) => name === 'profile_view')
    ).toHaveLength(1);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
