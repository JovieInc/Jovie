import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const state = vi.hoisted(() => ({
  pathname: '/pricing' as string | null,
  pixelId: 'instantly-px-1' as string | undefined,
}));

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/env-client', () => ({ env: { IS_TEST: false, IS_E2E: false } }));
vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    get NEXT_PUBLIC_INSTANTLY_PIXEL_ID() {
      return state.pixelId;
    },
  },
}));
vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => false,
}));
vi.mock('@/lib/tracking/consent', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return { ...original, isMarketingAllowed: () => true };
});

import { InstantlyPixel } from './InstantlyPixel';

describe('InstantlyPixel certificate', () => {
  beforeEach(() => {
    state.pathname = '/pricing';
    state.pixelId = 'instantly-px-1';
    globalThis.JVConsent = undefined;
  });

  afterEach(() => {
    delete document.documentElement.dataset.instantlyRuntime;
  });

  it('renders no markup on an allowed route and records the isolation state', async () => {
    const { container } = render(<InstantlyPixel />);

    expect(container).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(document.documentElement.dataset.instantlyRuntime).toBe(
        'disabled-vendor-runtime-isolation'
      )
    );
    await expectNoA11yViolations(container);
  });

  it('stays silent on a route outside the allowlist and clears its state on unmount', async () => {
    state.pathname = '/signin';
    const { container, unmount } = render(<InstantlyPixel />);

    await waitFor(() =>
      expect(document.documentElement.dataset.instantlyRuntime).toBe(
        'suppressed-route'
      )
    );
    await expectNoA11yViolations(container);
    unmount();
    expect(document.documentElement.dataset.instantlyRuntime).toBeUndefined();
  });
});
