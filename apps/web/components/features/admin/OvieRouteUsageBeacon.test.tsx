import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }));

import { OvieRouteUsageBeacon } from './OvieRouteUsageBeacon';

describe('OvieRouteUsageBeacon', () => {
  const fetchMock = vi.fn(async () => new Response('{}'));
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('counts one view per Ovie route and renders nothing', () => {
    pathnameMock.mockReturnValue('/app/ov/shipping');
    const { container } = render(<OvieRouteUsageBeacon />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/hud/route-usage',
      expect.objectContaining({ method: 'POST', keepalive: true })
    );
  });

  it('ignores non-Ovie paths', () => {
    pathnameMock.mockReturnValue('/app/settings');
    render(<OvieRouteUsageBeacon />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
