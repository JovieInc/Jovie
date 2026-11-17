import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const state = vi.hoisted(() => ({ marketingAllowed: true }));

vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => (
    <script data-testid='next-script' {...props} />
  ),
}));

vi.mock('@/lib/env-client', () => ({
  env: { IS_TEST: false, IS_E2E: false },
}));

vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => false,
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return {
    ...original,
    isMarketingAllowed: () => state.marketingAllowed,
  };
});

import { MetaPixel } from './MetaPixel';

type FbqMock = ((...args: unknown[]) => void) & { queue?: unknown[][] };
type MetaWindow = {
  fbq?: FbqMock;
  _fbq?: FbqMock;
  __jovieMetaPixelInited?: Set<string>;
};

describe('MetaPixel certificate', () => {
  beforeEach(() => {
    state.marketingAllowed = true;
    globalThis.JVConsent = undefined;
    const metaWindow = globalThis.window as MetaWindow;
    delete metaWindow.fbq;
    delete metaWindow._fbq;
    delete metaWindow.__jovieMetaPixelInited;
  });

  it('loads the pixel script with consent and stays axe-clean', async () => {
    const { container } = render(<MetaPixel pixelIds={['px-cert', '']} />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="next-script"]')
      ).toHaveAttribute('id', 'meta-fbevents-loader')
    );
    const queue = (globalThis.window as MetaWindow).fbq?.queue ?? [];
    expect(queue).toContainEqual(['init', 'px-cert']);
    expect(queue).not.toContainEqual(['init', '']);
    await expectNoA11yViolations(container);
  });

  it('renders nothing without marketing consent', async () => {
    state.marketingAllowed = false;
    const { container } = render(<MetaPixel pixelIds={['px-cert']} />);

    expect(container).toBeEmptyDOMElement();
    expect((globalThis.window as MetaWindow).fbq).toBeUndefined();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when no pixel id is configured', async () => {
    const { container } = render(<MetaPixel pixelIds={[]} />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
