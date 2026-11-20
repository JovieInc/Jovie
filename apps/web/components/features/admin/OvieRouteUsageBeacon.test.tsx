import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

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

  it('counts one view per Ovie route and renders nothing', async () => {
    pathnameMock.mockReturnValue('/app/ov/shipping');
    const { container } = render(<OvieRouteUsageBeacon />);
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
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

  it('swallows a failed beacon and still renders nothing', async () => {
    pathnameMock.mockReturnValue('/app/ov/shipping');
    const rejected = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', rejected);
    const { container } = render(
      <main>
        <h1>Shipping</h1>
        <OvieRouteUsageBeacon />
      </main>
    );
    await vi.waitFor(() => expect(rejected).toHaveBeenCalledTimes(1));
    expect(container.querySelector('main')).toHaveTextContent('Shipping');
    expect(container.querySelector('main')?.children).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
