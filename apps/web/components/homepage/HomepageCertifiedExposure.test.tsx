import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    mockPage.mockClear();
    mockTrack.mockClear();
  });

  it('renders nothing visible', () => {
    const { container } = render(<HomepageCertifiedExposure />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires one exposure receipt and search-exposed event with the variant identity', () => {
    render(<HomepageCertifiedExposure />);

    expect(mockPage).toHaveBeenCalledTimes(1);
    expect(mockPage).toHaveBeenCalledWith('home', HOMEPAGE_CERTIFIED_CONTEXT);
    expect(mockTrack).toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
    expect(mockTrack).toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.SEARCH_EXPOSED,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
    expect(mockTrack).toHaveBeenCalledTimes(2);
  });
});
