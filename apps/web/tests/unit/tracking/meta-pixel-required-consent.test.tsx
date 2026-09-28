import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { MetaPixel } from '@/features/tracking/MetaPixel';

type MetaWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  _fbq?: (...args: unknown[]) => void;
  __jovieMetaPixelInited?: Set<string>;
};

function setConsentRequiredCookie() {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value: 'jv_cc_required=1',
  });
}

describe('MetaPixel required-region consent gate', () => {
  beforeEach(() => {
    setConsentRequiredCookie();
    localStorage.clear();
    globalThis.JVConsent = undefined;
    const pixelWindow = globalThis.window as MetaWindow;
    delete pixelWindow.fbq;
    delete pixelWindow._fbq;
    delete pixelWindow.__jovieMetaPixelInited;
  });

  afterEach(() => cleanup());

  it('enables Meta only after a mounted pixel observes affirmative consent', async () => {
    const listeners = new Set<(value: unknown) => void>();
    globalThis.JVConsent = {
      onChange(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      _emit(value) {
        listeners.forEach(listener => listener(value));
      },
      openModal: vi.fn(),
    };

    const { container } = render(<MetaPixel pixelIds={['123']} />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="next-script"]')).toBeNull();
      expect((globalThis.window as MetaWindow).fbq).toBeUndefined();
    });

    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: false, marketing: true })
    );
    act(() => {
      globalThis.JVConsent?._emit({
        essential: true,
        analytics: false,
        marketing: true,
      });
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="next-script"]')
      ).not.toBeNull();
      expect((globalThis.window as MetaWindow).fbq).toBeDefined();
    });
  });

  it('keeps Meta suppressed after reject-all consent is emitted', async () => {
    const listeners = new Set<(value: unknown) => void>();
    globalThis.JVConsent = {
      onChange(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      _emit(value) {
        listeners.forEach(listener => listener(value));
      },
      openModal: vi.fn(),
    };

    const { container } = render(<MetaPixel pixelIds={['123']} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="next-script"]')).toBeNull();
    });

    const rejectAll = { essential: true, analytics: false, marketing: false };
    localStorage.setItem('jv_cc', JSON.stringify(rejectAll));
    act(() => globalThis.JVConsent?._emit(rejectAll));

    await waitFor(() => {
      expect(container.querySelector('[data-testid="next-script"]')).toBeNull();
      expect((globalThis.window as MetaWindow).fbq).toBeUndefined();
    });
  });
});
