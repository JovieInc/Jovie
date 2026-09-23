import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: true }));
vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: gate }));

const mockPage = vi.fn();
const mockTrack = vi.fn();

vi.mock('@/lib/analytics', () => ({
  page: (...args: unknown[]) => mockPage(...args),
  track: (...args: unknown[]) => mockTrack(...args),
}));

import { HomepageCertifiedExposure } from '@/components/homepage/HomepageCertifiedExposure';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';

describe('HomepageCertifiedExposure', () => {
  beforeEach(() => {
    gate.WAITLIST_ENABLED = true;
    mockPage.mockClear();
    mockTrack.mockClear();
  });

  it('emits search exposure when the waitlist is disabled', () => {
    gate.WAITLIST_ENABLED = false;
    render(<HomepageCertifiedExposure />);
    expect(mockTrack).toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.SEARCH_EXPOSED,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
    expect(mockTrack).not.toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.ACCESS_EXPOSED,
      expect.anything()
    );
  });

  it('renders nothing visible', () => {
    const { container } = render(<HomepageCertifiedExposure />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires one exposure receipt and access-exposed event with the variant identity', () => {
    render(<HomepageCertifiedExposure />);

    expect(mockPage).toHaveBeenCalledTimes(1);
    expect(mockPage).toHaveBeenCalledWith('home', HOMEPAGE_CERTIFIED_CONTEXT);
    expect(mockTrack).toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
    expect(mockTrack).toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.ACCESS_EXPOSED,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
    expect(mockTrack).toHaveBeenCalledTimes(2);
  });
});
